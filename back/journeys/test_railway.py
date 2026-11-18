from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Journey, JourneyBreak


class RailwayTimeTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("railway")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def create(self, breaks=None, duration=120):
        response = self.client.post('/api/journeys/', {
            'title': 'Railway', 'starting_station': 'A', 'destination_station': 'B',
            'duration_minutes': duration, 'planned_breaks': breaks or [],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return Journey.objects.get(pk=response.data['id'])

    def test_scheduled_break_and_offline_reconciliation(self):
        journey = self.create([{'at_minutes': 60, 'duration_minutes': 10}])
        start = journey.started_at
        journey.reconcile(start + timedelta(minutes=65))
        journey.refresh_from_db()
        self.assertEqual(journey.status, Journey.Status.BREAK)
        self.assertEqual(journey.elapsed_seconds(start + timedelta(minutes=65)), 3600)
        self.assertEqual(round(journey.elapsed_seconds(start + timedelta(minutes=65)) * 100 / 60), 6000)
        journey.reconcile(start + timedelta(minutes=71))
        journey.refresh_from_db()
        self.assertEqual(journey.status, Journey.Status.ACTIVE)
        self.assertEqual(journey.break_seconds, 600)
        self.assertEqual(journey.breaks.get().status, JourneyBreak.Status.COMPLETED)
        self.assertEqual(journey.elapsed_seconds(start + timedelta(minutes=71)), 3660)
        journey.reconcile(start + timedelta(minutes=130))
        journey.refresh_from_db()
        self.assertEqual(journey.status, Journey.Status.COMPLETED)
        self.assertEqual(journey.elapsed_seconds(), 7200)

    def test_early_break_consumes_plan_without_duplicate(self):
        journey = self.create([{'at_minutes': 60, 'duration_minutes': 10}])
        response = self.client.post(f'/api/journeys/{journey.pk}/station-break/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'break')
        self.assertEqual(self.client.post(f'/api/journeys/{journey.pk}/station-break/', {}, format='json').status_code, 400)
        journey.refresh_from_db()
        start = journey.break_started_at
        journey.reconcile(start + timedelta(minutes=11))
        journey.refresh_from_db()
        self.assertEqual(journey.status, Journey.Status.ACTIVE)
        self.assertFalse(journey.breaks.filter(status='pending').exists())
        self.assertEqual(journey.break_seconds, 600)

    def test_invalid_plans_and_legacy_journey(self):
        invalid = self.client.post('/api/journeys/', {
            'title': 'Short', 'starting_station': 'A', 'destination_station': 'B',
            'duration_minutes': 30, 'planned_breaks': [{'at_minutes': 10, 'duration_minutes': 5}],
        }, format='json')
        self.assertEqual(invalid.status_code, 400)
        journey = self.create(duration=30)
        self.assertEqual(journey.breaks.count(), 0)
        self.assertEqual(journey.expected_arrival_at, journey.started_at + timedelta(minutes=30))

    def test_pause_resume_shifts_break_threshold_without_distance_gain(self):
        journey = self.create([{'at_minutes': 60, 'duration_minutes': 10}])
        now = timezone.now()
        journey.started_at = now - timedelta(minutes=50)
        journey.expected_arrival_at = journey.started_at + timedelta(minutes=130)
        journey.paused_at = now - timedelta(minutes=10)
        journey.status = Journey.Status.PAUSED
        journey.save()
        self.assertAlmostEqual(journey.elapsed_seconds(now), 40 * 60, delta=1)

        response = self.client.post(f'/api/journeys/{journey.pk}/resume/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        journey = Journey.objects.get(pk=journey.pk)  # Reconstruct after an application restart.
        self.assertEqual(journey.status, Journey.Status.ACTIVE)
        self.assertAlmostEqual(journey.elapsed_seconds(now), 40 * 60, delta=2)
        journey.reconcile(now + timedelta(minutes=19))
        self.assertEqual(journey.status, Journey.Status.ACTIVE)
        journey.reconcile(now + timedelta(minutes=21))
        self.assertEqual(journey.status, Journey.Status.BREAK)
        self.assertAlmostEqual(journey.elapsed_seconds(now + timedelta(minutes=21)), 60 * 60, delta=2)

