from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("journeys", views.JourneyViewSet, basename="journey")
router.register("diary", views.DiaryViewSet, basename="diary")

from . import local_views
urlpatterns = [
    path("auth/csrf/", local_views.csrf), path("me/", views.MeView.as_view()),
    path("settings/", views.SettingsView.as_view()), path("statistics/", views.statistics),
    path("local/profiles/", local_views.profiles), path("local/data/", local_views.data_info),
    path("local/backup/", local_views.backup), path("local/export/", local_views.export_data),
    path("audio/", local_views.audio_library), path("audio/<int:pk>/", local_views.audio_file),
    path("", include(router.urls)),
]
