from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AMLAuditLog, AMLRule, AMLSettings, FlaggedOperation
from .permissions import CanManageAMLSettings, CanReviewFlagged
from .serializers import (
    AMLAuditLogSerializer,
    AMLRuleSerializer,
    AMLSettingsSerializer,
    FlaggedOperationDetailSerializer,
    FlaggedOperationListSerializer,
    ReviewFlaggedSerializer,
)


def _get_client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class AMLSettingsView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [CanReviewFlagged()]
        return [CanManageAMLSettings()]

    def get(self, request):
        company = request.user.company
        settings_obj, _ = AMLSettings.objects.get_or_create(company=company)
        return Response(AMLSettingsSerializer(settings_obj).data)

    def put(self, request):
        company = request.user.company
        settings_obj, _ = AMLSettings.objects.get_or_create(company=company)
        serializer = AMLSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        AMLAuditLog.objects.create(
            company=company,
            actor=request.user,
            action=AMLAuditLog.Action.SETTINGS_CHANGED,
            ip_address=_get_client_ip(request),
            details={"changes": request.data},
        )
        return Response(serializer.data)


class AMLRuleViewSet(viewsets.ModelViewSet):
    serializer_class = AMLRuleSerializer
    permission_classes = [CanManageAMLSettings]
    http_method_names = ["get", "patch"]
    pagination_class = None

    def get_queryset(self):
        return AMLRule.objects.filter(company=self.request.user.company)

    def perform_update(self, serializer):
        instance = serializer.save()
        AMLAuditLog.objects.create(
            company=self.request.user.company,
            actor=self.request.user,
            action=AMLAuditLog.Action.RULE_CHANGED,
            ip_address=_get_client_ip(self.request),
            details={
                "rule_code": instance.rule_code,
                "changes": self.request.data,
            },
        )


class FlaggedOperationViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [CanReviewFlagged]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return FlaggedOperationDetailSerializer
        return FlaggedOperationListSerializer

    def get_queryset(self):
        qs = FlaggedOperation.objects.filter(company=self.request.user.company)

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        op_type = self.request.query_params.get("operation_type")
        if op_type:
            qs = qs.filter(operation_type=op_type)

        min_risk = self.request.query_params.get("min_risk")
        if min_risk:
            qs = qs.filter(risk_score__gte=float(min_risk))

        date_from = self.request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = self.request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        return qs.select_related("initiated_by", "target_employee")

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        AMLAuditLog.objects.create(
            flagged_operation=instance,
            company=request.user.company,
            actor=request.user,
            action=AMLAuditLog.Action.VIEWED,
            ip_address=_get_client_ip(request),
        )
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        instance = self.get_object()
        if instance.status != FlaggedOperation.Status.PENDING:
            return Response(
                {"detail": "Операция уже рассмотрена"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ReviewFlaggedSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        comment = serializer.validated_data.get("comment", "")

        if new_status == "approved":
            from .executor import execute_approved_operation
            try:
                execute_approved_operation(instance)
            except Exception as exc:
                return Response(
                    {"detail": f"Не удалось выполнить операцию: {exc}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        instance.status = new_status
        instance.reviewed_by = request.user
        instance.reviewed_at = timezone.now()
        instance.review_comment = comment
        instance.save(update_fields=[
            "status", "reviewed_by", "reviewed_at", "review_comment",
        ])

        audit_action = (
            AMLAuditLog.Action.APPROVED
            if new_status == "approved"
            else AMLAuditLog.Action.REJECTED
        )
        AMLAuditLog.objects.create(
            flagged_operation=instance,
            company=request.user.company,
            actor=request.user,
            action=audit_action,
            ip_address=_get_client_ip(request),
            details={"comment": comment},
        )

        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"company_{instance.company_id}_updates",
                {
                    "type": "broadcast_message",
                    "entity": "aml_flagged",
                    "action": "updated",
                    "id": instance.pk,
                    "status": instance.status,
                    "user_id": request.user.pk,
                },
            )
        except Exception:
            pass

        return Response(FlaggedOperationDetailSerializer(instance).data)

    @action(detail=True, methods=["get"])
    def audit(self, request, pk=None):
        instance = self.get_object()
        logs = AMLAuditLog.objects.filter(flagged_operation=instance)
        serializer = AMLAuditLogSerializer(logs, many=True)
        return Response(serializer.data)


class AMLStatsView(APIView):
    permission_classes = [CanReviewFlagged]

    def get(self, request):
        company = request.user.company
        qs = FlaggedOperation.objects.filter(company=company)
        stats = qs.aggregate(
            pending=Count("id", filter=Q(status="pending")),
            approved=Count("id", filter=Q(status="approved")),
            rejected=Count("id", filter=Q(status="rejected")),
            total=Count("id"),
        )

        today = timezone.now().date()
        today_stats = qs.filter(created_at__date=today).aggregate(
            today_pending=Count("id", filter=Q(status="pending")),
            today_total=Count("id"),
        )

        return Response({**stats, **today_stats})


class AMLAuditLogView(APIView):
    permission_classes = [CanReviewFlagged]

    def get(self, request):
        company = request.user.company
        qs = AMLAuditLog.objects.filter(company=company).select_related("actor")

        action_filter = request.query_params.get("action")
        if action_filter:
            qs = qs.filter(action=action_filter)

        qs = qs[:100]
        serializer = AMLAuditLogSerializer(qs, many=True)
        return Response(serializer.data)
