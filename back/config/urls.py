from django.urls import include, path, re_path
from journeys.local_views import frontend, health
urlpatterns = [path("api/health/", health), path("api/", include("journeys.urls")), re_path(r"^(?P<path>.*)$", frontend)]
