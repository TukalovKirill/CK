from rest_framework.permissions import BasePermission

from apps.core.permissions import _is_full_access, has_org_permission


class TextbookModuleEnabled(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if _is_full_access(user):
            return True
        company = getattr(user, "company", None)
        if not company:
            return False
        settings = getattr(company, "textbook_settings", None)
        if settings is None:
            return False
        return settings.is_enabled


class TextbookPermission(TextbookModuleEnabled):
    permission_code = ""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if not self.permission_code:
            return True
        return has_org_permission(request.user, self.permission_code)


class CanViewTextbooks(TextbookPermission):
    permission_code = "textbooks.view"


class CanEditTextbooks(TextbookPermission):
    permission_code = "textbooks.edit"


class CanManageAssignments(TextbookPermission):
    permission_code = "textbooks.manage_assignments"


class CanManageAllTextbooks(TextbookPermission):
    permission_code = "textbooks.manage_all"
