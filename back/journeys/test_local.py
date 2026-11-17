import io
import json
import sqlite3
import tempfile
import wave
import zipfile
from contextlib import closing
from datetime import timedelta
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection, connections
from django.db.migrations.executor import MigrationExecutor
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from journeys.local import local_context
from journeys.models import Journey, LocalContext
from local_data import create_backup, integrity, restore_backup


class LocalWorkflowTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.token = self.client.get('/api/auth/csrf/').json()['csrf_token']

    def post(self, url, data):
        return self.client.post(url, data=json.dumps(data), content_type='application/json', HTTP_X_CSRFTOKEN=self.token)

    def journey(self):
        return self.post('/api/journeys/', {'title': 'Offline', 'starting_station': 'Home', 'destination_station': 'Done', 'duration_minutes': 60})

    def test_first_run_anonymous_crud_and_persistence(self):
        self.assertEqual(LocalContext.objects.count(), 1)
        self.assertFalse(local_context().owner.has_usable_password())
        response = self.journey()
        self.assertEqual(response.status_code, 201)
        pk = response.json()['id']
        self.assertEqual(self.journey().status_code, 400)
        entry = self.post('/api/diary/', {'journey': pk, 'title': 'Note', 'content': 'Persisted text'})
        self.assertEqual(entry.status_code, 201)
        fresh = Client()
        self.assertEqual(fresh.get('/api/diary/?search=Persisted').json()['count'], 1)
        self.assertEqual(fresh.get('/api/journeys/').json()['count'], 1)
        self.assertEqual(fresh.get('/api/statistics/').json()['diary_entries'], 1)

    def test_csrf_origin_host_and_loopback_protection(self):
        self.assertEqual(self.client.post('/api/journeys/', {}).status_code, 403)
        self.assertEqual(self.client.get('/api/me/', HTTP_ORIGIN='https://evil.example').status_code, 403)
        self.assertEqual(self.client.get('/api/me/', HTTP_SEC_FETCH_SITE='cross-site').status_code, 403)
        self.assertEqual(self.client.get('/api/me/', REMOTE_ADDR='192.168.1.2').status_code, 403)
        self.assertEqual(self.client.get('/api/me/', HTTP_HOST='evil.example').status_code, 400)
        for endpoint in ('login', 'register', 'refresh', 'logout'):
            self.assertEqual(self.post(f'/api/auth/{endpoint}/', {}).status_code, 404)

    def test_language_audio_preferences_and_cyrillic_persist_for_fresh_client(self):
        defaults = self.client.get('/api/settings/').json()
        self.assertEqual(defaults['language'], 'ru')
        self.assertTrue(defaults['ambience_enabled'])
        values = {'language': 'en', 'ambience_volume': 17, 'preferred_volume': 62,
                  'ambience_muted': True, 'music_muted': False, 'train_horn': False, 'weather_sounds': False}
        response = self.client.patch('/api/settings/', data=json.dumps(values), content_type='application/json', HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 200)
        saved = Client().get('/api/settings/').json()
        for key, value in values.items():
            self.assertEqual(saved[key], value)
        for invalid in ({'language': 'xx'}, {'ambience_volume': 101}, {'preferred_volume': -1}):
            self.assertEqual(self.client.patch('/api/settings/', data=json.dumps(invalid), content_type='application/json', HTTP_X_CSRFTOKEN=self.token).status_code, 400)
        title, content = 'Поезд в Ереван — Dawn', 'Тихое утро. Ёжик и поезд 🚂'
        self.assertEqual(self.post('/api/diary/', {'journey': self.journey().json()['id'], 'title': title, 'content': content}).status_code, 201)
        found = Client().get('/api/diary/', {'search': 'Ёжик'}).json()['results']
        self.assertEqual(found[0]['title'], title)
        self.assertEqual(found[0]['content'], content)

    def test_legacy_profiles_retain_ownership(self):
        for invalid in ('abc', {}, -1, None):
            self.assertEqual(self.post('/api/local/profiles/', {'id': invalid}).status_code, 400)
        first = self.journey().json()
        owner = local_context().owner_id
        other = get_user_model().objects.create_user('legacy', password=None)
        self.assertEqual(self.post('/api/local/profiles/', {'id': other.pk}).status_code, 200)
        self.assertEqual(self.client.get('/api/journeys/').json()['count'], 0)
        self.post('/api/local/profiles/', {'id': owner})
        self.assertEqual(self.client.get('/api/journeys/').json()['results'][0]['id'], first['id'])

    def test_clock_sleep_restart_pause_and_backward_change(self):
        pk = self.journey().json()['id']
        Journey.objects.filter(pk=pk).update(started_at=timezone.now()-timedelta(hours=2), expected_arrival_at=timezone.now()-timedelta(hours=1))
        self.assertEqual(Client().get(f'/api/journeys/{pk}/').json()['status'], 'completed')
        pk = self.journey().json()['id']
        self.post(f'/api/journeys/{pk}/pause/', {})
        Journey.objects.filter(pk=pk).update(paused_at=timezone.now()+timedelta(minutes=2))
        self.assertEqual(self.post(f'/api/journeys/{pk}/resume/', {}).status_code, 200)
        self.assertGreaterEqual(Journey.objects.get(pk=pk).paused_seconds, 0)

    def test_audio_import_invalid_missing_range_and_traversal(self):
        with tempfile.TemporaryDirectory() as temporary, override_settings(MEDIA_ROOT=Path(temporary)):
            invalid = SimpleUploadedFile('bad.mp3', b'not audio at all', 'audio/mpeg')
            self.assertEqual(self.client.post('/api/audio/', {'file': invalid}, HTTP_X_CSRFTOKEN=self.token).status_code, 400)
            stream = io.BytesIO()
            with wave.open(stream, 'wb') as audio:
                audio.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
                audio.writeframes(b'\0\0'*8000)
            valid = SimpleUploadedFile('../../tone.wav', stream.getvalue(), 'audio/wav')
            response = self.client.post('/api/audio/', {'file': valid}, HTTP_X_CSRFTOKEN=self.token)
            self.assertEqual(response.status_code, 200)
            url = response.json()[0]['url']
            media = self.client.get(url, HTTP_RANGE='bytes=0-15')
            self.assertEqual(media.status_code, 206)
            self.assertEqual(len(b''.join(media.streaming_content)), 16)
            for file in Path(temporary).iterdir():
                self.assertEqual(file.parent, Path(temporary))
                file.unlink()
            self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get('/art/../../back/config/settings.py').status_code, 404)
        self.assertEqual(self.client.get('/assets/missing.js').status_code, 404)
        self.assertEqual(self.client.get('/api/missing/').status_code, 404)


