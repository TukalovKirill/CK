from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.html import format_html
from django.utils import timezone
from django.db.models import Count, Q

from .models import (
    AuditLog,
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


class EmployeeInline(admin.TabularInline):
    model = Employee
    extra = 0
    fields = ("full_name", "user", "org_role", "grade", "pattern", "birth_date")
    raw_id_fields = ("user", "org_role")
    show_change_link = True


class UnitInline(admin.TabularInline):
    model = Unit
    extra = 0
    fields = ("name", "is_active", "sort_order")
    show_change_link = True


class DepartmentInline(admin.TabularInline):
    model = Department
    extra = 0
    fields = ("name", "unit", "code", "sort_order")
    raw_id_fields = ("unit",)
    show_change_link = True


class OrgRoleInline(admin.TabularInline):
    model = OrgRole
    extra = 0
    fields = ("title", "code", "department", "level", "is_assignable", "is_system")
    raw_id_fields = ("department", "parent_role")
    show_change_link = True


class InviteAssignmentInline(admin.TabularInline):
    model = InviteAssignment
    extra = 0
    fields = ("unit", "department", "org_role")
    raw_id_fields = ("unit", "department", "org_role")


class EmployeeAssignmentInline(admin.TabularInline):
    model = EmployeeAssignment
    extra = 0
    fields = ("unit", "department", "org_role")
    raw_id_fields = ("unit", "department", "org_role")


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "timezone", "user_count", "employee_count", "unit_count", "created_at")
    search_fields = ("name",)
    readonly_fields = ("created_at",)
    inlines = [UnitInline, DepartmentInline, OrgRoleInline]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _user_count=Count("users", distinct=True),
            _employee_count=Count("employees", distinct=True),
            _unit_count=Count("units", distinct=True),
        )

    @admin.display(description="Пользователи", ordering="_user_count")
    def user_count(self, obj):
        return obj._user_count

    @admin.display(description="Сотрудники", ordering="_employee_count")
    def employee_count(self, obj):
        return obj._employee_count

    @admin.display(description="Юниты", ordering="_unit_count")
    def unit_count(self, obj):
        return obj._unit_count


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ("email", "full_name_display", "company", "role", "is_active", "is_staff", "date_joined", "last_login")
    list_filter = ("role", "is_active", "is_superuser", "is_staff", "company")
    search_fields = ("email", "first_name", "last_name")
    ordering = ("-date_joined",)
    list_select_related = ("company",)
    date_hierarchy = "date_joined"
    actions = ["activate_users", "deactivate_users", "make_staff"]

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Профиль", {"fields": ("first_name", "last_name", "company", "role")}),
        ("Статус", {"fields": ("is_active", "is_staff", "is_superuser")}),
        ("Даты", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "password1", "password2", "company", "role"),
        }),
    )
    readonly_fields = ("last_login", "date_joined")

    @admin.display(description="ФИО")
    def full_name_display(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name or "—"

    @admin.action(description="Активировать выбранных пользователей")
    def activate_users(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f"Активировано: {updated}")

    @admin.action(description="Деактивировать выбранных пользователей")
    def deactivate_users(self, request, queryset):
        updated = queryset.filter(is_superuser=False).update(is_active=False)
        self.message_user(request, f"Деактивировано: {updated}")

    @admin.action(description="Назначить статус staff")
    def make_staff(self, request, queryset):
        updated = queryset.update(is_staff=True)
        self.message_user(request, f"Назначено staff: {updated}")


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "is_active", "sort_order", "department_count", "employee_count")
    list_filter = ("company", "is_active")
    search_fields = ("name",)
    list_editable = ("is_active", "sort_order")
    actions = ["activate_units", "deactivate_units"]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _dept_count=Count("departments", distinct=True),
            _emp_count=Count("employees", distinct=True),
        )

    @admin.display(description="Отделов", ordering="_dept_count")
    def department_count(self, obj):
        return obj._dept_count

    @admin.display(description="Сотрудников", ordering="_emp_count")
    def employee_count(self, obj):
        return obj._emp_count

    @admin.action(description="Активировать юниты")
    def activate_units(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Деактивировать юниты")
    def deactivate_units(self, request, queryset):
        queryset.update(is_active=False)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "unit", "company", "code", "sort_order", "role_count", "zone_count")
    list_filter = ("company", "unit")
    search_fields = ("name", "code")
    list_editable = ("sort_order",)
    list_select_related = ("unit", "company")

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _role_count=Count("roles", distinct=True),
            _zone_count=Count("zones", distinct=True),
        )

    @admin.display(description="Ролей", ordering="_role_count")
    def role_count(self, obj):
        return obj._role_count

    @admin.display(description="Зон", ordering="_zone_count")
    def zone_count(self, obj):
        return obj._zone_count


@admin.register(OrgPermission)
class OrgPermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "description", "role_count")
    search_fields = ("code", "name")

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _role_count=Count("roles", distinct=True),
        )

    @admin.display(description="Используется в ролях", ordering="_role_count")
    def role_count(self, obj):
        return obj._role_count


