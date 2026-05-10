from django.contrib import admin

from .models import AMLAuditLog, AMLRule, AMLSettings, FlaggedOperation


@admin.register(AMLSettings)
class AMLSettingsAdmin(admin.ModelAdmin):
    list_display = ("company", "is_enabled", "learning_mode", "flag_threshold", "auto_block_threshold")


@admin.register(AMLRule)
class AMLRuleAdmin(admin.ModelAdmin):
    list_display = ("company", "rule_code", "name", "category", "is_enabled", "weight")
    list_filter = ("company", "category", "is_enabled")


@admin.register(FlaggedOperation)
class FlaggedOperationAdmin(admin.ModelAdmin):
    list_display = ("company", "operation_type", "risk_score", "status", "created_at")
    list_filter = ("status", "operation_type", "company")
    readonly_fields = ("payload", "triggered_rules")


@admin.register(AMLAuditLog)
class AMLAuditLogAdmin(admin.ModelAdmin):
    list_display = ("company", "actor", "action", "timestamp", "ip_address")
    list_filter = ("action", "company")
    readonly_fields = ("details",)
