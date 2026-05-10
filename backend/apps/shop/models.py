import uuid

from django.db import models
from django.db.models import CASCADE, SET_NULL


def shop_item_photo_upload_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "jpg"
    return f"shop_items/{instance.pk or uuid.uuid4().hex}/{uuid.uuid4().hex}.{ext}"


class ShopSettings(models.Model):
    class PurchaseMode(models.TextChoices):
        INSTANT = "instant", "Мгновенная покупка"
        CONFIRMATION = "confirmation", "С подтверждением"

    company = models.OneToOneField(
        "core.Company", on_delete=CASCADE, related_name="shop_settings"
    )
    is_enabled = models.BooleanField("Модуль включён", default=False)
    purchase_mode = models.CharField(
        "Режим покупки",
        max_length=20,
        choices=PurchaseMode.choices,
        default=PurchaseMode.CONFIRMATION,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_settings"
        verbose_name = "Настройки магазина"
        verbose_name_plural = "Настройки магазина"

    def __str__(self):
        return f"{self.company.name} — {'вкл' if self.is_enabled else 'выкл'}"


class CoinBalance(models.Model):
    employee = models.OneToOneField(
        "core.Employee", verbose_name="Сотрудник", on_delete=CASCADE, related_name="coin_balance"
    )
    company = models.ForeignKey(
        "core.Company", verbose_name="Компания", on_delete=CASCADE, related_name="coin_balances"
    )
    balance = models.IntegerField("Баланс", default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "shop_coin_balances"
        verbose_name = "Баланс коинов"
        verbose_name_plural = "Балансы коинов"

    def __str__(self):
        return f"{self.employee} — {self.balance} СК"


class CoinTransaction(models.Model):
    class TransactionType(models.TextChoices):
        ACCRUAL = "accrual", "Начисление"
        PURCHASE = "purchase", "Покупка"
        REFUND = "refund", "Возврат"

    employee = models.ForeignKey(
        "core.Employee", verbose_name="Сотрудник", on_delete=CASCADE, related_name="coin_transactions"
    )
    company = models.ForeignKey(
        "core.Company", verbose_name="Компания", on_delete=CASCADE, related_name="coin_transactions"
    )
    amount = models.IntegerField("Сумма")
    transaction_type = models.CharField(
        "Тип", max_length=20, choices=TransactionType.choices
    )
    comment = models.TextField("Комментарий", blank=True, default="")
    created_by = models.ForeignKey(
        "core.CustomUser", verbose_name="Создал", on_delete=SET_NULL, null=True, blank=True, related_name="+"
    )
    related_order = models.ForeignKey(
        "shop.Order", verbose_name="Связанный заказ", on_delete=SET_NULL, null=True, blank=True, related_name="transactions"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_coin_transactions"
        ordering = ["-created_at"]
        verbose_name = "Транзакция коинов"
        verbose_name_plural = "Транзакции коинов"

    def __str__(self):
        sign = "+" if self.amount > 0 else ""
        return f"{self.employee} {sign}{self.amount} ({self.get_transaction_type_display()})"


class ShopCategory(models.Model):
    company = models.ForeignKey(
        "core.Company", verbose_name="Компания", on_delete=CASCADE, related_name="shop_categories"
    )
    unit = models.ForeignKey(
        "core.Unit", verbose_name="Юнит", on_delete=CASCADE, related_name="shop_categories"
    )
    name = models.CharField("Название", max_length=200)
    order = models.PositiveIntegerField("Порядок", default=0)
    is_active = models.BooleanField("Активна", default=True)

    class Meta:
        db_table = "shop_categories"
        ordering = ["order", "name"]
        unique_together = ("company", "unit", "name")
        verbose_name = "Категория товаров"
        verbose_name_plural = "Категории товаров"

    def __str__(self):
        return f"{self.name} ({self.unit.name})"


class ShopItem(models.Model):
    company = models.ForeignKey(
        "core.Company", verbose_name="Компания", on_delete=CASCADE, related_name="shop_items"
    )
    unit = models.ForeignKey(
        "core.Unit", verbose_name="Юнит", on_delete=CASCADE, related_name="shop_items"
    )
    category = models.ForeignKey(
        ShopCategory, verbose_name="Категория", on_delete=SET_NULL, null=True, blank=True, related_name="items"
    )
    name = models.CharField("Название", max_length=300, db_index=True)
    description = models.TextField("Описание", blank=True, default="")
    price = models.PositiveIntegerField("Цена (СК коины)")
    stock_quantity = models.IntegerField(
        "Количество на складе",
        default=-1,
        help_text="-1 = безлимит",
    )
    photo = models.ImageField(
        "Фото", upload_to=shop_item_photo_upload_path, null=True, blank=True
    )
    is_active = models.BooleanField("Активен", default=True)
    created_by = models.ForeignKey(
        "core.CustomUser", verbose_name="Создал", on_delete=SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField("Создано", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлено", auto_now=True)

    class Meta:
        db_table = "shop_items"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "unit", "is_active"]),
        ]
        verbose_name = "Товар"
        verbose_name_plural = "Товары"

    def __str__(self):
        return f"{self.name} — {self.price} СК"


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает подтверждения"
        COMPLETED = "completed", "Выполнен"
        REJECTED = "rejected", "Отклонён"

    employee = models.ForeignKey(
        "core.Employee", verbose_name="Сотрудник", on_delete=CASCADE, related_name="shop_orders"
    )
    company = models.ForeignKey(
        "core.Company", verbose_name="Компания", on_delete=CASCADE, related_name="shop_orders"
    )
    item = models.ForeignKey(
        ShopItem, verbose_name="Товар", on_delete=SET_NULL, null=True, related_name="orders"
    )
    quantity = models.PositiveIntegerField("Количество", default=1)
    total_price = models.PositiveIntegerField("Итого (СК коины)")
    status = models.CharField(
        "Статус", max_length=20, choices=Status.choices, default=Status.PENDING
    )
    reviewed_by = models.ForeignKey(
        "core.CustomUser", verbose_name="Рассмотрел", on_delete=SET_NULL, null=True, blank=True, related_name="+"
    )
    reviewed_at = models.DateTimeField("Дата рассмотрения", null=True, blank=True)
    created_at = models.DateTimeField("Создано", auto_now_add=True)

    class Meta:
        db_table = "shop_orders"
        ordering = ["-created_at"]
        verbose_name = "Заказ"
        verbose_name_plural = "Заказы"

    def __str__(self):
        item_name = self.item.name if self.item else "удалён"
        return f"{self.employee} — {item_name} ({self.get_status_display()})"


class PurchasedItem(models.Model):
    employee = models.ForeignKey(
        "core.Employee", verbose_name="Сотрудник", on_delete=CASCADE, related_name="purchased_items"
    )
    company = models.ForeignKey(
        "core.Company", verbose_name="Компания", on_delete=CASCADE, related_name="purchased_items"
    )
    order = models.ForeignKey(
        Order, verbose_name="Заказ", on_delete=CASCADE, related_name="purchased_items"
    )
    item = models.ForeignKey(
        ShopItem, verbose_name="Товар", on_delete=SET_NULL, null=True, related_name="purchased_items"
    )
    quantity_remaining = models.PositiveIntegerField("Осталось активаций")
    is_fully_activated = models.BooleanField("Полностью активирован", default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_purchased_items"
        ordering = ["-created_at"]
        verbose_name = "Купленный товар"
        verbose_name_plural = "Купленные товары"

    def __str__(self):
        item_name = self.item.name if self.item else "удалён"
        return f"{self.employee} — {item_name} (осталось: {self.quantity_remaining})"


class ItemActivation(models.Model):
    purchased_item = models.ForeignKey(
        PurchasedItem, verbose_name="Купленный товар", on_delete=CASCADE, related_name="activations"
    )
    employee = models.ForeignKey(
        "core.Employee", verbose_name="Сотрудник", on_delete=CASCADE, related_name="item_activations"
    )
    activated_at = models.DateTimeField("Дата активации", auto_now_add=True)

    class Meta:
        db_table = "shop_item_activations"
        ordering = ["-activated_at"]
        verbose_name = "Активация товара"
        verbose_name_plural = "Активации товаров"

    def __str__(self):
        return f"{self.employee} — {self.purchased_item} ({self.activated_at})"


class RefundRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает подтверждения"
        APPROVED = "approved", "Одобрен"
        REJECTED = "rejected", "Отклонён"

    purchased_item = models.ForeignKey(
        PurchasedItem, verbose_name="Купленный товар", on_delete=CASCADE, related_name="refund_requests"
    )
    employee = models.ForeignKey(
        "core.Employee", verbose_name="Сотрудник", on_delete=CASCADE, related_name="refund_requests"
    )
    company = models.ForeignKey(
        "core.Company", verbose_name="Компания", on_delete=CASCADE, related_name="refund_requests"
    )
    reason = models.TextField("Причина возврата", blank=True, default="")
    refund_amount = models.PositiveIntegerField("Сумма возврата")
    status = models.CharField(
        "Статус", max_length=20, choices=Status.choices, default=Status.PENDING
    )
    reviewed_by = models.ForeignKey(
        "core.CustomUser", verbose_name="Рассмотрел", on_delete=SET_NULL, null=True, blank=True, related_name="+"
    )
    reviewed_at = models.DateTimeField("Дата рассмотрения", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_refund_requests"
        ordering = ["-created_at"]
        verbose_name = "Запрос на возврат"
        verbose_name_plural = "Запросы на возврат"

    def __str__(self):
        item_name = self.purchased_item.item.name if self.purchased_item.item else "удалён"
        return f"{self.employee} — {item_name} ({self.get_status_display()})"


class AutoAccrualRule(models.Model):
    class TriggerType(models.TextChoices):
        QUIZ_COMPLETE = "quiz_complete", "Прохождение квиза"
        CUSTOM = "custom", "Произвольное"

    company = models.ForeignKey(
        "core.Company", verbose_name="Компания", on_delete=CASCADE, related_name="auto_accrual_rules"
    )
    trigger_type = models.CharField(
        "Тип триггера", max_length=30, choices=TriggerType.choices
    )
    amount = models.PositiveIntegerField("Сумма начисления")
    is_active = models.BooleanField("Активно", default=True)
    conditions = models.JSONField("Условия", default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_auto_accrual_rules"
        verbose_name = "Правило автоначисления"
        verbose_name_plural = "Правила автоначисления"

    def __str__(self):
        return f"{self.get_trigger_type_display()} — {self.amount} СК"