@admin.register(OrgRole)
class OrgRoleAdmin(admin.ModelAdmin):
    list_display = ("title", "code", "company", "department", "level", "parent_role", "is_system", "is_assignable", "employee_count")
    list_filter = ("company", "is_system", "is_assignable", "department")
    search_fields = ("title", "code")
    filter_horizontal = ("permissions",)
    list_select_related = ("company", "department", "parent_role")
    raw_id_fields = ("company", "department", "parent_role")
    fieldsets = (
        (None, {"fields": ("company", "title", "code", "department", "group")}),
        ("Иерархия", {"fields": ("parent_role", "level")}),
        ("Настройки", {"fields": ("is_assignable", "is_system", "can_manage_permissions")}),
        ("Разрешения", {"fields": ("permissions",)}),
    )
    readonly_fields = ("level",)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _emp_count=Count("employees", distinct=True),
        )

    @admin.display(description="Сотрудников", ordering="_emp_count")
    def employee_count(self, obj):
        return obj._emp_count


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ("full_name", "company", "user_email", "org_role", "grade", "pattern", "birth_date", "assignment_count")
    list_filter = ("company", "grade", "pattern", "org_role")
    search_fields = ("full_name", "user__email")
    list_select_related = ("company", "user", "org_role")
    raw_id_fields = ("company", "user", "org_role")
    filter_horizontal = ("units",)
    inlines = [EmployeeAssignmentInline]
    actions = ["set_grade_1", "set_grade_2", "set_grade_3", "set_grade_4", "set_grade_5"]

    fieldsets = (
        (None, {"fields": ("company", "user", "full_name", "birth_date", "avatar_url")}),
        ("Должность", {"fields": ("org_role", "units", "grade")}),
        ("Расписание", {"fields": ("pattern", "can_split", "can_extra")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _assign_count=Count("assignments", distinct=True),
        )

    @admin.display(description="Email")
    def user_email(self, obj):
        return obj.user.email if obj.user else "—"

    @admin.display(description="Назначений", ordering="_assign_count")
    def assignment_count(self, obj):
        return obj._assign_count

    @admin.action(description="Установить грейд 1")
    def set_grade_1(self, request, queryset):
        queryset.update(grade=1)

    @admin.action(description="Установить грейд 2")
    def set_grade_2(self, request, queryset):
        queryset.update(grade=2)

    @admin.action(description="Установить грейд 3")
    def set_grade_3(self, request, queryset):
        queryset.update(grade=3)

    @admin.action(description="Установить грейд 4")
    def set_grade_4(self, request, queryset):
        queryset.update(grade=4)

    @admin.action(description="Установить грейд 5")
    def set_grade_5(self, request, queryset):
        queryset.update(grade=5)


@admin.register(EmployeeAssignment)
class EmployeeAssignmentAdmin(admin.ModelAdmin):
    list_display = ("employee", "unit", "department", "org_role")
    list_filter = ("unit", "department", "org_role")
    search_fields = ("employee__full_name",)
    list_select_related = ("employee", "unit", "department", "org_role")
    raw_id_fields = ("employee", "unit", "department", "org_role")


@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = ("email", "full_name_display", "company", "org_role", "status", "status_badge", "invited_by", "created_at", "expires_at")
    list_filter = ("status", "company", "org_role")
    search_fields = ("email", "first_name", "last_name")
    list_select_related = ("company", "org_role", "invited_by")
    raw_id_fields = ("company", "invited_by", "org_role", "unit", "department")
    readonly_fields = ("token", "created_at", "sent_at")
    date_hierarchy = "created_at"
    inlines = [InviteAssignmentInline]
    actions = ["revoke_invites", "mark_expired"]

    fieldsets = (
        (None, {"fields": ("company", "email", "first_name", "last_name")}),
        ("Назначение", {"fields": ("org_role", "unit", "department", "grade")}),
        ("Статус", {"fields": ("status", "token", "expires_at", "created_at", "sent_at")}),
        ("Кто пригласил", {"fields": ("invited_by",)}),
    )

    @admin.display(description="ФИО")
    def full_name_display(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name or "—"

    @admin.display(description="Статус")
    def status_badge(self, obj):
        colors = {
            "pending": "#f59e0b",
            "accepted": "#10b981",
            "revoked": "#ef4444",
            "expired": "#6b7280",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, obj.get_status_display())

    @admin.action(description="Отозвать приглашения")
    def revoke_invites(self, request, queryset):
        updated = queryset.filter(status="pending").update(status="revoked")
        self.message_user(request, f"Отозвано: {updated}")

    @admin.action(description="Пометить как истёкшие")
    def mark_expired(self, request, queryset):
        updated = queryset.filter(status="pending", expires_at__lt=timezone.now()).update(status="expired")
        self.message_user(request, f"Помечено истёкшими: {updated}")


@admin.register(InviteAssignment)
class InviteAssignmentAdmin(admin.ModelAdmin):
    list_display = ("invite", "unit", "department", "org_role")
    list_filter = ("unit", "org_role")
    raw_id_fields = ("invite", "unit", "department", "org_role")


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ("name", "department", "org_role", "company")
    list_filter = ("company", "department", "org_role")
    search_fields = ("name",)
    list_select_related = ("company", "department", "org_role")
    raw_id_fields = ("company", "department", "org_role")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "user", "company", "action", "model_name", "object_repr", "ip_address")
    list_filter = ("action", "model_name", "company")
    search_fields = ("object_repr", "user__email", "model_name")
    list_select_related = ("user", "company")
    readonly_fields = ("timestamp", "user", "company", "action", "model_name", "object_id", "object_repr", "changes", "ip_address")
    date_hierarchy = "timestamp"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser
