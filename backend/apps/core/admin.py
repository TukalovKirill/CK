from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

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


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ("email", "company", "role", "is_active", "is_superuser")
    list_filter = ("role", "is_active", "is_superuser")
    search_fields = ("email",)
    ordering = ("email",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Профиль", {"fields": ("first_name", "last_name", "company", "role")}),
        ("Статус", {"fields": ("is_active", "is_staff", "is_superuser")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),
    )


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "timezone", "created_at")


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "is_active", "sort_order")
    list_filter = ("company",)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "unit", "company")
    list_filter = ("company",)


@admin.register(OrgPermission)
class OrgPermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "name")


@admin.register(OrgRole)
class OrgRoleAdmin(admin.ModelAdmin):
    list_display = ("title", "code", "company", "level", "is_system", "is_assignable")
    list_filter = ("company", "is_system")
    filter_horizontal = ("permissions",)


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ("full_name", "company", "user", "grade")
    list_filter = ("company",)


@admin.register(EmployeeAssignment)
class EmployeeAssignmentAdmin(admin.ModelAdmin):
    list_display = ("employee", "unit", "department", "org_role")


@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = ("email", "company", "status", "created_at", "expires_at")
    list_filter = ("status", "company")


@admin.register(InviteAssignment)
class InviteAssignmentAdmin(admin.ModelAdmin):
    list_display = ("invite", "unit", "department", "org_role")


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ("name", "department", "org_role", "company")
    list_filter = ("company",)
