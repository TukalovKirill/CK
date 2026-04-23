from collections import defaultdict

from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import EmployeeAssignment, OrgPermission, OrgRole


def _is_full_access(user):
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False):
        return True
    if getattr(user, "role", None) == "owner":
        return True
    emp = getattr(user, "employee_profile", None)
    if emp is None:
        return False
    if hasattr(emp, "assignments"):
        for assignment in emp.assignments.select_related("org_role").all():
            if assignment.org_role.is_system and assignment.org_role.code in ("developer", "owner"):
                return True
    return False


def _get_user_permission_codes(user):
    if not user or not user.is_authenticated:
        return set()
    if getattr(user, "is_superuser", False):
        return None
    if getattr(user, "role", None) == "owner":
        return None
    emp = getattr(user, "employee_profile", None)
    if emp is None:
        return set()
    codes = set()
    if hasattr(emp, "assignments"):
        for assignment in (
            emp.assignments.select_related("org_role").prefetch_related("org_role__permissions").all()
        ):
            role = assignment.org_role
            if role.is_system and role.code in ("developer", "owner"):
                return None
            codes.update(role.permissions.values_list("code", flat=True))
    return codes


def has_org_permission(user, code):
    codes = _get_user_permission_codes(user)
    if codes is None:
        return True
    return code in codes


def _user_can_manage_permissions(user):
    if _is_full_access(user):
        return True
    emp = getattr(user, "employee_profile", None)
    if not emp:
        return False
    for a in emp.assignments.select_related("org_role").all():
        if a.org_role.can_manage_permissions:
            return True
    return False


def get_user_unit_ids(user, permission_code):
    if _is_full_access(user):
        return None
    emp = getattr(user, "employee_profile", None)
    if emp is None:
        return []
    unit_ids = set()
    if hasattr(emp, "assignments"):
        for assignment in (
            emp.assignments.select_related("org_role").prefetch_related("org_role__permissions").all()
        ):
            codes = set(assignment.org_role.permissions.values_list("code", flat=True))
            if permission_code in codes:
                unit_ids.add(assignment.unit_id)
    return list(unit_ids)


def get_user_unit_permissions(user):
    if _is_full_access(user):
        return None
    emp = getattr(user, "employee_profile", None)
    if emp is None:
        return {}
    result = defaultdict(set)
    if hasattr(emp, "assignments"):
        for assignment in (
            emp.assignments.select_related("org_role").prefetch_related("org_role__permissions").all()
        ):
            codes = assignment.org_role.permissions.values_list("code", flat=True)
            result[assignment.unit_id].update(codes)
    return {k: list(v) for k, v in result.items()}


def scope_queryset_by_unit(qs, user, permission_code, unit_field="unit_id"):
    unit_ids = get_user_unit_ids(user, permission_code)
    if unit_ids is None:
        return qs
    return qs.filter(**{f"{unit_field}__in": unit_ids})


def get_subordinate_role_ids(user):
    if _is_full_access(user):
        return None
    emp = getattr(user, "employee_profile", None)
    if not emp:
        return set()
    user_role_ids = set(
        EmployeeAssignment.objects.filter(employee=emp).values_list("org_role_id", flat=True)
    )
    if not user_role_ids:
        return set()
    all_roles = OrgRole.objects.filter(company=user.company).values_list("id", "parent_role_id")
    children_map = {}
    for role_id, parent_id in all_roles:
        if parent_id is not None:
            children_map.setdefault(parent_id, []).append(role_id)
    subordinates = set()
    queue = list(user_role_ids)
    while queue:
        current = queue.pop()
        for child_id in children_map.get(current, []):
            if child_id not in subordinates:
                subordinates.add(child_id)
                queue.append(child_id)
    return subordinates


def get_accessible_dept_ids(user):
    if _is_full_access(user):
        return None
    emp = getattr(user, "employee_profile", None)
    if not emp:
        return set()
    user_role_ids = set(
        EmployeeAssignment.objects.filter(employee=emp).values_list("org_role_id", flat=True)
    )
    if not user_role_ids:
        return set()
    all_roles = OrgRole.objects.filter(company=user.company).values_list(
        "id", "parent_role_id", "department_id"
    )
    children_map = {}
    dept_by_role = {}
    for role_id, parent_id, dept_id in all_roles:
        if dept_id:
            dept_by_role[role_id] = dept_id
        if parent_id is not None:
            children_map.setdefault(parent_id, []).append(role_id)
    accessible = set(user_role_ids)
    queue = list(user_role_ids)
    while queue:
        current = queue.pop()
        for child_id in children_map.get(current, []):
            if child_id not in accessible:
                accessible.add(child_id)
                queue.append(child_id)
    return {dept_by_role[rid] for rid in accessible if rid in dept_by_role}


# --- DRF Permission Classes ---


class HasOrgPermission(BasePermission):
    required_permission = ""

    def has_permission(self, request, view):
        return has_org_permission(request.user, self.required_permission)


def require_permission(code):
    return type(
        f"Requires_{code.replace('.', '_')}",
        (HasOrgPermission,),
        {"required_permission": code},
    )


def require_read_write(read_code, write_code):
    class _Perm(BasePermission):
        def has_permission(self, request, view):
            if request.method in SAFE_METHODS:
                if read_code is None:
                    return request.user and request.user.is_authenticated
                return has_org_permission(request.user, read_code)
            return has_org_permission(request.user, write_code)

    _Perm.__name__ = f"RW_{read_code}__{write_code}".replace(".", "_")
    return _Perm


class IsCompanyScoped(BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        user_company = getattr(request.user, "company", None)
        obj_company = getattr(obj, "company", None)
        return user_company and obj_company and obj_company.id == user_company.id
