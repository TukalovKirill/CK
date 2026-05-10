import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0004_rename_shop_items_company_f492c9_idx_shop_items_company_f6cccf_idx_and_more"),
        ("core", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AMLSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_enabled", models.BooleanField(default=False, verbose_name="AML включён")),
                ("threshold", models.FloatField(default=50.0, help_text="risk_score >= порога — операция блокируется и ждёт решения", verbose_name="Порог блокировки")),
                ("lookback_days", models.PositiveIntegerField(default=30, verbose_name="Окно анализа (дни)")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("company", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="aml_settings", to="core.company")),
            ],
            options={
                "verbose_name": "Настройки AML",
                "verbose_name_plural": "Настройки AML",
                "db_table": "shop_aml_settings",
            },
        ),
        migrations.CreateModel(
            name="AMLRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("rule_code", models.CharField(max_length=10, verbose_name="Код правила")),
                ("category", models.CharField(choices=[("A", "Конфликт интересов"), ("B", "Статистические аномалии"), ("C", "Манипуляция каталогом"), ("D", "Процессные аномалии"), ("E", "Неактивные аккаунты"), ("F", "Автоначисление")], max_length=2, verbose_name="Категория")),
                ("name", models.CharField(max_length=200, verbose_name="Название")),
                ("description", models.TextField(blank=True, default="", verbose_name="Описание")),
                ("is_enabled", models.BooleanField(default=True, verbose_name="Активно")),
                ("weight", models.FloatField(default=10.0, verbose_name="Вес (вклад в risk_score)")),
                ("params", models.JSONField(blank=True, default=dict, verbose_name="Параметры")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="aml_rules", to="core.company")),
            ],
            options={
                "verbose_name": "Правило AML",
                "verbose_name_plural": "Правила AML",
                "db_table": "shop_aml_rules",
                "ordering": ["category", "rule_code"],
                "unique_together": {("company", "rule_code")},
            },
        ),
        migrations.CreateModel(
            name="FlaggedOperation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("operation_type", models.CharField(choices=[("accrual", "Начисление"), ("bulk_accrual", "Массовое начисление"), ("purchase", "Покупка"), ("order_approve", "Одобрение заказа"), ("order_reject", "Отклонение заказа"), ("refund_create", "Запрос возврата"), ("refund_approve", "Одобрение возврата"), ("auto_rule_change", "Изменение автоправила"), ("item_price_change", "Изменение цены товара"), ("item_stock_change", "Изменение стока товара")], max_length=30, verbose_name="Тип операции")),
                ("payload", models.JSONField(default=dict, verbose_name="Данные операции")),
                ("risk_score", models.FloatField(verbose_name="Оценка риска")),
                ("triggered_rules", models.JSONField(default=list, help_text="[{rule_code, name, weight, details}, ...]", verbose_name="Сработавшие правила")),
                ("status", models.CharField(choices=[("pending", "Ожидает решения"), ("approved", "Одобрена и исполнена"), ("rejected", "Отклонена")], default="pending", max_length=20, verbose_name="Статус")),
                ("reviewed_at", models.DateTimeField(blank=True, null=True, verbose_name="Дата рассмотрения")),
                ("review_comment", models.TextField(blank=True, default="", verbose_name="Комментарий")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="flagged_operations", to="core.company")),
                ("initiated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="initiated_flagged_ops", to=settings.AUTH_USER_MODEL, verbose_name="Инициатор")),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reviewed_flagged_ops", to=settings.AUTH_USER_MODEL, verbose_name="Рассмотрел")),
                ("target_employee", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="flagged_ops", to="core.employee", verbose_name="Целевой сотрудник")),
                ("related_transaction", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="flagged_ops", to="shop.cointransaction", verbose_name="Связанная транзакция")),
                ("related_order", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="flagged_ops", to="shop.order", verbose_name="Связанный заказ")),
            ],
            options={
                "verbose_name": "Подозрительная операция",
                "verbose_name_plural": "Подозрительные операции",
                "db_table": "shop_aml_flagged_operations",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="AMLAuditLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(choices=[("viewed", "Просмотрено"), ("approved", "Одобрено"), ("rejected", "Отклонено"), ("settings_changed", "Настройки изменены"), ("rule_changed", "Правило изменено")], max_length=20, verbose_name="Действие")),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True, verbose_name="IP адрес")),
                ("details", models.JSONField(blank=True, default=dict, verbose_name="Подробности")),
                ("flagged_operation", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="audit_logs", to="shop.flaggedoperation")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="aml_audit_logs", to="core.company")),
                ("actor", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL, verbose_name="Кто")),
            ],
            options={
                "verbose_name": "Журнал AML",
                "verbose_name_plural": "Журнал AML",
                "db_table": "shop_aml_audit_log",
                "ordering": ["-timestamp"],
            },
        ),
    ]
