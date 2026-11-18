from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from .models import DiaryEntry, Journey, JourneyBreak, UserSettings
from datetime import timedelta

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name")
        read_only_fields = ("id", "username")


class JourneySerializer(serializers.ModelSerializer):
    progress = serializers.SerializerMethodField()
    remaining_seconds = serializers.SerializerMethodField()
    elapsed_seconds = serializers.SerializerMethodField()
    distance_meters = serializers.SerializerMethodField()
    break_remaining_seconds = serializers.SerializerMethodField()
    breaks = serializers.SerializerMethodField()
    diary_count = serializers.SerializerMethodField()
    planned_breaks = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = Journey
        fields = ("id", "title", "description", "starting_station", "destination_station",
                  "duration_minutes", "started_at", "expected_arrival_at", "completed_at",
                  "status", "progress", "remaining_seconds", "elapsed_seconds", "distance_meters",
                  "break_seconds", "break_remaining_seconds", "breaks", "planned_breaks", "route_seed", "diary_count", "created_at")
        read_only_fields = ("id", "started_at", "expected_arrival_at", "completed_at", "break_seconds", "route_seed", "created_at")

    def validate(self, attrs):
        for key in ("title", "starting_station", "destination_station"):
            if key in attrs and not attrs[key].strip():
                raise serializers.ValidationError({key: "This field cannot be blank."})
        planned = attrs.get("planned_breaks", [])
        duration = attrs.get("duration_minutes", getattr(self.instance, "duration_minutes", None))
        if planned and duration < 60:
            raise serializers.ValidationError({"planned_breaks": "Breaks require a journey of at least 60 minutes."})
        if len(planned) > 8:
            raise serializers.ValidationError({"planned_breaks": "Choose no more than eight breaks."})
        positions = []
        for item in planned:
            if set(item) != {"at_minutes", "duration_minutes"} or any(type(value) is not int for value in item.values()):
                raise serializers.ValidationError({"planned_breaks": "Each break needs integer at_minutes and duration_minutes."})
            at, length = item["at_minutes"], item["duration_minutes"]
            if not 1 <= at < duration or not 1 <= length <= 120 or at in positions:
                raise serializers.ValidationError({"planned_breaks": "Break positions must be unique and within the journey; duration must be 1–120 minutes."})
            positions.append(at)
        return attrs

    def create(self, validated_data):
        planned = validated_data.pop("planned_breaks", [])
        journey = Journey.objects.create(**validated_data)
        if planned:
            JourneyBreak.objects.bulk_create([
                JourneyBreak(journey=journey, at_seconds=item["at_minutes"] * 60,
                             duration_seconds=item["duration_minutes"] * 60)
                for item in planned])
            journey.expected_arrival_at += timedelta(minutes=sum(item["duration_minutes"] for item in planned))
            journey.save(update_fields=["expected_arrival_at"])
        return journey

    def validate_duration_minutes(self, value):
        if not 1 <= value <= 43200:
            raise serializers.ValidationError("Choose 1 to 43,200 minutes.")
        return value

    def get_progress(self, obj):
        return obj.progress()

    def get_remaining_seconds(self, obj):
        if obj.status == Journey.Status.COMPLETED:
            return 0
        return max(0, round(obj.duration_minutes * 60 - obj.elapsed_seconds()))

    def get_elapsed_seconds(self, obj):
        return round(obj.elapsed_seconds())

    def get_distance_meters(self, obj):
        return round(min(obj.duration_minutes * 100, obj.elapsed_seconds() * 100 / 60), 2)

    def get_break_remaining_seconds(self, obj):
        return max(0, round((obj.break_ends_at - timezone.now()).total_seconds())) if obj.status == Journey.Status.BREAK else 0

    def get_breaks(self, obj):
        return [{"id": item.id, "at_minutes": item.at_seconds // 60,
                 "duration_minutes": item.duration_seconds // 60, "status": item.status,
                 "started_at": item.started_at, "ended_at": item.ended_at}
                for item in obj.breaks.all()]

    def get_diary_count(self, obj):
        return obj.diary_entries.count()


class DiarySerializer(serializers.ModelSerializer):
    journey_title = serializers.CharField(source="journey.title", read_only=True)

    class Meta:
        model = DiaryEntry
        fields = ("id", "journey", "journey_title", "title", "content", "created_at", "updated_at")
        read_only_fields = ("id", "journey_title", "created_at", "updated_at")

    def validate_journey(self, journey):
        if journey.user_id != self.context["request"].user.id:
            raise serializers.ValidationError("Journey not found.")
        return journey


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = ("reduced_motion", "ambient_particles", "weather_effects", "animation_intensity", "preferred_volume", "music_muted", "atmosphere", "crisp_pixels", "language", "ambience_enabled", "ambience_volume", "ambience_muted", "train_horn", "weather_sounds", "atmospheric_events")
