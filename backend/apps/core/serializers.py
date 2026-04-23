from django.contrib.auth import get_user_model
from django.utils.text import slugify
from rest_framework import serializers

from .models import (
    Company,
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

User = get_user_model()


# --- User ---


class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name")


class EmployeeAssignmentSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    org_role_title = serializers.CharField(source="org_role.title", read_only=True)

    class Meta:
        model = EmployeeAssignment
        fields = (
            "id", "employee", "unit", "unit_name",
            "department", "department_name", "org_role", "org_role_title",
        )
        read_only_fields = ("employee",)


class UserSerializer(serializers.ModelSerializer):
    employee_id = serializers.SerializerMethodField()
    org_role_id = serializers.SerializerMethodField()
    org_role_code = serializers.SerializerMethodField()
    org_role_title = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    unit_permissions = serializers.SerializerMethodField()
    can_manage_permissions = serializers.SerializerMethodField()
    birth_date = serializers.SerializerMethodField()
    assignments = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "email", "role", "company", "is_superuser",
            "employee_id", "org_role_id", "org_role_code", "org_role_title",
            "permissions", "unit_permissions", "can_manage_permissions",
            "birth_date", "assignments",
        )

    def _first_assignment_role(self, obj):
        if not hasattr(self, "_first_role_cache"):
            emp = getattr(obj, "employee_profile", None)
            role = None
            if emp:
                a = emp.assignments.select_related("org_role").first()
                if a:
                    role = a.org_role
                elif emp.org_role:
                    role = emp.org_role
            self._first_role_cache = role
        return self._first_role_cache

    def get_employee_id(self, obj):
        emp = getattr(obj, "employee_profile", None)
        return emp.pk if emp else None

    def get_org_role_id(self, obj):
        role = self._first_assignment_role(obj)
        return role.pk if role else None

    def get_org_role_code(self, obj):
        role = self._first_assignment_role(obj)
        return role.code if role else None

    def get_org_role_title(self, obj):
        role = self._first_assignment_role(obj)
        return role.title if role else None

    def get_permissions(self, obj):
        from .permissions import _get_user_permission_codes

        codes = _get_user_permission_codes(obj)
        if codes is None:
            return list(OrgPermission.objects.values_list("code", flat=True))
        return list(codes)

    def get_unit_permissions(self, obj):
        from .permissions import get_user_unit_permissions

        result = get_user_unit_permissions(obj)
        if result is None:
            return None
        return {str(k): list(v) for k, v in result.items()}

    def get_can_manage_permissions(self, obj):
        from .permissions import _user_can_manage_permissions

        return _user_can_manage_permissions(obj)

    def get_birth_date(self, obj):
        emp = getattr(obj, "employee_profile", None)
        if emp and emp.birth_date:
            return emp.birth_date.isoformat()
        return None

    def get_assignments(self, obj):
        emp = getattr(obj, "employee_profile", None)
        if not emp:
            return []
        return EmployeeAssignmentSerializer(
            emp.assignments.select_related("unit", "department", "org_role").all(),
            many=True,
        ).data


# --- Company ---


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ("id", "name", "timezone", "created_at")
        read_only_fields = ("created_at",)


# --- Unit ---


class UnitSerializer(serializers.ModelSerializer):
    departments_count = serializers.SerializerMethodField()

    class Meta:
        model = Unit
        fields = ("id", "company", "name", "is_active", "sort_order", "departments_count")
        read_only_fields = ("company",)

    def get_departments_count(self, obj):
        return obj.departments.count()


# --- Department ---


class DepartmentOrgSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    roles_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = ("id", "company", "unit", "unit_name", "name", "code", "sort_order", "roles_count")
        read_only_fields = ("company",)

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        company = getattr(getattr(request, "user", None), "company", None) if request else None
        if company and "unit" in fields:
            fields["unit"].queryset = Unit.objects.filter(company=company)
        return fields

    def get_roles_count(self, obj):
        return obj.roles.count()


# --- OrgPermission ---


class OrgPermissionListSerializer(serializers.ModelSerializer):
    domain = serializers.SerializerMethodField()
    domain_label = serializers.SerializerMethodField()

    class Meta:
        model = OrgPermission
        fields = ("id", "code", "name", "description", "domain", "domain_label")

    def get_domain(self, obj):
        return obj.code.split(".")[0] if "." in obj.code else obj.code

    def get_domain_label(self, obj):
        domain = obj.code.split(".")[0] if "." in obj.code else obj.code
        return domain


# --- OrgRole ---


class OrgRoleMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrgRole
        fields = ("id", "code", "title", "level", "is_system")


class OrgRoleSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    parent_role_title = serializers.CharField(source="parent_role.title", read_only=True, default=None)
    child_roles = serializers.SerializerMethodField()
    permissions = serializers.PrimaryKeyRelatedField(
        queryset=OrgPermission.objects.all(), many=True, required=False,
    )

    class Meta:
        model = OrgRole
        fields = (
            "id", "company", "department", "department_name",
            "code", "title", "group", "level",
            "parent_role", "parent_role_title", "child_roles",
            "is_assignable", "is_system",
            "permissions", "can_manage_permissions",
        )
        read_only_fields = ("company", "level", "code", "is_system")

    def get_child_roles(self, obj):
        return OrgRoleMinimalSerializer(obj.child_roles.all(), many=True).data

    def update(self, instance, validated_data):
        perms = validated_data.pop("permissions", None)
        instance = super().update(instance, validated_data)
        if perms is not None:
            instance.permissions.set(perms)
        return instance


class OrgRoleCreateSerializer(serializers.ModelSerializer):
    permissions = serializers.PrimaryKeyRelatedField(
        queryset=OrgPermission.objects.all(), many=True, required=False,
    )

    class Meta:
        model = OrgRole
        fields = ("id", "title", "group", "department", "parent_role", "permissions")

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        company = getattr(getattr(request, "user", None), "company", None) if request else None
        if company:
            if "department" in fields:
                fields["department"].queryset = Department.objects.filter(company=company)
            if "parent_role" in fields:
                fields["parent_role"].queryset = OrgRole.objects.filter(company=company)
        return fields

    def validate_title(self, value):
        if not value.strip():
            raise serializers.ValidationError("Название роли не может быть пустым.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        company = request.user.company if request else None
        parent = attrs.get("parent_role")
        if parent and company and parent.company_id != company.id:
            raise serializers.ValidationError(
                {"parent_role": "Родительская роль должна быть из той же компании."}
            )
        department = attrs.get("department")
        if department and company and department.company_id != company.id:
            raise serializers.ValidationError(
                {"department": "Департамент должен быть из той же компании."}
            )
        return attrs

    def create(self, validated_data):
        perms = validated_data.pop("permissions", [])
        request = self.context.get("request")
        validated_data["company"] = request.user.company
        base_code = slugify(validated_data["title"], allow_unicode=False) or "role"
        code = base_code
        company = validated_data["company"]
        counter = 1
        while OrgRole.objects.filter(company=company, code=code).exists():
            code = f"{base_code}_{counter}"
            counter += 1
        validated_data["code"] = code
        instance = super().create(validated_data)
        if perms:
            instance.permissions.set(perms)
        return instance


# --- Employee ---


class EmployeeSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        source="user", queryset=User.objects.all(), write_only=True, required=False, allow_null=True,
    )
    email = serializers.SerializerMethodField()
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()
    role_title = serializers.SerializerMethodField()
    assignments = EmployeeAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = Employee
        fields = (
            "id", "company", "user", "user_id", "email", "full_name",
            "first_name", "last_name", "role_title", "grade", "birth_date",
            "avatar_url", "pattern", "can_split", "can_extra", "assignments",
        )
        read_only_fields = ("company",)

    def get_email(self, obj):
        return obj.user.email if obj.user else None

    def get_first_name(self, obj):
        return obj.user.first_name if obj.user else None

    def get_last_name(self, obj):
        return obj.user.last_name if obj.user else None

    def get_role_title(self, obj):
        a = obj.assignments.select_related("org_role").first()
        if a:
            return a.org_role.title
        return obj.org_role.title if obj.org_role else ""

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not data.get("full_name"):
            if instance.user:
                name = f"{instance.user.first_name or ''} {instance.user.last_name or ''}".strip()
                data["full_name"] = name or instance.user.email
            else:
                data["full_name"] = f"Сотрудник #{instance.pk}"
        return data

    def create(self, validated_data):
        request = self.context.get("request")
        if "company" not in validated_data and request and getattr(request.user, "company", None):
            validated_data["company"] = request.user.company
        return super().create(validated_data)


# --- Zone ---


class ZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Zone
        fields = ("id", "company", "department", "org_role", "name")
        read_only_fields = ("company",)


# --- Invite ---


class InviteAssignmentInputSerializer(serializers.Serializer):
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.none())
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.none(), required=False, allow_null=True, default=None,
    )
    org_role = serializers.PrimaryKeyRelatedField(queryset=OrgRole.objects.none())

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        company = getattr(getattr(request, "user", None), "company", None) if request else None
        if company:
            fields["unit"].queryset = Unit.objects.filter(company=company)
            fields["department"].queryset = Department.objects.filter(company=company)
            fields["org_role"].queryset = OrgRole.objects.filter(company=company, is_assignable=True)
        return fields

    def validate(self, data):
        dept = data.get("department")
        unit = data["unit"]
        org_role = data["org_role"]
        if dept and dept.unit_id != unit.id:
            raise serializers.ValidationError("Департамент должен принадлежать выбранному юниту.")
        if org_role.department_id and dept and org_role.department_id != dept.id:
            raise serializers.ValidationError("Роль привязана к другому департаменту.")
        return data


class InviteAssignmentSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    department_name = serializers.SerializerMethodField()
    org_role_title = serializers.CharField(source="org_role.title", read_only=True)

    class Meta:
        model = InviteAssignment
        fields = ("id", "unit", "unit_name", "department", "department_name", "org_role", "org_role_title")

    def get_department_name(self, obj):
        return obj.department.name if obj.department else None


class EmployeeAssignmentBulkSerializer(serializers.Serializer):
    employee = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.none())
    assignments = InviteAssignmentInputSerializer(many=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        company = getattr(getattr(request, "user", None), "company", None) if request else None
        if company:
            self.fields["employee"].queryset = Employee.objects.filter(company=company)


class InviteCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")
    grade = serializers.IntegerField(default=0, min_value=0, max_value=5)
    assignments = InviteAssignmentInputSerializer(many=True, required=False, default=list)


class InviteSerializer(serializers.ModelSerializer):
    org_role_title = serializers.CharField(source="org_role.title", read_only=True, default=None)
    unit_name = serializers.CharField(source="unit.name", read_only=True, default=None)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    invite_assignments = InviteAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = Invite
        fields = (
            "id", "email", "first_name", "last_name",
            "grade", "org_role", "org_role_title", "unit", "unit_name",
            "department", "department_name",
            "invite_assignments",
            "token", "status", "expires_at", "created_at", "sent_at",
        )
        read_only_fields = ("token", "status", "expires_at", "created_at", "sent_at")


# --- Auth ---


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")
    company_name = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Пользователь с таким email уже существует.")
        return value

    def create(self, validated_data):
        company_name = (validated_data.pop("company_name", "") or "").strip()
        first_name = (validated_data.pop("first_name", "") or "").strip()
        last_name = (validated_data.pop("last_name", "") or "").strip()
        if not company_name:
            local = validated_data["email"].split("@")[0]
            company_name = f"{local} — компания"

        company = Company.objects.create(name=company_name)
        owner_role = OrgRole.objects.filter(company=company, code="owner").first()

        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=first_name,
            last_name=last_name,
            company=company,
            role="owner",
            is_active=True,
        )

        full_name = f"{last_name} {first_name}".strip()
        Employee.objects.create(
            company=company, user=user, org_role=owner_role, full_name=full_name,
        )
        return user


class AcceptInviteSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)
    agree = serializers.BooleanField()
    birth_date = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if not attrs.get("agree"):
            raise serializers.ValidationError({"agree": "Необходимо согласие."})

        invite = Invite.objects.filter(token=attrs["token"]).first()
        if not invite:
            raise serializers.ValidationError({"token": "Приглашение не найдено."})
        if invite.status != "pending":
            raise serializers.ValidationError({"token": f"Статус приглашения: {invite.status}"})
        if not invite.is_usable():
            raise serializers.ValidationError({"token": "Приглашение просрочено."})
        if User.objects.filter(email__iexact=invite.email).exists():
            raise serializers.ValidationError({"token": "Пользователь с таким email уже зарегистрирован."})

        attrs["invite"] = invite

        from datetime import datetime

        raw = (attrs.get("birth_date") or "").strip()
        if raw:
            for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
                try:
                    attrs["birth_date"] = datetime.strptime(raw, fmt).date()
                    break
                except ValueError:
                    continue
            else:
                attrs["birth_date"] = None
        else:
            attrs["birth_date"] = None
        return attrs

    def create(self, validated_data):
        invite = validated_data["invite"]

        user = User.objects.create_user(
            email=invite.email,
            password=validated_data["password"],
            first_name=invite.first_name,
            last_name=invite.last_name,
            company=invite.company,
            role="employee",
            is_active=True,
        )

        employee, _ = Employee.objects.update_or_create(
            company=invite.company,
            user=user,
            defaults={
                "full_name": f"{invite.first_name} {invite.last_name}".strip(),
                "grade": invite.grade or 0,
                "birth_date": validated_data.get("birth_date"),
            },
        )

        invite_assignments = invite.invite_assignments.select_related(
            "unit", "department", "org_role"
        ).all()
        if invite_assignments.exists():
            for ia in invite_assignments:
                if ia.org_role and ia.org_role.is_assignable:
                    EmployeeAssignment.objects.get_or_create(
                        employee=employee, unit=ia.unit, org_role=ia.org_role,
                        defaults={"department": ia.department},
                    )
                    employee.units.add(ia.unit)
        elif invite.unit and invite.org_role:
            if invite.org_role.is_assignable:
                EmployeeAssignment.objects.get_or_create(
                    employee=employee, unit=invite.unit, org_role=invite.org_role,
                    defaults={"department": invite.department},
                )
                employee.units.add(invite.unit)

        invite.status = "accepted"
        invite.save(update_fields=["status"])
        return {"user_id": user.pk, "employee_id": employee.pk}
