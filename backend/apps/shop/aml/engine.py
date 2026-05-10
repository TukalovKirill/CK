import logging
from dataclasses import dataclass, field

from django.utils import timezone

from apps.core.permissions import get_user_unit_ids

from .models import AMLRule, AMLSettings, FlaggedOperation
from .rules import RULE_CHECKS

logger = logging.getLogger(__name__)


@dataclass
class EvaluationResult:
    risk_score: float = 0.0
    triggered_rules: list = field(default_factory=list)
    should_block: bool = False


def _get_client_ip(request):
    if request is None:
        return None
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _build_context(op, request=None):
    ctx = {"lookback_days": 30}

    if op["operation_type"] in ("accrual", "bulk_accrual"):
        employee_id = op.get("employee_id")
        if employee_id:
            from apps.core.models import Employee
            try:
                emp = Employee.objects.select_related("user").get(pk=employee_id)
                ctx["target_user_id"] = emp.user_id
                ctx["target_last_login"] = emp.user.last_login
                ctx["target_is_active"] = emp.user.is_active

                dept_ids = list(
                    emp.assignments.values_list("department_id", flat=True).distinct()
                )
                ctx["target_department_id"] = dept_ids[0] if dept_ids else None
                ctx["target_unit_ids"] = list(
                    emp.assignments.values_list("unit_id", flat=True).distinct()
                )
            except Employee.DoesNotExist:
                pass

        initiated_by_id = op.get("initiated_by_id")
        if initiated_by_id and request and request.user:
            unit_ids = get_user_unit_ids(request.user, "shop.manage_coins")
            ctx["manager_unit_ids"] = unit_ids

            if employee_id:
                from apps.shop.models import Order
                ctx["manager_also_approves_target"] = Order.objects.filter(
                    employee_id=employee_id,
                    reviewed_by_id=initiated_by_id,
                    status="completed",
                ).exists()

    if op["operation_type"] in ("refund_create", "refund_approve"):
        purchased_item_id = op.get("purchased_item_id")
        if purchased_item_id:
            from apps.shop.models import PurchasedItem
            try:
                pi = PurchasedItem.objects.get(pk=purchased_item_id)
                ctx["purchased_item_has_activations"] = pi.activations.exists()
            except PurchasedItem.DoesNotExist:
                pass

    return ctx


class AMLEngine:
    def __init__(self, company):
        self.company = company
        self.settings, _ = AMLSettings.objects.get_or_create(company=company)
        self._rules = None

    @property
    def rules(self):
        if self._rules is None:
            self._rules = {
                r.rule_code: r
                for r in AMLRule.objects.filter(company=self.company, is_enabled=True)
            }
        return self._rules

    def evaluate(self, op, request=None):
        if not self.settings.is_enabled:
            return EvaluationResult()

        ctx = _build_context(op, request)
        ctx["lookback_days"] = self.settings.lookback_days

        result = EvaluationResult()
        for code, rule_obj in self.rules.items():
            check_fn = RULE_CHECKS.get(code)
            if not check_fn:
                continue
            try:
                r = check_fn(op, ctx, rule_obj.params)
            except Exception:
                logger.exception("AML rule %s failed for op %s", code, op.get("operation_type"))
                continue
            if r.triggered:
                contribution = rule_obj.weight * r.risk_contribution
                result.risk_score += contribution
                result.triggered_rules.append({
                    "rule_code": code,
                    "name": rule_obj.name,
                    "weight": contribution,
                    "details": r.details,
                })

        result.risk_score = min(result.risk_score, 100.0)
        result.should_block = result.risk_score >= self.settings.threshold

        return result

    def record(self, op, eval_result, request=None):
        if not eval_result.should_block:
            return None

        from apps.core.models import Employee
        target_employee = None
        employee_id = op.get("employee_id")
        if employee_id:
            target_employee = Employee.objects.filter(pk=employee_id).first()

        flagged = FlaggedOperation.objects.create(
            company=self.company,
            operation_type=op.get("operation_type", ""),
            initiated_by_id=op.get("initiated_by_id"),
            target_employee=target_employee,
            payload=_sanitize_payload(op),
            risk_score=eval_result.risk_score,
            triggered_rules=eval_result.triggered_rules,
            status=FlaggedOperation.Status.PENDING,
        )

        _notify_reviewers(flagged)
        return flagged


def _sanitize_payload(op):
    safe = {}
    for k, v in op.items():
        if isinstance(v, (str, int, float, bool, list, dict, type(None))):
            safe[k] = v
        else:
            safe[k] = str(v)
    return safe


def _notify_reviewers(flagged_op):
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        target_name = ""
        if flagged_op.target_employee:
            target_name = flagged_op.target_employee.full_name

        async_to_sync(channel_layer.group_send)(
            f"company_{flagged_op.company_id}_updates",
            {
                "type": "broadcast_message",
                "entity": "aml_flagged",
                "action": "created",
                "id": flagged_op.pk,
                "risk_score": flagged_op.risk_score,
                "operation_type": flagged_op.operation_type,
                "employee_name": target_name,
                "status": flagged_op.status,
                "user_id": None,
            },
        )
    except Exception:
        logger.exception("Failed to notify AML reviewers")
