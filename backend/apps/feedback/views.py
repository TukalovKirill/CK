from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import CreateModelMixin, DestroyModelMixin, ListModelMixin
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.core.mixins import BroadcastMixin
from apps.core.models import Unit
from apps.core.permissions import (
    _is_full_access,
    get_user_unit_ids,
    has_org_permission,
    require_permission,
)

from .models import StaffWish
from .notifications import notify_wish_reply
from .serializers import StaffWishSerializer, StaffWishSubmitSerializer


class StaffWishViewSet(BroadcastMixin, ListModelMixin, CreateModelMixin, DestroyModelMixin, GenericViewSet):
    serializer_class = StaffWishSerializer
    broadcast_entity = "staff_wish"

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated(), require_permission("feedback.submit_wish")()]
        if self.action == "destroy":
            return [IsAuthenticated(), require_permission("feedback.edit")()]
        if self.action == "reply":
            return [IsAuthenticated(), require_permission("feedback.view_wishes")()]
        return [IsAuthenticated(), require_permission("feedback.view_wishes")()]

    def get_queryset(self):
        user = self.request.user
        qs = StaffWish.objects.filter(company=user.company).select_related(
            "unit", "replied_by__employee_profile"
        )

        if not _is_full_access(user) and not has_org_permission(user, "feedback.view_all"):
            unit_ids = get_user_unit_ids(user, "feedback.view_wishes")
            if unit_ids is not None:
                qs = qs.filter(unit_id__in=unit_ids)

        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)

        return qs.order_by("-created_at")

    def create(self, request, *args, **kwargs):
        serializer = StaffWishSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        user = request.user

        try:
            unit = Unit.objects.get(id=data["unit_id"], company=user.company)
        except Unit.DoesNotExist:
            return Response(
                {"detail": "Юнит не найден."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wish = StaffWish.objects.create(
            company=user.company,
            unit=unit,
            author=user,
            text=data["text"],
        )

        self._broadcast("created", wish.id)
        return Response({"detail": "Пожелание отправлено."}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="reply")
    def reply(self, request, pk=None):
        wish = self.get_object()
        text = (request.data.get("text") or "").strip()

        if not text:
            return Response(
                {"detail": "Текст ответа обязателен."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not wish.author:
            return Response(
                {"detail": "Автор пожелания неизвестен — ответить невозможно."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wish.reply_text = text
        wish.replied_by = request.user
        wish.replied_at = timezone.now()
        wish.save(update_fields=["reply_text", "replied_by", "replied_at"])

        notify_wish_reply(wish)
        self._broadcast("updated", wish.id)

        return Response(StaffWishSerializer(wish).data)
