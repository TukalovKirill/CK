from django.contrib import admin
from django.db.models import Count, Sum, Q
from django.utils.html import format_html
from django.utils import timezone

from .models import (
    AutoAccrualRule,
    CoinBalance,
    CoinTransaction,
    ItemActivation,
    Order,
    PurchasedItem,
    RefundRequest,
    ShopCategory,
    ShopItem,
    ShopSettings,
)


@admin.register(ShopSettings)
class ShopSettingsAdmin(admin.ModelAdmin):
    list_display = ("company", "is_enabled", "purchase_mode", "created_at")
    list_filter = ("is_enabled", "purchase_mode")
    list_editable = ("is_enabled", "purchase_mode")
    search_fields = ("company__name",)


class OrderInline(admin.TabularInline):
    model = Order
    extra = 0
    fields = ("employee", "item", "quantity", "total_price", "status", "created_at")
    readonly_fields = ("employee", "item", "quantity", "total_price", "created_at")
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


class CoinTransactionInline(admin.TabularInline):
    model = CoinTransaction
    fk_name = "employee"
    extra = 0
    fields = ("amount", "transaction_type", "comment", "created_by", "created_at")
    readonly_fields = ("amount", "transaction_type", "comment", "created_by", "created_at")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(CoinBalance)
class CoinBalanceAdmin(admin.ModelAdmin):
    list_display = ("employee", "employee_role", "balance", "balance_display", "company", "total_earned", "total_spent", "updated_at")
    list_filter = ("company",)
    search_fields = ("employee__full_name", "employee__user__email")
    list_select_related = ("employee", "employee__org_role", "company")
    readonly_fields = ("updated_at",)
    actions = ["reset_balance"]

    @admin.display(description="Роль")
    def employee_role(self, obj):
        return obj.employee.org_role.title if obj.employee.org_role else "—"

    @admin.display(description="Баланс")
    def balance_display(self, obj):
        if obj.balance > 0:
            color = "#10b981"
        elif obj.balance == 0:
            color = "#6b7280"
        else:
            color = "#ef4444"
        return format_html('<span style="color: {}; font-weight: bold;">{} СК</span>', color, obj.balance)

    @admin.display(description="Заработано")
    def total_earned(self, obj):
        total = CoinTransaction.objects.filter(
            employee=obj.employee, amount__gt=0
        ).aggregate(s=Sum("amount"))["s"]
        return f"{total or 0} СК"

    @admin.display(description="Потрачено")
    def total_spent(self, obj):
        total = CoinTransaction.objects.filter(
            employee=obj.employee, amount__lt=0
        ).aggregate(s=Sum("amount"))["s"]
        return f"{abs(total or 0)} СК"

    @admin.action(description="Сбросить баланс до 0")
    def reset_balance(self, request, queryset):
        updated = queryset.update(balance=0)
        self.message_user(request, f"Сброшено балансов: {updated}")


@admin.register(CoinTransaction)
class CoinTransactionAdmin(admin.ModelAdmin):
    list_display = ("employee", "amount_display", "transaction_type", "comment_short", "created_by", "related_order", "created_at")
    list_filter = ("transaction_type", "company")
    search_fields = ("employee__full_name", "comment")
    list_select_related = ("employee", "company", "created_by", "related_order")
    raw_id_fields = ("employee", "company", "created_by", "related_order")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)

    @admin.display(description="Сумма")
    def amount_display(self, obj):
        if obj.amount > 0:
            return format_html('<span style="color: #10b981;">+{}</span>', obj.amount)
        return format_html('<span style="color: #ef4444;">{}</span>', obj.amount)

    @admin.display(description="Комментарий")
    def comment_short(self, obj):
        if obj.comment:
            return obj.comment[:50] + ("..." if len(obj.comment) > 50 else "")
        return "—"


@admin.register(ShopCategory)
class ShopCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "unit", "order", "is_active", "item_count")
    list_filter = ("company", "unit", "is_active")
    search_fields = ("name",)
    list_editable = ("order", "is_active")
    actions = ["activate_categories", "deactivate_categories"]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _item_count=Count("items", distinct=True),
        )

    @admin.display(description="Товаров", ordering="_item_count")
    def item_count(self, obj):
        return obj._item_count

    @admin.action(description="Активировать категории")
    def activate_categories(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Деактивировать категории")
    def deactivate_categories(self, request, queryset):
        queryset.update(is_active=False)


@admin.register(ShopItem)
class ShopItemAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "unit", "category", "price_display", "stock_display",
                    "is_active", "order_count", "total_sold", "created_at")
    list_filter = ("company", "unit", "category", "is_active")
    search_fields = ("name", "description")
    list_select_related = ("company", "unit", "category", "created_by")
    raw_id_fields = ("company", "unit", "category", "created_by")
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "created_at"
    actions = ["activate_items", "deactivate_items", "duplicate_items"]

    fieldsets = (
        (None, {"fields": ("company", "unit", "category", "name", "description")}),
        ("Цена и наличие", {"fields": ("price", "stock_quantity")}),
        ("Медиа", {"fields": ("photo",)}),
        ("Статус", {"fields": ("is_active",)}),
        ("Служебное", {"fields": ("created_by", "created_at", "updated_at")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _order_count=Count("orders", distinct=True),
            _total_sold=Sum("orders__quantity", filter=Q(orders__status="completed")),
        )

    @admin.display(description="Цена")
    def price_display(self, obj):
        return format_html('<b>{} СК</b>', obj.price)

    @admin.display(description="Остаток")
    def stock_display(self, obj):
        if obj.stock_quantity == -1:
            return format_html('<span style="color: #10b981;">∞</span>')
        if obj.stock_quantity == 0:
            return format_html('<span style="color: #ef4444;">0</span>')
        return obj.stock_quantity

    @admin.display(description="Заказов", ordering="_order_count")
    def order_count(self, obj):
        return obj._order_count

    @admin.display(description="Продано", ordering="_total_sold")
    def total_sold(self, obj):
        return obj._total_sold or 0

    @admin.action(description="Активировать товары")
    def activate_items(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Деактивировать товары")
    def deactivate_items(self, request, queryset):
        queryset.update(is_active=False)

    @admin.action(description="Дублировать товары")
    def duplicate_items(self, request, queryset):
        for item in queryset:
            item.pk = None
            item.name = f"{item.name} (копия)"
            item.is_active = False
            item.save()
        self.message_user(request, f"Дублировано: {queryset.count()}")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "employee", "item", "quantity", "total_price_display",
                    "status", "status_badge", "reviewed_by", "created_at")
    list_filter = ("status", "company")
    search_fields = ("employee__full_name", "item__name")
    list_select_related = ("employee", "company", "item", "reviewed_by")
    raw_id_fields = ("employee", "company", "item", "reviewed_by")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)
    actions = ["approve_orders", "reject_orders"]

    fieldsets = (
        (None, {"fields": ("employee", "company", "item", "quantity", "total_price")}),
        ("Статус", {"fields": ("status", "reviewed_by", "reviewed_at")}),
        ("Даты", {"fields": ("created_at",)}),
    )

    @admin.display(description="Сумма")
    def total_price_display(self, obj):
        return format_html('<b>{} СК</b>', obj.total_price)

    @admin.display(description="Статус")
    def status_badge(self, obj):
        colors = {
            "pending": "#f59e0b",
            "completed": "#10b981",
            "rejected": "#ef4444",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, obj.get_status_display())

    @admin.action(description="Одобрить заказы")
    def approve_orders(self, request, queryset):
        updated = queryset.filter(status="pending").update(
            status="completed",
            reviewed_by=request.user,
            reviewed_at=timezone.now(),
        )
        self.message_user(request, f"Одобрено: {updated}")

    @admin.action(description="Отклонить заказы")
    def reject_orders(self, request, queryset):
        orders = queryset.filter(status="pending")
        count = orders.count()
        for order in orders:
            order.status = "rejected"
            order.reviewed_by = request.user
            order.reviewed_at = timezone.now()
            order.save()
            CoinTransaction.objects.create(
                employee=order.employee,
                company=order.company,
                amount=order.total_price,
                transaction_type="refund",
                comment=f"Возврат за отклонённый заказ #{order.id}",
                created_by=request.user,
                related_order=order,
            )
            balance = CoinBalance.objects.get(employee=order.employee)
            balance.balance += order.total_price
            balance.save()
        self.message_user(request, f"Отклонено с возвратом монет: {count}")


@admin.register(PurchasedItem)
class PurchasedItemAdmin(admin.ModelAdmin):
    list_display = ("employee", "item", "order", "quantity_remaining", "is_fully_activated", "activation_count", "created_at")
    list_filter = ("is_fully_activated", "company")
    search_fields = ("employee__full_name", "item__name")
    list_select_related = ("employee", "company", "order", "item")
    raw_id_fields = ("employee", "company", "order", "item")
    readonly_fields = ("created_at",)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _act_count=Count("activations", distinct=True),
        )

    @admin.display(description="Активаций", ordering="_act_count")
    def activation_count(self, obj):
        return obj._act_count


