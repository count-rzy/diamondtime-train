from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import JsonResponse
from rest_framework.authentication import BaseAuthentication, SessionAuthentication

from .models import LocalContext


def local_context():
    with transaction.atomic():
        context = LocalContext.objects.select_related("owner").first()
        if context:
            return context
        owner = get_user_model().objects.order_by("id").first()
        if owner is None:
            owner = get_user_model().objects.create_user(username="traveler", first_name="Traveler", password=None)
        return LocalContext.objects.create(pk=1, owner=owner)


class LocalAuthentication(BaseAuthentication):
    def authenticate(self, request):
        # DRF normally skips CSRF for anonymous visitors; enforce it here.
        SessionAuthentication().enforce_csrf(request)
        return local_context().owner, None


class LoopbackMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = request.get_host()
        if request.META.get("REMOTE_ADDR") not in ("127.0.0.1", "::1"):
            return JsonResponse({"detail": "Loopback connections only."}, status=403)
        origin = request.headers.get("Origin")
        if origin and origin != f"http://{host}":
            return JsonResponse({"detail": "External origins are not allowed."}, status=403)
        if request.headers.get("Sec-Fetch-Site") == "cross-site":
            return JsonResponse({"detail": "Cross-site requests are not allowed."}, status=403)
        response = self.get_response(request)
        response["Cache-Control"] = "no-store" if request.path.startswith("/api/") else "no-cache"
        response["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
        return response
