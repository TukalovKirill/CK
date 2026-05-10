from dataclasses import dataclass
from datetime import timedelta

from django.db.models import Avg, Count, StdDev, Sum
from django.utils import timezone


@dataclass
class RuleResult:
    triggered: bool
    risk_contribution: float
    details: dict


def check_A1(op, ctx, params):
    """Самоначисление: created_by == target_employee.user"""
    if op["operation_type"] not in ("accrual", "bulk_accrual"):
        return RuleResult(False, 0, {})
    initiated_by_id = op.get("initiated_by_id")
    target_user_id = ctx.get("target_user_id")
    if initiated_by_id and target_user_id and initiated_by_id == target_user_id:
        return RuleResult(True, 1.0, {"reason": "Инициатор совпадает с получателем"})
    return RuleResult(False, 0, {})


def check_A2(op, ctx, params):
    """Начисление вне scope менеджера."""
    if op["operation_type"] not in ("accrual", "bulk_accrual"):
        return RuleResult(False, 0, {})
    manager_unit_ids = ctx.get("manager_unit_ids")
    target_unit_ids = ctx.get("target_unit_ids")
    if manager_unit_ids is None:
        return RuleResult(False, 0, {})
    if target_unit_ids and not set(target_unit_ids) & set(manager_unit_ids):
        return RuleResult(True, 1.0, {
            "reason": "Менеджер начисляет вне своего юнита",
            "manager_units": manager_unit_ids,
            "target_units": target_unit_ids,
        })
    return RuleResult(False, 0, {})


def check_B1(op, ctx, params):
    """Устойчивая пара: менеджер -> сотрудник."""
    if op["operation_type"] not in ("accrual",):
        return RuleResult(False, 0, {})
    from apps.shop.models import CoinTransaction
    max_share = params.get("max_share_pct", 50)
    min_tx = params.get("min_transactions", 5)
    approver_mult = params.get("approver_multiplier", 1.5)
    lookback = ctx.get("lookback_days", 30)
    since = timezone.now() - timedelta(days=lookback)
    initiated_by_id = op.get("initiated_by_id")
    employee_id = op.get("employee_id")
    if not initiated_by_id or not employee_id:
        return RuleResult(False, 0, {})

    total = CoinTransaction.objects.filter(
        company_id=op["company_id"],
        created_by_id=initiated_by_id,
        transaction_type="accrual",
        created_at__gte=since,
    ).count()

    if total < min_tx:
        return RuleResult(False, 0, {})

    to_target = CoinTransaction.objects.filter(
        company_id=op["company_id"],
        created_by_id=initiated_by_id,
        employee_id=employee_id,
        transaction_type="accrual",
        created_at__gte=since,
    ).count()

    share = (to_target / total) * 100 if total else 0
    if share < max_share:
        return RuleResult(False, 0, {})

    weight_mult = 1.0
    also_approves = ctx.get("manager_also_approves_target", False)
    if also_approves:
        weight_mult = approver_mult

    return RuleResult(True, weight_mult, {
        "reason": f"Доля начислений сотруднику: {share:.0f}% (порог {max_share}%)",
        "share_pct": round(share, 1),
        "total_accruals": total,
        "to_target": to_target,
        "approver_aggravation": also_approves,
    })


def check_B2(op, ctx, params):
    """Диспропорция внутри группы."""
    if op["operation_type"] not in ("accrual",):
        return RuleResult(False, 0, {})
    from apps.shop.models import CoinTransaction
    max_ratio = params.get("max_ratio", 3.0)
    min_group = params.get("min_group_size", 3)
    lookback = ctx.get("lookback_days", 30)
    since = timezone.now() - timedelta(days=lookback)
    employee_id = op.get("employee_id")
    department_id = ctx.get("target_department_id")
    if not department_id:
        return RuleResult(False, 0, {})

    from apps.core.models import Employee
    group_ids = list(
        Employee.objects.filter(
            assignments__department_id=department_id,
            company_id=op["company_id"],
        ).values_list("pk", flat=True).distinct()
    )
    if len(group_ids) < min_group:
        return RuleResult(False, 0, {})

    stats = CoinTransaction.objects.filter(
        company_id=op["company_id"],
        employee_id__in=group_ids,
        transaction_type="accrual",
        created_at__gte=since,
    ).values("employee_id").annotate(total=Sum("amount"))

    amounts = {row["employee_id"]: row["total"] for row in stats}
    target_total = amounts.get(employee_id, 0) + op.get("amount", 0)
    others = [v for eid, v in amounts.items() if eid != employee_id]
    if not others:
        return RuleResult(False, 0, {})
    avg_others = sum(others) / len(others)
    if avg_others <= 0:
        return RuleResult(False, 0, {})
    ratio = target_total / avg_others

    if ratio < max_ratio:
        return RuleResult(False, 0, {})

    return RuleResult(True, min(ratio / max_ratio, 3.0), {
        "reason": f"Получает в {ratio:.1f}x больше среднего по группе (порог {max_ratio}x)",
        "ratio": round(ratio, 2),
        "target_total": target_total,
        "group_avg": round(avg_others, 2),
        "group_size": len(group_ids),
    })


