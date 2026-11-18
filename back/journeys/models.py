from datetime import timedelta
import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db import transaction
from django.utils import timezone


def new_route_seed():
    return uuid.uuid4().hex


class Journey(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        BREAK = "break", "Station break"
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
    break_seconds = models.PositiveIntegerField(default=0)
    break_started_at = models.DateTimeField(null=True, blank=True)
    break_ends_at = models.DateTimeField(null=True, blank=True)
    route_seed = models.CharField(max_length=32, default=new_route_seed)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=models.Q(duration_minutes__gte=1) & models.Q(duration_minutes__lte=43200), name="journey_valid_duration"),
            models.UniqueConstraint(fields=["user"], condition=models.Q(status__in=["active", "paused", "break"]), name="one_live_journey_per_user"),
        ]

    def save(self, *args, **kwargs):
        if not self.expected_arrival_at:
            self.expected_arrival_at = self.started_at + timedelta(minutes=self.duration_minutes)
        super().save(*args, **kwargs)

    def elapsed_seconds(self, now=None):
        now = now or timezone.now()
        end = self.completed_at or self.paused_at or self.break_started_at or now
        return max(0, (end - self.started_at).total_seconds() - self.paused_seconds - self.break_seconds)

    def progress(self, now=None):
        if self.status == self.Status.COMPLETED:
            return 100
        return min(100, round(self.elapsed_seconds(now) / (self.duration_minutes * 60) * 100, 2))

    def reconcile(self, now=None):
        now = now or timezone.now()
        if self.status not in (self.Status.ACTIVE, self.Status.BREAK):
            return
        with transaction.atomic():
            while True:
                if self.status == self.Status.BREAK:
                    if now < self.break_ends_at:
                        break
                    current = self.breaks.select_for_update().get(status=JourneyBreak.Status.ACTIVE)
                    current.status = JourneyBreak.Status.COMPLETED
                    current.ended_at = self.break_ends_at
                    current.save(update_fields=["status", "ended_at"])
                    self.break_seconds += current.duration_seconds
                    self.break_started_at = None
                    self.break_ends_at = None
                    self.status = self.Status.ACTIVE
                    self.save(update_fields=["break_seconds", "break_started_at", "break_ends_at", "status"])
                    continue
                pending = self.breaks.filter(status=JourneyBreak.Status.PENDING).order_by("at_seconds", "id").first()
                if pending:
                    threshold = self.started_at + timedelta(seconds=self.paused_seconds + self.break_seconds + pending.at_seconds)
                    if now >= threshold:
                        pending.status = JourneyBreak.Status.ACTIVE
                        pending.started_at = threshold
                        pending.save(update_fields=["status", "started_at"])
                        self.status = self.Status.BREAK
                        self.break_started_at = threshold
                        self.break_ends_at = threshold + timedelta(seconds=pending.duration_seconds)
                        self.save(update_fields=["status", "break_started_at", "break_ends_at"])
                        continue
                if now >= self.expected_arrival_at:
                    self.status = self.Status.COMPLETED
                    self.completed_at = self.expected_arrival_at
                    self.save(update_fields=["status", "completed_at"])
                break


class JourneyBreak(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"

    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="breaks")
    at_seconds = models.PositiveIntegerField()
    duration_seconds = models.PositiveIntegerField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["at_seconds", "id"]
        constraints = [models.UniqueConstraint(fields=["journey", "at_seconds"], name="unique_journey_break_position")]


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
