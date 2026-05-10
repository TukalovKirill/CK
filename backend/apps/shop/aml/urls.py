from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AMLAuditLogView,
    AMLRuleViewSet,
    AMLSettingsView,
    AMLStatsView,
    FlaggedOperationViewSet,
)

router = DefaultRouter()
router.register("flagged", FlaggedOperationViewSet, basename="aml-flagged")
router.register("rules", AMLRuleViewSet, basename="aml-rule")

urlpatterns = [
    path("settings/", AMLSettingsView.as_view(), name="aml-settings"),
    path("stats/", AMLStatsView.as_view(), name="aml-stats"),
    path("audit-log/", AMLAuditLogView.as_view(), name="aml-audit-log"),
] + router.urls