def check_B3(op, ctx, params):
    """Аномальная сумма начисления."""
    if op["operation_type"] not in ("accrual", "bulk_accrual"):
        return RuleResult(False, 0, {})
    from apps.shop.models import CoinTransaction
    k = params.get("k_factor", 2.5)
    min_hist = params.get("min_history", 10)
    lookback = ctx.get("lookback_days", 30)
    since = timezone.now() - timedelta(days=lookback)
    amount = op.get("amount", 0)

    stats = CoinTransaction.objects.filter(
        company_id=op["company_id"],
        transaction_type="accrual",
        created_at__gte=since,
    ).aggregate(avg=Avg("amount"), std=StdDev("amount"), cnt=Count("id"))

    if (stats["cnt"] or 0) < min_hist:
        return RuleResult(False, 0, {})
    avg_val = stats["avg"] or 0
    std_val = stats["std"] or 0
    threshold = avg_val + k * std_val

    if amount <= threshold:
        return RuleResult(False, 0, {})

    return RuleResult(True, 1.0, {
        "reason": f"Сумма {amount} превышает порог {threshold:.0f} (avg={avg_val:.0f}, std={std_val:.0f})",
        "amount": amount,
        "threshold": round(threshold, 2),
        "company_avg": round(avg_val, 2),
        "company_std": round(std_val, 2),
    })


def check_B4(op, ctx, params):
    """Аномальная частота начислений одному сотруднику."""
    if op["operation_type"] not in ("accrual",):
        return RuleResult(False, 0, {})
    from apps.shop.models import CoinTransaction
    max_day = params.get("max_accruals_per_day", 5)
    max_week = params.get("max_accruals_per_week", 15)
    employee_id = op.get("employee_id")
    now = timezone.now()

    day_count = CoinTransaction.objects.filter(
        company_id=op["company_id"],
        employee_id=employee_id,
        transaction_type="accrual",
        created_at__gte=now - timedelta(days=1),
    ).count()

    week_count = CoinTransaction.objects.filter(
        company_id=op["company_id"],
        employee_id=employee_id,
        transaction_type="accrual",
        created_at__gte=now - timedelta(days=7),
    ).count()

    reasons = []
    triggered = False
    if day_count >= max_day:
        triggered = True
        reasons.append(f"За день: {day_count + 1} (порог {max_day})")
    if week_count >= max_week:
        triggered = True
        reasons.append(f"За неделю: {week_count + 1} (порог {max_week})")

    if not triggered:
        return RuleResult(False, 0, {})

    return RuleResult(True, 1.0, {
        "reason": "; ".join(reasons),
        "day_count": day_count + 1,
        "week_count": week_count + 1,
    })


def check_C1(op, ctx, params):
    """Ценовая манипуляция: снижение цены -> покупка."""
    if op["operation_type"] not in ("purchase",):
        return RuleResult(False, 0, {})
    window_h = params.get("window_hours", 24)
    min_drop = params.get("min_price_drop_pct", 30)
    item_id = op.get("item_id")
    if not item_id:
        return RuleResult(False, 0, {})

    from apps.shop.aml.item_tracking import get_recent_price_changes
    changes = get_recent_price_changes(item_id, hours=window_h)
    if not changes:
        return RuleResult(False, 0, {})

    for change in changes:
        if change["old_price"] > 0:
            drop_pct = ((change["old_price"] - change["new_price"]) / change["old_price"]) * 100
            if drop_pct >= min_drop:
                return RuleResult(True, 1.0, {
                    "reason": f"Цена снижена на {drop_pct:.0f}% за {window_h}ч до покупки",
                    "old_price": change["old_price"],
                    "new_price": change["new_price"],
                    "changed_at": str(change["changed_at"]),
                })
    return RuleResult(False, 0, {})


