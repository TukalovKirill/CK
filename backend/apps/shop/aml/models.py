from django.db import models
from django.db.models import CASCADE, SET_NULL


class AMLSettings(models.Model):
    company = models.OneToOneField(
        "core.Company", on_delete=CASCADE, related_name="aml_settings"
    )
    is_enabled = models.BooleanField("AML включён", default=False)
    threshold = models.FloatField(
        "Порог блокировки", default=50.0,
        help_text="risk_score >= порога — операция блокируется и ждёт решения",
    )
    lookback_days = models.PositiveIntegerField(
        "Окно анализа (дни)", default=30,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "shop_aml_settings"
        verbose_name = "Настройки AML"
        verbose_name_plural = "Настройки AML"

    def __str__(self):
        return f"AML — {self.company.name}"


DEFAULT_RULES = [
    {
        "code": "A1",
        "category": "A",
        "name": "Самоначисление",
        "description": "Инициатор начисления совпадает с получателем",
        "weight": 90.0,
        "params": {},
    },
    {
        "code": "A2",
        "category": "A",
        "name": "Начисление вне scope",
        "description": "Менеджер начисляет сотруднику из юнита, к которому не привязан",
        "weight": 70.0,
        "params": {},
    },
    {
        "code": "B1",
        "category": "B",
        "name": "Устойчивая пара",
        "description": "Доля начислений одному сотруднику > порога от всех начислений менеджера",
        "weight": 30.0,
        "params": {"max_share_pct": 50, "min_transactions": 5, "approver_multiplier": 1.5},
    },
    {
        "code": "B2",
        "category": "B",
        "name": "Диспропорция внутри группы",
        "description": "Сотрудник получает в N раз больше среднего по своей роли/департаменту",
        "weight": 25.0,
        "params": {"max_ratio": 3.0, "min_group_size": 3},
    },
    {
        "code": "B3",
        "category": "B",
        "name": "Аномальная сумма",
        "description": "Разовое начисление превышает avg + K*std по компании",
        "weight": 35.0,
        "params": {"k_factor": 2.5, "min_history": 10},
    },
    {
        "code": "B4",
        "category": "B",
        "name": "Аномальная частота",
        "description": "Количество начислений одному сотруднику за период превышает норму",
        "weight": 25.0,
        "params": {"max_accruals_per_day": 5, "max_accruals_per_week": 15},
    },
    {
        "code": "C1",
        "category": "C",
        "name": "Ценовая манипуляция",
        "description": "Цена товара снижена, покупка совершена, цена восстановлена",
        "weight": 60.0,
        "params": {"window_hours": 24, "min_price_drop_pct": 30},
    },
    {
        "code": "C2",
        "category": "C",
        "name": "Манипуляция стоком",
        "description": "Сток = 1, покупка конкретным сотрудником, сток восстановлен",
        "weight": 40.0,
        "params": {"window_hours": 24},
    },
    {
        "code": "D1",
        "category": "D",
        "name": "Цикл reject-refund",
        "description": "Паттерн покупка-отклонение-возврат повторяется",
        "weight": 45.0,
        "params": {"min_cycles": 3, "window_days": 7},
    },
    {
        "code": "D2",
        "category": "D",
        "name": "Rubber-stamping",
        "description": "Reviewer массово одобряет заказы без пауз",
        "weight": 30.0,
        "params": {"max_approvals_per_hour": 20, "min_avg_seconds_between": 10},
    },
    {
        "code": "D3",
        "category": "D",
        "name": "Аномальный % отклонений",
        "description": "Менеджер отклоняет заказы значительно чаще/реже среднего",
        "weight": 25.0,
        "params": {"max_rejection_rate_pct": 80, "min_reviewed": 5},
    },
    {
        "code": "D4",
        "category": "D",
        "name": "Refund после активации",
        "description": "Возврат коинов по товару, который уже был активирован",
        "weight": 95.0,
        "params": {},
    },
    {
        "code": "E1",
        "category": "E",
        "name": "Начисление неактивному",
        "description": "Начисление сотруднику без логинов более N дней",
        "weight": 50.0,
        "params": {"inactive_days": 30},
    },
    {
        "code": "E2",
        "category": "E",
        "name": "Всплеск перед деактивацией",
        "description": "Всплеск начислений/покупок перед деактивацией сотрудника",
        "weight": 40.0,
        "params": {"spike_ratio": 3.0, "window_days": 7},
    },
    {
        "code": "F1",
        "category": "F",
        "name": "Тривиальные conditions",
        "description": "AutoAccrualRule с пустыми или тривиальными условиями",
        "weight": 55.0,
        "params": {},
    },
    {
        "code": "F2",
        "category": "F",
        "name": "Аномальный amount в правиле",
        "description": "Сумма в AutoAccrualRule значительно выше других правил компании",
        "weight": 40.0,
        "params": {"k_factor": 3.0},
    },
]


class AMLRule(models.Model):
    CATEGORY_CHOICES = [
        ("A", "Конфликт интересов"),
        ("B", "Статистические аномалии"),
        ("C", "Манипуляция каталогом"),
        ("D", "Процессные аномалии"),
        ("E", "Неактивные аккаунты"),
        ("F", "Автоначисление"),
    ]

    company = models.ForeignKey(
        "core.Company", on_delete=CASCADE, related_name="aml_rules"
    )
    rule_code = models.CharField("Код правила", max_length=10)
    category = models.CharField("Категория", max_length=2, choices=CATEGORY_CHOICES)
    name = models.CharField("Название", max_length=200)
    description = models.TextField("Описание", blank=True, default="")
    is_enabled = models.BooleanField("Активно", default=True)
    weight = models.FloatField("Вес (вклад в risk_score)", default=10.0)
    params = models.JSONField("Параметры", default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "shop_aml_rules"
        unique_together = ("company", "rule_code")
        ordering = ["category", "rule_code"]
        verbose_name = "Правило AML"
        verbose_name_plural = "Правила AML"

    def __str__(self):
        return f"[{self.rule_code}] {self.name}"


class FlaggedOperation(models.Model):
    class OperationType(models.TextChoices):
        ACCRUAL = "accrual", "Начисление"
        BULK_ACCRUAL = "bulk_accrual", "Массовое начисление"
        PURCHASE = "purchase", "Покупка"
        ORDER_APPROVE = "order_approve", "Одобрение заказа"
        ORDER_REJECT = "order_reject", "Отклонение заказа"
        REFUND_CREATE = "refund_create", "Запрос возврата"
        REFUND_APPROVE = "refund_approve", "Одобрение возврата"
        AUTO_RULE_CHANGE = "auto_rule_change", "Изменение автоправила"
        ITEM_PRICE_CHANGE = "item_price_change", "Изменение цены товара"
        ITEM_STOCK_CHANGE = "item_stock_change", "Изменение стока товара"

    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает решения"
        APPROVED = "approved", "Одобрена и исполнена"
        REJECTED = "rejected", "Отклонена"

    company = models.ForeignKey(
        "core.Company", on_delete=CASCADE, related_name="flagged_operations"
    )
    operation_type = models.CharField(
        "Тип операции", max_length=30, choices=OperationType.choices,
    )
    initiated_by = models.ForeignKey(
        "core.CustomUser", verbose_name="Инициатор", on_delete=SET_NULL,
        null=True, related_name="initiated_flagged_ops",
    )
    target_employee = models.ForeignKey(
        "core.Employee", verbose_name="Целевой сотрудник", on_delete=SET_NULL,
        null=True, blank=True, related_name="flagged_ops",
    )
    payload = models.JSONField("Данные операции", default=dict)
    risk_score = models.FloatField("Оценка риска")
    triggered_rules = models.JSONField(
        "Сработавшие правила", default=list,
        help_text="[{rule_code, name, weight, details}, ...]",
    )
    status = models.CharField(
        "Статус", max_length=20, choices=Status.choices, default=Status.PENDING,
    )
    reviewed_by = models.ForeignKey(
        "core.CustomUser", verbose_name="Рассмотрел", on_delete=SET_NULL,
        null=True, blank=True, related_name="reviewed_flagged_ops",
    )
    reviewed_at = models.DateTimeField("Дата рассмотрения", null=True, blank=True)
    review_comment = models.TextField("Комментарий", blank=True, default="")
    related_transaction = models.ForeignKey(
        "shop.CoinTransaction", verbose_name="Связанная транзакция",
        on_delete=SET_NULL, null=True, blank=True, related_name="flagged_ops",
    )
    related_order = models.ForeignKey(
        "shop.Order", verbose_name="Связанный заказ",
        on_delete=SET_NULL, null=True, blank=True, related_name="flagged_ops",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_aml_flagged_operations"
        ordering = ["-created_at"]
        verbose_name = "Подозрительная операция"
        verbose_name_plural = "Подозрительные операции"

    def __str__(self):
        return f"[{self.get_status_display()}] {self.get_operation_type_display()} — risk {self.risk_score}"


class AMLAuditLog(models.Model):
    class Action(models.TextChoices):
        VIEWED = "viewed", "Просмотрено"
        APPROVED = "approved", "Одобрено"
        REJECTED = "rejected", "Отклонено"
        SETTINGS_CHANGED = "settings_changed", "Настройки изменены"
        RULE_CHANGED = "rule_changed", "Правило изменено"

    flagged_operation = models.ForeignKey(
        FlaggedOperation, on_delete=CASCADE, related_name="audit_logs",
        null=True, blank=True,
    )
    company = models.ForeignKey(
        "core.Company", on_delete=CASCADE, related_name="aml_audit_logs",
    )
    actor = models.ForeignKey(
        "core.CustomUser", verbose_name="Кто", on_delete=SET_NULL,
        null=True, related_name="+",
    )
    action = models.CharField("Действие", max_length=20, choices=Action.choices)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField("IP адрес", null=True, blank=True)
    details = models.JSONField("Подробности", default=dict, blank=True)

    class Meta:
        db_table = "shop_aml_audit_log"
        ordering = ["-timestamp"]
        verbose_name = "Журнал AML"
        verbose_name_plural = "Журнал AML"

    def __str__(self):
        return f"{self.actor} — {self.get_action_display()} — {self.timestamp}"
