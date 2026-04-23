from apps.core.permissions import _is_full_access, has_org_permission
from apps.core.models import EmployeeAssignment


def _get_user_unit_ids(user):
    emp = getattr(user, "employee_profile", None)
    if not emp:
        return set()
    return set(EmployeeAssignment.objects.filter(employee=emp).values_list("unit_id", flat=True))


def _get_user_department_ids(user):
    emp = getattr(user, "employee_profile", None)
    if not emp:
        return set()
    return set(
        EmployeeAssignment.objects.filter(employee=emp)
        .exclude(department__isnull=True)
        .values_list("department_id", flat=True)
    )


def can_edit_card(user, card):
    if _is_full_access(user):
        return True
    if has_org_permission(user, "textbooks.manage_all"):
        return True
    if has_org_permission(user, "textbooks.edit"):
        user_units = _get_user_unit_ids(user)
        card_units = set(card.assignments.values_list("unit_id", flat=True))
        if card_units & user_units:
            return True
    return False


def can_delete_card(user, card):
    if _is_full_access(user):
        return True
    if has_org_permission(user, "textbooks.manage_all"):
        return True
    if card.created_by_id == user.pk:
        return True
    return False


def can_assign_card(user, target_unit_id, target_department_id=None):
    if _is_full_access(user):
        return True
    if has_org_permission(user, "textbooks.manage_all"):
        return True
    if has_org_permission(user, "textbooks.manage_assignments"):
        user_units = _get_user_unit_ids(user)
        if target_unit_id in user_units:
            if target_department_id:
                user_depts = _get_user_department_ids(user)
                return target_department_id in user_depts
            return True
    return False
