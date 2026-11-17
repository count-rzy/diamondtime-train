from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class Journey(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="journeys")
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True, max_length=2000)
    starting_station = models.CharField(max_length=80)
    destination_station = models.CharField(max_length=80)
    duration_minutes = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(43200)])
    started_at = models.DateTimeField(default=timezone.now)
    expected_arrival_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    paused_seconds = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=models.Q(duration_minutes__gte=1) & models.Q(duration_minutes__lte=43200), name="journey_valid_duration"),
            models.UniqueConstraint(fields=["user"], condition=models.Q(status__in=["active", "paused"]), name="one_live_journey_per_user"),
        ]

    def save(self, *args, **kwargs):
        if not self.expected_arrival_at:
            self.expected_arrival_at = self.started_at + timedelta(minutes=self.duration_minutes)
        super().save(*args, **kwargs)

    def elapsed_seconds(self, now=None):
        now = now or timezone.now()
        end = self.completed_at or self.paused_at or now
        return max(0, (end - self.started_at).total_seconds() - self.paused_seconds)

    def progress(self, now=None):
        if self.status == self.Status.COMPLETED:
            return 100
        return min(100, round(self.elapsed_seconds(now) / (self.duration_minutes * 60) * 100, 2))

    def reconcile(self, now=None):
        now = now or timezone.now()
        if self.status == self.Status.ACTIVE and now >= self.expected_arrival_at:
            self.status = self.Status.COMPLETED
            self.completed_at = self.expected_arrival_at
            self.save(update_fields=["status", "completed_at"])


class DiaryEntry(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="diary_entries")
    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="diary_entries")
    title = models.CharField(max_length=120)
    content = models.TextField(max_length=10000)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


class UserSettings(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="train_settings")
    reduced_motion = models.BooleanField(default=False)
    ambient_particles = models.BooleanField(default=True)
    weather_effects = models.BooleanField(default=True)
    animation_intensity = models.CharField(max_length=8, choices=[("gentle", "Gentle"), ("full", "Full")], default="full")
    preferred_volume = models.PositiveSmallIntegerField(default=45, validators=[MaxValueValidator(100)])
    music_muted = models.BooleanField(default=False)
    atmosphere = models.CharField(max_length=12, default="journey", choices=[(x, x.title()) for x in ("journey", "dawn", "morning", "afternoon", "sunset", "twilight", "night")])
    crisp_pixels = models.BooleanField(default=True)
    language = models.CharField(max_length=2, choices=[("ru", "Русский"), ("en", "English")], default="ru")
    ambience_enabled = models.BooleanField(default=True)
    ambience_volume = models.PositiveSmallIntegerField(default=30, validators=[MaxValueValidator(100)])
    ambience_muted = models.BooleanField(default=False)
    train_horn = models.BooleanField(default=True)
    weather_sounds = models.BooleanField(default=True)


class LocalContext(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)


class AudioTrack(models.Model):
    title = models.CharField(max_length=200)
    filename = models.CharField(max_length=50, unique=True)
    content_type = models.CharField(max_length=30)
    created_at = models.DateTimeField(auto_now_add=True)
