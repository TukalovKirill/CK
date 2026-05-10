from django.contrib import admin

from .models import (
    AutoAccrualRule,
    CoinBalance,
    CoinTransaction,
    ItemActivation,
    Order,
    PurchasedItem,
    ShopCategory,
    ShopItem,
    ShopSettings,
)


@admin.register(ShopSettings)
class ShopSettingsAdmin(admin.ModelAdmin):
    list_display = ("company", "is_enabled", "purchase_mode")


@admin.register(CoinBalance)
class CoinBalanceAdmin(admin.ModelAdmin):
    list_display = ("employee", "balance", "company")
    search_fields = ("employee__full_name",)


@admin.register(CoinTransaction)
class CoinTransactionAdmin(admin.ModelAdmin):
    list_display = ("employee", "amount", "transaction_type", "created_at")
    list_filter = ("transaction_type",)


@admin.register(ShopCategory)
class ShopCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "unit", "order", "is_active")


@admin.register(ShopItem)
class ShopItemAdmin(admin.ModelAdmin):
    list_display = ("name", "unit", "price", "stock_quantity", "is_active")
    list_filter = ("unit", "is_active")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("employee", "item", "total_price", "status", "created_at")
    list_filter = ("status",)


@admin.register(PurchasedItem)
class PurchasedItemAdmin(admin.ModelAdmin):
    list_display = ("employee", "item", "quantity_remaining", "is_fully_activated")


@admin.register(ItemActivation)
class ItemActivationAdmin(admin.ModelAdmin):
    list_display = ("employee", "purchased_item", "activated_at")


@admin.register(AutoAccrualRule)
class AutoAccrualRuleAdmin(admin.ModelAdmin):
    list_display = ("company", "trigger_type", "amount", "is_active")