@admin.register(ItemActivation)
class ItemActivationAdmin(admin.ModelAdmin):
    list_display = ("employee", "purchased_item", "item_name", "activated_at")
    list_filter = ("employee__company",)
    search_fields = ("employee__full_name", "purchased_item__item__name")
    list_select_related = ("employee", "purchased_item", "purchased_item__item")
    raw_id_fields = ("employee", "purchased_item")
    date_hierarchy = "activated_at"

    @admin.display(description="Товар")
    def item_name(self, obj):
        return obj.purchased_item.item.name if obj.purchased_item.item else "—"


@admin.register(AutoAccrualRule)
class AutoAccrualRuleAdmin(admin.ModelAdmin):
    list_display = ("company", "trigger_type", "amount_display", "is_active", "conditions_summary", "created_at")
    list_filter = ("company", "trigger_type", "is_active")
    list_editable = ("is_active",)
    readonly_fields = ("created_at",)
    actions = ["activate_rules", "deactivate_rules"]

    fieldsets = (
        (None, {"fields": ("company", "trigger_type", "amount", "is_active")}),
        ("Условия", {"fields": ("conditions",), "description": "JSON-конфигурация условий срабатывания"}),
        ("Служебное", {"fields": ("created_at",)}),
    )

    @admin.display(description="Начисление")
    def amount_display(self, obj):
        return format_html('<b>+{} СК</b>', obj.amount)

    @admin.display(description="Условия")
    def conditions_summary(self, obj):
        if not obj.conditions:
            return "Без условий"
        keys = list(obj.conditions.keys())[:3]
        return ", ".join(keys)

    @admin.action(description="Активировать правила")
    def activate_rules(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Деактивировать правила")
    def deactivate_rules(self, request, queryset):
        queryset.update(is_active=False)


@admin.register(RefundRequest)
class RefundRequestAdmin(admin.ModelAdmin):
    list_display = ("employee", "item_name", "refund_amount_display", "status", "reason_short", "reviewed_by", "created_at")
    list_filter = ("status", "company")
    search_fields = ("employee__full_name", "reason")
    list_select_related = ("employee", "company", "purchased_item__item", "reviewed_by")
    raw_id_fields = ("employee", "company", "purchased_item", "reviewed_by")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at", "reviewed_at")

    @admin.display(description="Товар")
    def item_name(self, obj):
        if obj.purchased_item and obj.purchased_item.item:
            return obj.purchased_item.item.name
        return "—"

    @admin.display(description="Сумма возврата")
    def refund_amount_display(self, obj):
        return format_html('<b>{} СК</b>', obj.refund_amount)

    @admin.display(description="Причина")
    def reason_short(self, obj):
        if obj.reason:
            return obj.reason[:50] + ("..." if len(obj.reason) > 50 else "")
        return "—"