def check_C2(op, ctx, params):
    """Манипуляция стоком."""
    if op["operation_type"] not in ("purchase",):
        return RuleResult(False, 0, {})
    item_id = op.get("item_id")
    if not item_id:
        return RuleResult(False, 0, {})

    from apps.shop.aml.item_tracking import get_recent_stock_changes
    window_h = params.get("window_hours", 24)
    changes = get_recent_stock_changes(item_id, hours=window_h)
    for change in changes:
        if change["new_stock"] == 1 and change["old_stock"] > 1:
            return RuleResult(True, 1.0, {
                "reason": f"Сток снижен до 1 (был {change['old_stock']}) за {window_h}ч до покупки",
                "old_stock": change["old_stock"],
                "changed_at": str(change["changed_at"]),
            })
    return RuleResult(False, 0, {})


def check_D1(op, ctx, params):
    """Цикл reject-refund."""
    if op["operation_type"] not in ("order_reject", "refund_approve"):
        return RuleResult(False, 0, {})
    from apps.shop.models import Order
    min_cycles = params.get("min_cycles", 3)
    window = params.get("window_days", 7)
    employee_id = op.get("employee_id")
    if not employee_id:
        return RuleResult(False, 0, {})
    since = timezone.now() - timedelta(days=window)

    reject_count = Order.objects.filter(
        company_id=op["company_id"],
        employee_id=employee_id,
        status="rejected",
        reviewed_at__gte=since,
    ).count()

    if reject_count < min_cycles:
        return RuleResult(False, 0, {})

    return RuleResult(True, 1.0, {
        "reason": f"{reject_count} отклонённых заказов за {window} дн. (порог {min_cycles})",
        "reject_count": reject_count,
    })


def check_D2(op, ctx, params):
    """Rubber-stamping: массовое одобрение без пауз."""
    if op["operation_type"] not in ("order_approve",):
        return RuleResult(False, 0, {})
    from apps.shop.models import Order
    max_per_hour = params.get("max_approvals_per_hour", 20)
    reviewer_id = op.get("initiated_by_id")
    if not reviewer_id:
        return RuleResult(False, 0, {})
    since = timezone.now() - timedelta(hours=1)

    recent = Order.objects.filter(
        company_id=op["company_id"],
        reviewed_by_id=reviewer_id,
        status="completed",
        reviewed_at__gte=since,
    ).count()

    if recent < max_per_hour:
        return RuleResult(False, 0, {})

    return RuleResult(True, 1.0, {
        "reason": f"{recent} одобрений за последний час (порог {max_per_hour})",
        "approvals_last_hour": recent,
    })


def check_D3(op, ctx, params):
    """Аномальный % отклонений."""
    if op["operation_type"] not in ("order_reject",):
        return RuleResult(False, 0, {})
    from apps.shop.models import Order
    max_rate = params.get("max_rejection_rate_pct", 80)
    min_rev = params.get("min_reviewed", 5)
    reviewer_id = op.get("initiated_by_id")
    lookback = ctx.get("lookback_days", 30)
    since = timezone.now() - timedelta(days=lookback)

    reviewed = Order.objects.filter(
        company_id=op["company_id"],
        reviewed_by_id=reviewer_id,
        reviewed_at__gte=since,
        status__in=["completed", "rejected"],
    )
    total = reviewed.count()
    if total < min_rev:
        return RuleResult(False, 0, {})

    rejected = reviewed.filter(status="rejected").count()
    rate = (rejected / total) * 100

    if rate < max_rate:
        return RuleResult(False, 0, {})

    return RuleResult(True, 1.0, {
        "reason": f"Процент отклонений: {rate:.0f}% (порог {max_rate}%)",
        "rejection_rate": round(rate, 1),
        "total_reviewed": total,
        "total_rejected": rejected,
    })


def check_D4(op, ctx, params):
    """Refund после активации."""
    if op["operation_type"] not in ("refund_create", "refund_approve"):
        return RuleResult(False, 0, {})
    has_activations = ctx.get("purchased_item_has_activations", False)
    if has_activations:
        return RuleResult(True, 1.0, {
            "reason": "Возврат товара, который уже был активирован",
        })
    return RuleResult(False, 0, {})


