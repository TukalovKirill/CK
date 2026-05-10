import logging

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


@transaction.atomic
def execute_approved_operation(flagged_op):
    executor = EXECUTORS.get(flagged_op.operation_type)
    if not executor:
        logger.warning(
            "No executor for operation type %s", flagged_op.operation_type,
        )
        return False
    executor(flagged_op, flagged_op.payload)
    return True


def _execute_accrual(flagged_op, payload):
    from apps.core.models import Employee
    from apps.shop.models import CoinBalance, CoinTransaction

    employee = Employee.objects.get(pk=payload["employee_id"])
    amount = payload["amount"]

    balance_obj, _ = CoinBalance.objects.select_for_update().get_or_create(
        employee=employee, defaults={"company": flagged_op.company},
    )
    balance_obj.balance += amount
    balance_obj.save(update_fields=["balance", "updated_at"])

    tx = CoinTransaction.objects.create(
        employee=employee,
        company=flagged_op.company,
        amount=amount,
        transaction_type=CoinTransaction.TransactionType.ACCRUAL,
        comment=payload.get("comment", ""),
        created_by_id=payload.get("initiated_by_id"),
    )
    flagged_op.related_transaction = tx
    flagged_op.save(update_fields=["related_transaction"])


def _execute_bulk_accrual(flagged_op, payload):
    from apps.core.models import Employee
    from apps.shop.models import CoinBalance, CoinTransaction

    employee_ids = payload["employee_ids"]
    amount = payload["amount"]
    comment = payload.get("comment", "")

    employees = Employee.objects.filter(
        pk__in=employee_ids, company=flagged_op.company,
    )
    first_tx = None
    for employee in employees:
        balance_obj, _ = CoinBalance.objects.select_for_update().get_or_create(
            employee=employee, defaults={"company": flagged_op.company},
        )
        balance_obj.balance += amount
        balance_obj.save(update_fields=["balance", "updated_at"])

        tx = CoinTransaction.objects.create(
            employee=employee,
            company=flagged_op.company,
            amount=amount,
            transaction_type=CoinTransaction.TransactionType.ACCRUAL,
            comment=comment,
            created_by_id=payload.get("initiated_by_id"),
        )
        if first_tx is None:
            first_tx = tx

    if first_tx:
        flagged_op.related_transaction = first_tx
        flagged_op.save(update_fields=["related_transaction"])


def _execute_order_approve(flagged_op, payload):
    from apps.shop.models import Order, PurchasedItem

    order = Order.objects.select_for_update().get(pk=payload["order_id"])
    if order.status != Order.Status.PENDING:
        raise ValueError(
            f"Order {order.pk} is no longer pending (status: {order.status})",
        )

    order.status = Order.Status.COMPLETED
    order.reviewed_by_id = payload.get("initiated_by_id")
    order.reviewed_at = timezone.now()
    order.save(update_fields=["status", "reviewed_by", "reviewed_at"])

    if order.item and order.item.stock_quantity != -1:
        order.item.stock_quantity -= order.quantity
        order.item.save(update_fields=["stock_quantity"])

    PurchasedItem.objects.create(
        employee=order.employee,
        company=order.company,
        order=order,
        item=order.item,
        quantity_remaining=order.quantity,
    )

    flagged_op.related_order = order
    flagged_op.save(update_fields=["related_order"])


def _execute_refund_approve(flagged_op, payload):
    from apps.shop.models import CoinBalance, CoinTransaction, PurchasedItem, RefundRequest

    refund_req = RefundRequest.objects.select_for_update().get(
        pk=payload["refund_request_id"],
    )
    if refund_req.status != RefundRequest.Status.PENDING:
        raise ValueError(
            f"RefundRequest {refund_req.pk} is no longer pending",
        )

    purchased_item = PurchasedItem.objects.get(pk=payload["purchased_item_id"])

    refund_req.status = RefundRequest.Status.APPROVED
    refund_req.reviewed_by_id = payload.get("initiated_by_id")
    refund_req.reviewed_at = timezone.now()
    refund_req.save(update_fields=["status", "reviewed_by", "reviewed_at"])

    balance_obj, _ = CoinBalance.objects.select_for_update().get_or_create(
        employee=refund_req.employee,
        defaults={"company": flagged_op.company},
    )
    balance_obj.balance += refund_req.refund_amount
    balance_obj.save(update_fields=["balance", "updated_at"])

    item_name = purchased_item.item.name if purchased_item.item else "удалён"
    tx = CoinTransaction.objects.create(
        employee=refund_req.employee,
        company=flagged_op.company,
        amount=refund_req.refund_amount,
        transaction_type=CoinTransaction.TransactionType.REFUND,
        comment=f"Возврат товара: {item_name}",
        related_order=purchased_item.order,
        created_by_id=payload.get("initiated_by_id"),
    )

    if purchased_item.item and purchased_item.item.stock_quantity != -1:
        purchased_item.item.stock_quantity += purchased_item.quantity_remaining
        purchased_item.item.save(update_fields=["stock_quantity"])

    purchased_item.delete()

    flagged_op.related_transaction = tx
    flagged_op.save(update_fields=["related_transaction"])


EXECUTORS = {
    "accrual": _execute_accrual,
    "bulk_accrual": _execute_bulk_accrual,
    "order_approve": _execute_order_approve,
    "refund_approve": _execute_refund_approve,
}
