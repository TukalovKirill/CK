from django.urls import re_path

from .consumers import CompanyUpdatesConsumer

websocket_urlpatterns = [
    re_path(r"ws/updates/$", CompanyUpdatesConsumer.as_asgi()),
]
