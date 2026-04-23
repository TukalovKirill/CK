from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.mixins import BroadcastMixin
from apps.core.permissions import _is_full_access

from .models import (
    CardAssignment,
    CardParagraph,
    CardPhoto,
    CompanyTextbookSettings,
    TextbookCard,
    TextbookCategory,
    TextbookSection,
)
from .permissions import CanEditTextbooks, CanManageAssignments, CanViewTextbooks
from .permissions_utils import can_assign_card, can_delete_card
from .search import search_cards
from .serializers import (
    CardAssignmentSerializer,
    CardAssignmentWriteSerializer,
    CardParagraphSerializer,
    CardPhotoSerializer,
    TextbookCardDetailSerializer,
    TextbookCardListSerializer,
    TextbookCardWriteSerializer,
    TextbookCategorySerializer,
    TextbookCategoryWriteSerializer,
    TextbookSectionSerializer,
    TextbookSectionWriteSerializer,
    TextbookSettingsSerializer,
    validate_image_file,
)


class TextbookSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        company = request.user.company
        if not company:
            return Response({"enabled": False})
        settings_obj = getattr(company, "textbook_settings", None)
        if settings_obj is None:
            return Response({"enabled": False})
        return Response(TextbookSettingsSerializer(settings_obj).data)


class TextbookSectionViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "textbook_section"
    pagination_class = None

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [CanViewTextbooks()]
        return [CanEditTextbooks()]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return TextbookSectionWriteSerializer
        return TextbookSectionSerializer

    def get_queryset(self):
        qs = TextbookSection.objects.filter(company=self.request.user.company)
        if not _is_full_access(self.request.user):
            from apps.core.permissions import get_user_unit_ids

            unit_ids = get_user_unit_ids(self.request.user, "textbooks.view")
            if unit_ids is not None:
                qs = qs.filter(units__id__in=unit_ids)
        return qs.distinct()

    def perform_create(self, serializer):
        section = serializer.save(company=self.request.user.company)
        emp = getattr(self.request.user, "employee_profile", None)
        if emp:
            user_units = emp.assignments.values_list("unit_id", flat=True)
            section.units.add(*user_units)


class TextbookCategoryViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "textbook_category"
    pagination_class = None

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [CanViewTextbooks()]
        return [CanEditTextbooks()]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return TextbookCategoryWriteSerializer
        return TextbookCategorySerializer

    def get_queryset(self):
        qs = TextbookCategory.objects.filter(section__company=self.request.user.company)
        section_id = self.request.query_params.get("section")
        if section_id:
            qs = qs.filter(section_id=section_id)
        return qs


class TextbookCardViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "textbook_card"
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "my_available"):
            return [CanViewTextbooks()]
        return [CanEditTextbooks()]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TextbookCardDetailSerializer
        if self.action in ("create", "update", "partial_update"):
            return TextbookCardWriteSerializer
        return TextbookCardListSerializer

    def get_queryset(self):
        qs = TextbookCard.objects.filter(
            company=self.request.user.company
        ).prefetch_related("tags", "photos")

        section_id = self.request.query_params.get("section")
        if section_id:
            qs = qs.filter(section_id=section_id)

        category_id = self.request.query_params.get("category")
        if category_id:
            qs = qs.filter(category_id=category_id)

        return qs

    def perform_create(self, serializer):
        card = serializer.save()
        if card.section:
            for unit in card.section.units.all():
                CardAssignment.objects.get_or_create(card=card, unit=unit)

    def destroy(self, request, *args, **kwargs):
        card = self.get_object()
        if not can_delete_card(request.user, card):
            return Response(
                {"detail": "Нет прав на удаление."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="my-available")
    def my_available(self, request):
        unit_id = request.query_params.get("unit")
        if _is_full_access(request.user):
            qs = TextbookCard.objects.filter(company=request.user.company, is_active=True)
            if unit_id:
                qs = qs.filter(assignments__unit_id=unit_id)
        else:
            emp = getattr(request.user, "employee_profile", None)
            if not emp:
                return Response([])
            from apps.core.models import EmployeeAssignment

            assignments = EmployeeAssignment.objects.filter(employee=emp)
            if unit_id:
                assignments = assignments.filter(unit_id=unit_id)

            user_unit_ids = set(assignments.values_list("unit_id", flat=True))
            user_dept_ids = set(
                assignments.exclude(department__isnull=True).values_list("department_id", flat=True)
            )
            user_role_ids = set(assignments.values_list("org_role_id", flat=True))

            from django.db.models import Q

            qs = TextbookCard.objects.filter(
                company=request.user.company,
                is_active=True,
            ).filter(
                Q(assignments__unit_id__in=user_unit_ids, assignments__department__isnull=True, assignments__org_role__isnull=True)
                | Q(assignments__department_id__in=user_dept_ids, assignments__org_role__isnull=True)
                | Q(assignments__org_role_id__in=user_role_ids)
            )

        qs = qs.distinct().prefetch_related("tags", "photos")
        serializer = TextbookCardListSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        items = request.data.get("items", [])
        for item in items:
            TextbookCard.objects.filter(
                id=item["id"], company=request.user.company
            ).update(order=item["order"])
        self._broadcast("updated")
        return Response({"status": "ok"})


class CardParagraphViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "textbook_card"
    serializer_class = CardParagraphSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    permission_classes = [CanEditTextbooks]

    def get_queryset(self):
        return CardParagraph.objects.filter(card__company=self.request.user.company)

    @action(detail=True, methods=["post"], url_path="upload-photo")
    def upload_photo(self, request, pk=None):
        paragraph = self.get_object()
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "Файл не передан"}, status=400)
        try:
            validate_image_file(file)
        except Exception as e:
            return Response({"detail": str(e)}, status=400)
        paragraph.photo = file
        paragraph.save(update_fields=["photo"])
        return Response(CardParagraphSerializer(paragraph, context={"request": request}).data)

    @action(detail=True, methods=["delete"], url_path="delete-photo")
    def delete_photo(self, request, pk=None):
        paragraph = self.get_object()
        if paragraph.photo:
            paragraph.photo.delete()
            paragraph.photo = None
            paragraph.save(update_fields=["photo"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CardPhotoViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "textbook_card"
    serializer_class = CardPhotoSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [CanEditTextbooks]

    def get_queryset(self):
        qs = CardPhoto.objects.filter(card__company=self.request.user.company)
        card_id = self.request.query_params.get("card")
        if card_id:
            qs = qs.filter(card_id=card_id)
        return qs


class CardAssignmentViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "textbook_card"
    http_method_names = ["get", "post", "delete"]
    permission_classes = [CanManageAssignments]

    def get_serializer_class(self):
        if self.action == "create":
            return CardAssignmentWriteSerializer
        return CardAssignmentSerializer

    def get_queryset(self):
        qs = CardAssignment.objects.filter(
            card__company=self.request.user.company
        ).select_related("unit", "department", "org_role")
        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        card_id = self.request.query_params.get("card")
        if card_id:
            qs = qs.filter(card_id=card_id)
        return qs

    def perform_create(self, serializer):
        data = serializer.validated_data
        if not can_assign_card(
            self.request.user,
            data["unit"].id,
            data.get("department", {}).id if data.get("department") else None,
        ):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Нет прав на назначение в этот юнит/департамент.")
        serializer.save(assigned_by=self.request.user)

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        unit_id = request.data.get("unit")
        department_id = request.data.get("department")
        if not unit_id:
            return Response({"detail": "unit обязателен"}, status=400)
        qs = CardAssignment.objects.filter(card__company=request.user.company, unit_id=unit_id)
        if department_id:
            qs = qs.filter(department_id=department_id)
        count = qs.count()
        qs.delete()
        self._broadcast("deleted")
        return Response({"deleted": count})


class SearchView(APIView):
    permission_classes = [CanViewTextbooks]

    def get(self, request):
        q = request.query_params.get("q", "")
        qs = TextbookCard.objects.filter(company=request.user.company, is_active=True)
        section_id = request.query_params.get("section")
        if section_id:
            qs = qs.filter(section_id=section_id)
        results = search_cards(qs, q)
        return Response(results)
