from datetime import timedelta
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import DiaryEntry, Journey, JourneyBreak, UserSettings
from .serializers import DiarySerializer, JourneySerializer, SettingsSerializer, UserSerializer


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class JourneyViewSet(viewsets.ModelViewSet):
    serializer_class = JourneySerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        queryset = Journey.objects.filter(user=self.request.user)
        for journey in queryset.filter(status__in=[Journey.Status.ACTIVE, Journey.Status.BREAK]):
            journey.reconcile()
        status_filter = self.request.query_params.get("status")
        if status_filter in Journey.Status.values:
            queryset = queryset.filter(status=status_filter)
        return queryset

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                # Lock the owner row so two PostgreSQL requests cannot both
                # observe an empty live-journey set before inserting.
                get_user_model().objects.select_for_update().get(pk=self.request.user.pk)
                for journey in Journey.objects.filter(user=self.request.user, status__in=[Journey.Status.ACTIVE, Journey.Status.BREAK]):
                    journey.reconcile()
                if Journey.objects.filter(user=self.request.user, status__in=[Journey.Status.ACTIVE, Journey.Status.PAUSED, Journey.Status.BREAK]).exists():
                    raise ValidationError({"detail": "Finish the current journey before departing again."})
                serializer.save(user=self.request.user)
        except IntegrityError as exc:
            raise ValidationError({"detail": "A journey is already in progress."}) from exc

    def perform_update(self, serializer):
        journey = self.get_object()
        if journey.status != Journey.Status.ACTIVE:
            raise ValidationError("Only active journeys can be edited.")
        if "duration_minutes" in serializer.validated_data:
            raise ValidationError({"duration_minutes": "Duration cannot change after departure."})
        if "planned_breaks" in serializer.validated_data:
            raise ValidationError({"planned_breaks": "Breaks cannot change after departure."})
        serializer.save()

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        with transaction.atomic():
            journey = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
            journey.reconcile()
            if journey.status != Journey.Status.ACTIVE:
                raise ValidationError("Only active journeys can be paused.")
            journey.status = Journey.Status.PAUSED
            journey.paused_at = timezone.now()
            journey.save(update_fields=["status", "paused_at"])
        return Response(self.get_serializer(journey).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        with transaction.atomic():
            journey = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
            if journey.status != Journey.Status.PAUSED:
                raise ValidationError("Only paused journeys can be resumed.")
            now = timezone.now()
            pause = max(now - journey.paused_at, timedelta(0))
            journey.paused_seconds += round(pause.total_seconds())
            journey.expected_arrival_at += pause
            journey.paused_at = None
            journey.status = Journey.Status.ACTIVE
            journey.save(update_fields=["paused_seconds", "expected_arrival_at", "paused_at", "status"])
        return Response(self.get_serializer(journey).data)

    @action(detail=True, methods=["post"], url_path="station-break")
    def station_break(self, request, pk=None):
        with transaction.atomic():
            journey = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
            if journey.status != Journey.Status.ACTIVE:
                raise ValidationError("Only a traveling journey can stop at a station.")
            pending = journey.breaks.select_for_update().filter(status=JourneyBreak.Status.PENDING).order_by("at_seconds").first()
            if not pending:
                raise ValidationError("No planned station break remains.")
            now = timezone.now()
            pending.status = JourneyBreak.Status.ACTIVE
            pending.started_at = now
            pending.save(update_fields=["status", "started_at"])
            journey.status = Journey.Status.BREAK
            journey.break_started_at = now
            journey.break_ends_at = now + timedelta(seconds=pending.duration_seconds)
            journey.save(update_fields=["status", "break_started_at", "break_ends_at"])
        return Response(self.get_serializer(journey).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        with transaction.atomic():
            journey = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
            if journey.status == Journey.Status.COMPLETED:
                raise ValidationError("Journey is already completed.")
            now = timezone.now()
            if journey.paused_at:
                journey.paused_seconds += max(0, round((now - journey.paused_at).total_seconds()))
                journey.paused_at = None
            if journey.status == Journey.Status.BREAK:
                current = journey.breaks.get(status=JourneyBreak.Status.ACTIVE)
                current.status = JourneyBreak.Status.COMPLETED
                current.ended_at = now
                current.save(update_fields=["status", "ended_at"])
                journey.break_seconds += max(0, round((now - journey.break_started_at).total_seconds()))
                journey.break_started_at = None
                journey.break_ends_at = None
            journey.status = Journey.Status.COMPLETED
            journey.completed_at = now
            journey.save(update_fields=["paused_seconds", "paused_at", "break_seconds", "break_started_at", "break_ends_at", "status", "completed_at"])
        return Response(self.get_serializer(journey).data)


class DiaryViewSet(viewsets.ModelViewSet):
    serializer_class = DiarySerializer

    def get_queryset(self):
        queryset = DiaryEntry.objects.filter(user=self.request.user).select_related("journey")
        if self.request.query_params.get("journey"):
            journey_id = self.request.query_params["journey"]
            if not journey_id.isdecimal():
                raise ValidationError({"journey": "Use a numeric journey ID."})
            queryset = queryset.filter(journey_id=journey_id)
        if self.request.query_params.get("search"):
            query = self.request.query_params["search"][:120]
            queryset = queryset.filter(Q(title__icontains=query) | Q(content__icontains=query))
        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@api_view(["GET"])
def statistics(request):
    journeys = list(Journey.objects.filter(user=request.user))
    now = timezone.now()
    for journey in journeys:
        journey.reconcile(now)
    completed = [j for j in journeys if j.status == Journey.Status.COMPLETED]
    total_minutes = sum(j.duration_minutes for j in journeys)
    completed_minutes = sum(min(j.duration_minutes, round(j.elapsed_seconds() / 60)) for j in completed)
    total_travel_seconds = sum(round(j.elapsed_seconds(now)) for j in journeys)
    completed_travel_seconds = sum(round(j.elapsed_seconds(now)) for j in completed)
    entries = DiaryEntry.objects.filter(user=request.user)
    recent = sorted(
        [{"type": "journey", "title": j.title, "at": j.created_at} for j in journeys[:5]] +
        [{"type": "diary", "title": e.title, "at": e.created_at} for e in entries[:5]],
        key=lambda event: event["at"], reverse=True)[:6]
    return Response({"total_journeys": len(journeys), "completed_journeys": len(completed),
                     "active_journeys": sum(j.status != Journey.Status.COMPLETED for j in journeys),
                     "total_duration_minutes": total_minutes, "completed_duration_minutes": completed_minutes,
                     "total_travel_seconds": total_travel_seconds,
                     "completed_travel_seconds": completed_travel_seconds,
                     "average_duration_minutes": round(total_minutes / len(journeys), 1) if journeys else 0,
                     "diary_entries": entries.count(),
                     "completion_rate": round(len(completed) / len(journeys) * 100, 1) if journeys else 0,
                     "recent_activity": recent})


class SettingsView(generics.RetrieveUpdateAPIView):
    serializer_class = SettingsSerializer

    def get_object(self):
        return UserSettings.objects.get_or_create(user=self.request.user)[0]
