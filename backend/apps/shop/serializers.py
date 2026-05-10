import os

from rest_framework import serializers

from apps.core.mixins import CompanyScopedCreateMixin

from .models import (
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

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_FILE_SIZE = 20 * 1024 * 1024


def validate_image_file(value):
    ext = os.path.splitext(value.name)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise serializers.ValidationError(f"Недопустимый формат: {ext}")
    if value.size > MAX_FILE_SIZE:
        raise serializers.ValidationError("Файл слишком большой (макс. 20 МБ)")


# --- Settings ---

class ShopSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopSettings
        fields = ("is_enabled", "purchase_mode")


# --- Balance ---

class CoinBalanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)

    class Meta:
        model = CoinBalance
        fields = ("id", "employee", "employee_name", "balance", "updated_at")
        read_only_fields = ("employee", "balance", "updated_at")


# --- Transactions ---

class CoinTransactionSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    order_item_name = serializers.SerializerMethodField()

    class Meta:
        model = CoinTransaction
        fields = (
            "id", "employee", "employee_name", "amount", "transaction_type",
            "comment", "created_by", "created_by_name", "related_order",
            "order_item_name", "created_at",
        )
        read_only_fields = ("employee", "created_by", "created_at")

    def get_created_by_name(self, obj):
        if obj.created_by:
            emp = getattr(obj.created_by, "employee_profile", None)
            if emp:
                return emp.full_name
            return obj.created_by.email
        return None

    def get_order_item_name(self, obj):
        if obj.related_order and obj.related_order.item:
            return obj.related_order.item.name
        return None


class AccrueCoinsSerializer(serializers.Serializer):
    employee_id = serializers.IntegerField()
    amount = serializers.IntegerField(min_value=1)
    comment = serializers.CharField(required=False, default="")


class BulkAccrueCoinsSerializer(serializers.Serializer):
    employee_ids = serializers.ListField(child=serializers.IntegerField(), min_length=1)
    amount = serializers.IntegerField(min_value=1)
    comment = serializers.CharField(required=False, default="")


# --- Categories ---

class ShopCategorySerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = ShopCategory
        fields = ("id", "company", "unit", "name", "order", "is_active", "items_count")
        read_only_fields = ("company",)

    def get_items_count(self, obj):
        return obj.items.filter(is_active=True).count()


class ShopCategoryWriteSerializer(CompanyScopedCreateMixin, serializers.ModelSerializer):
    class Meta:
        model = ShopCategory
        fields = ("id", "unit", "name", "order", "is_active")


# --- Items ---

class ShopItemListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = ShopItem
        fields = (
            "id", "unit", "unit_name", "category", "category_name",
            "name", "description", "price", "stock_quantity",
            "photo_url", "is_active", "created_at",
        )

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None


class ShopItemDetailSerializer(ShopItemListSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta(ShopItemListSerializer.Meta):
        fields = ShopItemListSerializer.Meta.fields + ("created_by_name", "updated_at")

    def get_created_by_name(self, obj):
        if obj.created_by:
            emp = getattr(obj.created_by, "employee_profile", None)
            if emp:
                return emp.full_name
            return obj.created_by.email
        return None


class ShopItemWriteSerializer(CompanyScopedCreateMixin, serializers.ModelSerializer):
    photo = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = ShopItem
        fields = ("id", "unit", "category", "name", "description", "price", "stock_quantity", "photo", "is_active")

    def validate_photo(self, value):
        if value:
            validate_image_file(value)
        return value


# --- Orders ---

class OrderSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    item_name = serializers.SerializerMethodField()
    item_photo_url = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id", "employee", "employee_name", "item", "item_name",
            "item_photo_url", "quantity", "total_price", "status",
            "reviewed_by", "reviewed_by_name", "reviewed_at", "created_at",
        )
        read_only_fields = (
            "employee", "total_price", "status", "reviewed_by", "reviewed_at", "created_at",
        )

    def get_item_name(self, obj):
        return obj.item.name if obj.item else None

    def get_item_photo_url(self, obj):
        if obj.item and obj.item.photo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.item.photo.url)
            return obj.item.photo.url
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            emp = getattr(obj.reviewed_by, "employee_profile", None)
            if emp:
                return emp.full_name
            return obj.reviewed_by.email
        return None


class CreateOrderSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, default=1)


# --- Purchased Items ---

class PurchasedItemSerializer(serializers.ModelSerializer):
    item_name = serializers.SerializerMethodField()
    item_photo_url = serializers.SerializerMethodField()
    item_description = serializers.SerializerMethodField()
    activations_count = serializers.SerializerMethodField()

    class Meta:
        model = PurchasedItem
        fields = (
            "id", "item", "item_name", "item_photo_url", "item_description",
            "quantity_remaining", "is_fully_activated", "activations_count", "created_at",
        )

    def get_item_name(self, obj):
        return obj.item.name if obj.item else None

    def get_item_photo_url(self, obj):
        if obj.item and obj.item.photo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.item.photo.url)
            return obj.item.photo.url
        return None

    def get_item_description(self, obj):
        return obj.item.description if obj.item else None

    def get_activations_count(self, obj):
        return obj.activations.count()


# --- Activations ---

class ItemActivationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemActivation
        fields = ("id", "purchased_item", "activated_at")
        read_only_fields = ("purchased_item", "activated_at")


# --- Refunds ---

class RefundRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    item_name = serializers.SerializerMethodField()
    item_photo_url = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RefundRequest
        fields = (
            "id", "purchased_item", "employee", "employee_name",
            "item_name", "item_photo_url", "reason", "refund_amount",
            "status", "reviewed_by", "reviewed_by_name", "reviewed_at", "created_at",
        )
        read_only_fields = (
            "employee", "refund_amount", "status", "reviewed_by", "reviewed_at", "created_at",
        )

    def get_item_name(self, obj):
        if obj.purchased_item and obj.purchased_item.item:
            return obj.purchased_item.item.name
        return None

    def get_item_photo_url(self, obj):
        if obj.purchased_item and obj.purchased_item.item and obj.purchased_item.item.photo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.purchased_item.item.photo.url)
            return obj.purchased_item.item.photo.url
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            emp = getattr(obj.reviewed_by, "employee_profile", None)
            if emp:
                return emp.full_name
            return obj.reviewed_by.email
        return None


class CreateRefundRequestSerializer(serializers.Serializer):
    purchased_item_id = serializers.IntegerField()
    reason = serializers.CharField(required=False, default="")
