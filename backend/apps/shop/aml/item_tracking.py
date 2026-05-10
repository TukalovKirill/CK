from datetime import timedelta

from django.utils import timezone

from .models import AMLAuditLog


def get_recent_price_changes(item_id, hours=24):
    since = timezone.now() - timedelta(hours=hours)
    logs = AMLAuditLog.objects.filter(
        action="rule_changed",
        details__tracking_type="price_change",
        details__item_id=item_id,
        timestamp__gte=since,
    ).order_by("-timestamp")
    return [
        {
            "old_price": log.details.get("old_price", 0),
            "new_price": log.details.get("new_price", 0),
            "changed_at": log.timestamp,
        }
        for log in logs
    ]


def get_recent_stock_changes(item_id, hours=24):
    since = timezone.now() - timedelta(hours=hours)
    logs = AMLAuditLog.objects.filter(
        action="rule_changed",
        details__tracking_type="stock_change",
        details__item_id=item_id,
        timestamp__gte=since,
    ).order_by("-timestamp")
    return [
        {
            "old_stock": log.details.get("old_stock", 0),
            "new_stock": log.details.get("new_stock", 0),
            "changed_at": log.timestamp,
        }
        for log in logs
    ]


def track_price_change(company, user, item, old_price, new_price, ip=None):
    if old_price == new_price:
        return
    AMLAuditLog.objects.create(
        company=company,
        actor=user,
        action="rule_changed",
        ip_address=ip,
        details={
            "tracking_type": "price_change",
            "item_id": item.pk,
            "item_name": item.name,
            "old_price": old_price,
            "new_price": new_price,
        },
    )


def track_stock_change(company, user, item, old_stock, new_stock, ip=None):
    if old_stock == new_stock:
        return
    AMLAuditLog.objects.create(
        company=company,
        actor=user,
        action="rule_changed",
        ip_address=ip,
        details={
            "tracking_type": "stock_change",
            "item_id": item.pk,
            "item_name": item.name,
            "old_stock": old_stock,
            "new_stock": new_stock,
        },
    )
