from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Journey


class ApplicationTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="traveler", password="StrongPass!234")
        self.other = get_user_model().objects.create_user(username="other", password="StrongPass!234")
        self.client.force_authenticate(self.user)

    def create_journey(self, **extra):
        payload = {"title": "A chapter", "starting_station": "Home", "destination_station": "Done", "duration_minutes": 60, **extra}
        return self.client.post("/api/journeys/", payload, format="json")

    def test_journey_validation_permissions_and_pause(self):
        self.assertEqual(self.create_journey(duration_minutes=0).status_code, 400)
        self.assertEqual(self.create_journey(duration_minutes=43201).status_code, 400)
        response = self.create_journey()
        self.assertEqual(response.status_code, 201)
        pk = response.data["id"]
        self.assertEqual(self.client.post(f"/api/journeys/{pk}/pause/").data["status"], "paused")
        paused = Journey.objects.get(pk=pk)
        paused.paused_at = timezone.now() - timedelta(minutes=5)
        paused.save(update_fields=["paused_at"])
        resumed = self.client.post(f"/api/journeys/{pk}/resume/")
        self.assertEqual(resumed.data["status"], "active")
        self.assertGreaterEqual(Journey.objects.get(pk=pk).paused_seconds, 299)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/journeys/{pk}/").status_code, 404)
        self.assertEqual(self.client.post(f"/api/journeys/{pk}/complete/").status_code, 404)

    def test_only_one_live_journey_and_expired_journey_reconciles_on_create(self):
        first = self.create_journey()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(self.create_journey().status_code, 400)
        self.client.post(f"/api/journeys/{first.data['id']}/pause/")
        self.assertEqual(self.create_journey().status_code, 400)
        self.client.post(f"/api/journeys/{first.data['id']}/resume/")
        old = Journey.objects.get(pk=first.data["id"])
        old.expected_arrival_at = timezone.now() - timedelta(seconds=1)
        old.save(update_fields=["expected_arrival_at"])
        self.assertEqual(self.create_journey().status_code, 201)
        old.refresh_from_db()
        self.assertEqual(old.status, Journey.Status.COMPLETED)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.create_journey().status_code, 201)

    def test_elapsed_time_completion_and_statistics(self):
        response = self.create_journey(duration_minutes=1)
        journey = Journey.objects.get(pk=response.data["id"])
        journey.started_at = timezone.now() - timedelta(minutes=3)
        journey.expected_arrival_at = journey.started_at + timedelta(minutes=1)
        journey.save(update_fields=["started_at", "expected_arrival_at"])
        details = self.client.get(f"/api/journeys/{journey.pk}/")
        self.assertEqual(details.data["status"], "completed")
        self.assertEqual(details.data["progress"], 100)
        self.assertEqual(details.data["remaining_seconds"], 0)
        stats = self.client.get("/api/statistics/").data
        self.assertEqual(stats["completed_journeys"], 1)
        self.assertEqual(stats["completed_duration_minutes"], 1)
        self.assertEqual(stats["total_travel_seconds"], 60)
        self.assertEqual(stats["completed_travel_seconds"], 60)
        self.assertEqual(stats["completion_rate"], 100)

    def test_diary_crud_and_cross_user_protection(self):
        journey_id = self.create_journey().data["id"]
        created = self.client.post("/api/diary/", {"journey": journey_id, "title": "A note", "content": "A quiet mile."}, format="json")
        self.assertEqual(created.status_code, 201)
        entry_id = created.data["id"]
        self.assertEqual(self.client.get("/api/diary/?search=quiet").data["count"], 1)
        self.assertEqual(self.client.patch(f"/api/diary/{entry_id}/", {"content": "A bright mile."}, format="json").data["content"], "A bright mile.")
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/diary/{entry_id}/").status_code, 404)
        self.assertEqual(self.client.post("/api/diary/", {"journey": journey_id, "title": "Spy", "content": "No"}).status_code, 400)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.delete(f"/api/diary/{entry_id}/").status_code, 204)

    def test_settings_persist(self):
        self.assertEqual(self.client.patch("/api/settings/", {"reduced_motion": True, "weather_effects": False, "animation_intensity": "gentle", "preferred_volume": 67}).status_code, 200)
        self.assertEqual(self.client.get("/api/settings/").data["preferred_volume"], 67)
        self.assertEqual(self.client.get("/api/settings/").data["weather_effects"], False)
        self.assertEqual(self.client.get("/api/settings/").data["animation_intensity"], "gentle")
        self.assertEqual(self.client.patch("/api/settings/", {"animation_intensity": "broken"}).status_code, 400)