class BackupTests(TransactionTestCase):
    def test_roundtrip_and_malicious_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            data = Path(temporary)
            database = data / 'lasttrain.sqlite3'
            connection.ensure_connection()
            with closing(sqlite3.connect(database)) as copied:
                connection.connection.backup(copied)
                copied.execute("INSERT INTO auth_user (password,is_superuser,username,first_name,last_name,email,is_staff,is_active,date_joined) VALUES ('',0,'saved','','','',0,1,'2026-01-01')")
                copied.commit()
            original = create_backup(data)
            with closing(sqlite3.connect(database)) as edited:
                edited.execute("UPDATE auth_user SET first_name='Changed'")
                edited.commit()
            safety = restore_backup(data, original)
            self.assertTrue(safety.is_file())
            integrity(database)
            with closing(sqlite3.connect(database)) as restored:
                self.assertEqual(restored.execute("SELECT first_name FROM auth_user WHERE username='saved'").fetchone()[0], '')
            malicious = data / 'malicious.zip'
            with zipfile.ZipFile(malicious, 'w') as archive:
                archive.writestr('../outside', 'bad')
            before = database.read_bytes()
            with self.assertRaises(ValueError):
                restore_backup(data, malicious)
            self.assertEqual(database.read_bytes(), before)


class LegacyMigrationTests(TransactionTestCase):
    def test_old_expired_duplicates_keep_records(self):
        executor = MigrationExecutor(connection)
        executor.migrate([('journeys', '0001_initial')])
        old = executor.loader.project_state([('journeys', '0001_initial')]).apps
        user = old.get_model('auth', 'User').objects.create(username='legacy')
        JourneyOld = old.get_model('journeys', 'Journey')
        now = timezone.now()
        for index in range(2):
            JourneyOld.objects.create(user_id=user.pk, title=f'Old {index}', starting_station='A', destination_station='B', duration_minutes=1, started_at=now-timedelta(minutes=2), expected_arrival_at=now-timedelta(minutes=1))
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        self.assertEqual(Journey.objects.filter(user_id=user.pk, status='completed').count(), 2)
        self.assertEqual(local_context().owner_id, user.pk)
