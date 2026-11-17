from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import DiaryEntry, Journey, UserSettings

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
    status = serializers.CharField(read_only=True)

    class Meta:
        model = Journey
        fields = ("id", "title", "description", "starting_station", "destination_station",
                  "duration_minutes", "started_at", "expected_arrival_at", "completed_at",
                  "status", "progress", "remaining_seconds", "elapsed_seconds", "created_at")
        read_only_fields = ("id", "started_at", "expected_arrival_at", "completed_at", "created_at")

    def validate(self, attrs):
        for key in ("title", "starting_station", "destination_station"):
            if key in attrs and not attrs[key].strip():
                raise serializers.ValidationError({key: "This field cannot be blank."})
        return attrs

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
        fields = ("reduced_motion", "ambient_particles", "weather_effects", "animation_intensity", "preferred_volume", "music_muted", "atmosphere", "crisp_pixels", "language", "ambience_enabled", "ambience_volume", "ambience_muted", "train_horn", "weather_sounds")
