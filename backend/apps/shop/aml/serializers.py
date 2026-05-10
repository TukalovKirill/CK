from rest_framework import serializers

from .models import AMLAuditLog, AMLRule, AMLSettings, FlaggedOperation


class AMLSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = AMLSettings
        fields = ("is_enabled", "threshold", "lookback_days")


class AMLRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AMLRule
        fields = (
            "id", "rule_code", "category", "name", "description",
            "is_enabled", "weight", "params", "updated_at",
        )
        read_only_fields = ("rule_code", "category", "name", "description")


class FlaggedOperationListSerializer(serializers.ModelSerializer):
    initiated_by_name = serializers.SerializerMethodField()
    target_employee_name = serializers.SerializerMethodField()
    rules_count = serializers.SerializerMethodField()
    operation_type_display = serializers.CharField(
        source="get_operation_type_display", read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True,
    )

    class Meta:
        model = FlaggedOperation
        fields = (
            "id", "operation_type", "operation_type_display",
            "initiated_by", "initiated_by_name",
            "target_employee", "target_employee_name",
            "risk_score", "status", "status_display",
            "rules_count", "created_at",
        )

    def get_initiated_by_name(self, obj):
        if obj.initiated_by:
            emp = getattr(obj.initiated_by, "employee_profile", None)
            if emp:
                return emp.full_name
            return obj.initiated_by.email
        return None

    def get_target_employee_name(self, obj):
        if obj.target_employee:
            return obj.target_employee.full_name
        return None

    def get_rules_count(self, obj):
        return len(obj.triggered_rules) if obj.triggered_rules else 0


class FlaggedOperationDetailSerializer(FlaggedOperationListSerializer):
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta(FlaggedOperationListSerializer.Meta):
        fields = FlaggedOperationListSerializer.Meta.fields + (
            "payload", "triggered_rules",
            "reviewed_by", "reviewed_by_name",
            "reviewed_at", "review_comment",
            "related_transaction", "related_order",
        )

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            emp = getattr(obj.reviewed_by, "employee_profile", None)
            if emp:
                return emp.full_name
            return obj.reviewed_by.email
        return None


class ReviewFlaggedSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["approved", "rejected"])
    comment = serializers.CharField(required=False, default="")


class AMLAuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    action_display = serializers.CharField(
        source="get_action_display", read_only=True,
    )

    class Meta:
        model = AMLAuditLog
        fields = (
            "id", "actor", "actor_name", "action", "action_display",
            "timestamp", "ip_address", "details",
        )

    def get_actor_name(self, obj):
        if obj.actor:
            emp = getattr(obj.actor, "employee_profile", None)
            if emp:
                return emp.full_name
            return obj.actor.email
        return None