def check_E1(op, ctx, params):
    """Начисление неактивному сотруднику."""
    if op["operation_type"] not in ("accrual", "bulk_accrual"):
        return RuleResult(False, 0, {})
    inactive_days = params.get("inactive_days", 30)
    last_login = ctx.get("target_last_login")
    if last_login is None:
        return RuleResult(True, 1.0, {
            "reason": "Сотрудник никогда не входил в систему",
        })
    days_since = (timezone.now() - last_login).days
    if days_since >= inactive_days:
        return RuleResult(True, 1.0, {
            "reason": f"Последний вход {days_since} дн. назад (порог {inactive_days})",
            "days_since_login": days_since,
        })
    return RuleResult(False, 0, {})


def check_E2(op, ctx, params):
    """Всплеск перед деактивацией."""
    if op["operation_type"] not in ("accrual",):
        return RuleResult(False, 0, {})
    from apps.shop.models import CoinTransaction
    spike_ratio = params.get("spike_ratio", 3.0)
    window = params.get("window_days", 7)
    employee_id = op.get("employee_id")
    if not employee_id:
        return RuleResult(False, 0, {})
    target_is_active = ctx.get("target_is_active", True)
    if target_is_active:
        return RuleResult(False, 0, {})

    now = timezone.now()
    recent = CoinTransaction.objects.filter(
        employee_id=employee_id,
        transaction_type="accrual",
        created_at__gte=now - timedelta(days=window),
    ).aggregate(total=Sum("amount"))["total"] or 0

    historical = CoinTransaction.objects.filter(
        employee_id=employee_id,
        transaction_type="accrual",
        created_at__lt=now - timedelta(days=window),
    ).aggregate(avg=Avg("amount"), cnt=Count("id"))

    avg_hist = historical["avg"] or 0
    cnt_hist = historical["cnt"] or 0
    if cnt_hist < 3 or avg_hist <= 0:
        return RuleResult(False, 0, {})

    ratio = recent / (avg_hist * min(window, cnt_hist) / max(cnt_hist, 1))
    if ratio >= spike_ratio:
        return RuleResult(True, 1.0, {
            "reason": f"Всплеск начислений: {ratio:.1f}x от нормы перед деактивацией",
            "recent_total": recent,
        })
    return RuleResult(False, 0, {})


def check_F1(op, ctx, params):
    """Тривиальные conditions в AutoAccrualRule."""
    if op["operation_type"] != "auto_rule_change":
        return RuleResult(False, 0, {})
    conditions = op.get("conditions", {})
    if not conditions or conditions == {}:
        return RuleResult(True, 1.0, {
            "reason": "AutoAccrualRule с пустыми условиями — срабатывает для всех",
        })
    return RuleResult(False, 0, {})


def check_F2(op, ctx, params):
    """Аномальный amount в AutoAccrualRule."""
    if op["operation_type"] != "auto_rule_change":
        return RuleResult(False, 0, {})
    from apps.shop.models import AutoAccrualRule
    k = params.get("k_factor", 3.0)
    rule_amount = op.get("amount", 0)
    company_id = op.get("company_id")

    stats = AutoAccrualRule.objects.filter(
        company_id=company_id, is_active=True,
    ).exclude(pk=op.get("rule_id")).aggregate(
        avg=Avg("amount"), std=StdDev("amount"), cnt=Count("id"),
    )
    if (stats["cnt"] or 0) < 2:
        return RuleResult(False, 0, {})
    avg_val = stats["avg"] or 0
    std_val = stats["std"] or 0
    threshold = avg_val + k * std_val
    if rule_amount > threshold:
        return RuleResult(True, 1.0, {
            "reason": f"Amount {rule_amount} превышает порог {threshold:.0f}",
            "threshold": round(threshold, 2),
            "avg": round(avg_val, 2),
        })
    return RuleResult(False, 0, {})


RULE_CHECKS = {
    "A1": check_A1,
    "A2": check_A2,
    "B1": check_B1,
    "B2": check_B2,
    "B3": check_B3,
    "B4": check_B4,
    "C1": check_C1,
    "C2": check_C2,
    "D1": check_D1,
    "D2": check_D2,
    "D3": check_D3,
    "D4": check_D4,
    "E1": check_E1,
    "E2": check_E2,
    "F1": check_F1,
    "F2": check_F2,
}
