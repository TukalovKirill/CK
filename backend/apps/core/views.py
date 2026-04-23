from django.conf import settings
from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import OutstandingToken, RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .mixins import BroadcastMixin
from .models import (
    Company,
    CustomUser,
    Department,
    Employee,
    EmployeeAssignment,
    Invite,
    InviteAssignment,
    OrgPermission,
    OrgRole,
    Unit,
    Zone,
)
from .permissions import (
    get_subordinate_role_ids,
    require_permission,
    require_read_write,
    scope_queryset_by_unit,
)
from .serializers import (
    AcceptInviteSerializer,
    CompanySerializer,
    DepartmentOrgSerializer,
    EmployeeAssignmentBulkSerializer,
    EmployeeAssignmentSerializer,
    EmployeeSerializer,
    InviteCreateSerializer,
    InviteSerializer,
    OrgPermissionListSerializer,
    OrgRoleCreateSerializer,
    OrgRoleSerializer,
    RegisterSerializer,
    UnitSerializer,
    UserSerializer,
    ZoneSerializer,
)


# --- Auth ---


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "email"


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class CustomTokenRefreshView(TokenRefreshView):
    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except CustomUser.DoesNotExist:
            return Response(
                {"detail": "Пользователь не найден", "code": "user_not_found"},
                status=401,
            )


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = RegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=201,
        )


class AcceptInviteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = AcceptInviteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = ser.save()
        return Response({"status": "ok", **result}, status=201)


class CheckDevView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        user = authenticate(
            request, email=request.data.get("email"), password=request.data.get("password")
        )
        if user and user.is_superuser:
            companies = Company.objects.values("id", "name")
            return Response({"is_dev": True, "companies": list(companies)})
        return Response({"is_dev": False})


class DevContextOptionsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        user = authenticate(
            request, email=request.data.get("email"), password=request.data.get("password")
        )
        if not user or not user.is_superuser:
            return Response({"detail": "Unauthorized"}, status=403)

        company_id = request.data.get("company_id")
        if not company_id:
            return Response({"detail": "company_id required"}, status=400)

        units = Unit.objects.filter(company_id=company_id).values("id", "name")
        departments = Department.objects.filter(company_id=company_id).values("id", "name", "unit_id")
        roles = OrgRole.objects.filter(company_id=company_id).values(
            "id", "title", "code", "department_id"
        )

        return Response({
            "units": list(units),
            "departments": list(departments),
            "roles": list(roles),
        })


class MeViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        data = UserSerializer(request.user).data
        if getattr(request, "dev_context", None):
            pass
        return Response(data)


# --- Company ---


class CompanyViewSet(viewsets.ModelViewSet):
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        if self.request.user.is_superuser:
            return Company.objects.all()
        return Company.objects.filter(id=self.request.user.company_id)


# --- Unit ---


class UnitViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "unit"
    serializer_class = UnitSerializer
    permission_classes = [require_read_write("org.view", "org.manage")]
    pagination_class = None

    def get_queryset(self):
        return Unit.objects.filter(company=self.request.user.company).prefetch_related("departments")

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        ids = request.data.get("ids", [])
        for i, uid in enumerate(ids):
            Unit.objects.filter(id=uid, company=request.user.company).update(sort_order=i)
        self._broadcast("updated")
        return Response({"status": "ok"})


# --- Department ---


class DepartmentViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "department"
    serializer_class = DepartmentOrgSerializer
    permission_classes = [require_read_write("org.view", "org.manage")]
    pagination_class = None

    def get_queryset(self):
        qs = Department.objects.filter(company=self.request.user.company).select_related("unit")
        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        ids = request.data.get("ids", [])
        for i, did in enumerate(ids):
            Department.objects.filter(id=did, company=request.user.company).update(sort_order=i)
        self._broadcast("updated")
        return Response({"status": "ok"})


# --- OrgRole ---


class OrgRoleViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "org_role"
    permission_classes = [require_read_write("org.view", "org.roles_manage")]
    pagination_class = None

    def get_serializer_class(self):
        if self.action == "create":
            return OrgRoleCreateSerializer
        return OrgRoleSerializer

    def get_queryset(self):
        qs = (
            OrgRole.objects.filter(company=self.request.user.company)
            .exclude(code="developer")
            .select_related("department", "department__unit", "parent_role")
            .prefetch_related("permissions", "child_roles")
        )
        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(department__unit_id=unit_id)
        department_id = self.request.query_params.get("department")
        if department_id:
            qs = qs.filter(department_id=department_id)
        parent_id = self.request.query_params.get("parent_role")
        if parent_id:
            qs = qs.filter(parent_role_id=parent_id)
        return qs

    def perform_update(self, serializer):
        if serializer.instance.is_system:
            return Response(
                {"detail": "Системные роли нельзя редактировать."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save()

    def perform_destroy(self, instance):
        if instance.is_system:
            return Response(
                {"detail": "Системные роли нельзя удалить."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.delete()

    @action(detail=False, methods=["get"])
    def hierarchy(self, request):
        roles = list(
            self.get_queryset().select_related("department", "department__unit", "parent_role")
        )
        units = Unit.objects.filter(company=request.user.company).order_by("name")
        departments = Department.objects.filter(company=request.user.company).select_related("unit")

        result = []
        for unit in units:
            unit_depts = []
            for dept in departments:
                if dept.unit_id != unit.id:
                    continue
                dept_roles = [r for r in roles if r.department_id == dept.id]
                unit_depts.append({
                    "department_id": dept.id,
                    "department_name": dept.name,
                    "roles": [
                        {
                            "id": r.id, "title": r.title, "code": r.code,
                            "level": r.level, "is_system": r.is_system,
                            "parent_role_id": r.parent_role_id,
                        }
                        for r in dept_roles
                    ],
                })
            result.append({
                "unit_id": unit.id, "unit_name": unit.name, "departments": unit_depts,
            })

        roles_no_dept = [r for r in roles if r.department_id is None]
        if roles_no_dept:
            result.append({
                "unit_id": None,
                "unit_name": "Общие роли",
                "departments": [],
                "roles_without_department": [
                    {
                        "id": r.id, "title": r.title, "code": r.code,
                        "level": r.level, "is_system": r.is_system,
                        "parent_role_id": r.parent_role_id,
                    }
                    for r in roles_no_dept
                ],
            })
        return Response(result)

    @action(detail=False, methods=["get"])
    def assignable(self, request):
        subordinate_ids = get_subordinate_role_ids(request.user)
        qs = (
            OrgRole.objects.filter(company=request.user.company, is_assignable=True)
            .exclude(code="developer")
            .select_related("department", "department__unit", "parent_role")
            .prefetch_related("permissions", "child_roles")
        )
        if subordinate_ids is not None:
            qs = qs.filter(id__in=subordinate_ids)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


# --- OrgPermission ---


class OrgPermissionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrgPermissionListSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        from .permissions import _get_user_permission_codes

        codes = _get_user_permission_codes(self.request.user)
        qs = OrgPermission.objects.all().order_by("id")
        if codes is not None:
            qs = qs.filter(code__in=codes)
        return qs


# --- Employee ---


class EmployeeViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "employee"
    serializer_class = EmployeeSerializer
    permission_classes = [require_read_write(None, "team.manage")]

    def get_queryset(self):
        qs = Employee.objects.filter(
            company=self.request.user.company
        ).select_related("user", "org_role").prefetch_related("assignments__org_role", "assignments__unit")

        subordinate_ids = get_subordinate_role_ids(self.request.user)
        if subordinate_ids is not None:
            qs = qs.filter(assignments__org_role_id__in=subordinate_ids)

        qs = scope_queryset_by_unit(qs, self.request.user, "team.view", unit_field="assignments__unit_id")

        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(assignments__unit_id=unit_id)

        return qs.distinct()

    def perform_destroy(self, instance):
        Invite.objects.filter(company=instance.company, email=instance.user.email).delete()
        user = instance.user
        instance.delete()
        if user:
            OutstandingToken.objects.filter(user=user).delete()
            user.delete()


# --- EmployeeAssignment ---


class EmployeeAssignmentViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "employee_assignment"
    serializer_class = EmployeeAssignmentSerializer
    permission_classes = [require_read_write("team.view", "team.manage")]

    def get_queryset(self):
        return EmployeeAssignment.objects.filter(
            employee__company=self.request.user.company
        ).select_related("unit", "department", "org_role")

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        ser = EmployeeAssignmentBulkSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        employee = ser.validated_data["employee"]
        created = []
        for a_data in ser.validated_data["assignments"]:
            obj, was_created = EmployeeAssignment.objects.get_or_create(
                employee=employee,
                unit=a_data["unit"],
                org_role=a_data["org_role"],
                defaults={"department": a_data.get("department")},
            )
            if was_created:
                employee.units.add(a_data["unit"])
                created.append(obj)
        self._broadcast("created")
        return Response(
            EmployeeAssignmentSerializer(created, many=True).data,
            status=status.HTTP_201_CREATED,
        )


# --- Invite ---


class InviteViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "invite"
    serializer_class = InviteSerializer
    permission_classes = [require_read_write("team.view", "team.manage")]

    def get_queryset(self):
        return (
            Invite.objects.filter(
                company=self.request.user.company,
                status="pending",
                expires_at__gt=timezone.now(),
            )
            .select_related("org_role", "unit", "department")
            .prefetch_related("invite_assignments__unit", "invite_assignments__org_role")
        )

    @transaction.atomic
    def perform_create(self, serializer):
        data = InviteCreateSerializer(data=self.request.data, context={"request": self.request})
        data.is_valid(raise_exception=True)
        vd = data.validated_data

        Invite.objects.filter(
            company=self.request.user.company,
            email__iexact=vd["email"],
            status__in=["pending", "revoked", "expired"],
        ).delete()

        invite = Invite.objects.create(
            company=self.request.user.company,
            invited_by=self.request.user,
            email=vd["email"],
            first_name=vd.get("first_name", ""),
            last_name=vd.get("last_name", ""),
            grade=vd.get("grade", 0),
            token=Invite.make_token(),
            expires_at=Invite.default_expire(),
        )

        for a_data in vd.get("assignments", []):
            InviteAssignment.objects.create(
                invite=invite,
                unit=a_data["unit"],
                department=a_data.get("department"),
                org_role=a_data["org_role"],
            )

        invite_url = f"{settings.FRONTEND_URL}/accept-invite?token={invite.token}"
        try:
            from django.core.mail import send_mail

            send_mail(
                subject="Приглашение в команду",
                message=f"Перейдите по ссылке: {invite_url}",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[invite.email],
                fail_silently=True,
            )
            invite.sent_at = timezone.now()
            invite.save(update_fields=["sent_at"])
        except Exception:
            pass

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        invite = self.get_object()
        invite.expires_at = Invite.default_expire()
        invite.save(update_fields=["expires_at"])

        invite_url = f"{settings.FRONTEND_URL}/accept-invite?token={invite.token}"
        try:
            from django.core.mail import send_mail

            send_mail(
                subject="Приглашение в команду (повтор)",
                message=f"Перейдите по ссылке: {invite_url}",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[invite.email],
                fail_silently=True,
            )
            invite.sent_at = timezone.now()
            invite.save(update_fields=["sent_at"])
        except Exception:
            pass
        return Response({"status": "ok"})

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        invite = self.get_object()
        if invite.status != "pending":
            return Response(
                {"detail": "Можно отозвать только ожидающие приглашения."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invite.status = "revoked"
        invite.save(update_fields=["status"])
        self._broadcast("updated", invite.pk)
        return Response({"status": "ok"})


# --- Zone ---


class ZoneViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "zone"
    serializer_class = ZoneSerializer
    permission_classes = [require_read_write(None, "org.manage")]
    pagination_class = None

    def get_queryset(self):
        qs = Zone.objects.filter(company=self.request.user.company)
        dept_id = self.request.query_params.get("department")
        if dept_id:
            qs = qs.filter(department_id=dept_id)
        role_id = self.request.query_params.get("org_role")
        if role_id:
            qs = qs.filter(org_role_id=role_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)
