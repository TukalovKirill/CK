import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import apps.shop.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("core", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ShopSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_enabled", models.BooleanField(default=False, verbose_name="Модуль включён")),
                ("purchase_mode", models.CharField(choices=[("instant", "Мгновенная покупка"), ("confirmation", "С подтверждением")], default="confirmation", max_length=20, verbose_name="Режим покупки")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("company", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="shop_settings", to="core.company")),
            ],
            options={
                "verbose_name": "Настройки магазина",
                "verbose_name_plural": "Настройки магазина",
                "db_table": "shop_settings",
            },
        ),
        migrations.CreateModel(
            name="CoinBalance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("balance", models.IntegerField(default=0, verbose_name="Баланс")),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("employee", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="coin_balance", to="core.employee")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="coin_balances", to="core.company")),
            ],
            options={
                "verbose_name": "Баланс коинов",
                "verbose_name_plural": "Балансы коинов",
                "db_table": "shop_coin_balances",
            },
        ),
        migrations.CreateModel(
            name="ShopCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200, verbose_name="Название")),
                ("order", models.PositiveIntegerField(default=0, verbose_name="Порядок")),
                ("is_active", models.BooleanField(default=True, verbose_name="Активна")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="shop_categories", to="core.company")),
                ("unit", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="shop_categories", to="core.unit")),
            ],
            options={
                "verbose_name": "Категория товаров",
                "verbose_name_plural": "Категории товаров",
                "db_table": "shop_categories",
                "ordering": ["order", "name"],
                "unique_together": {("company", "unit", "name")},
            },
        ),
        migrations.CreateModel(
            name="ShopItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(db_index=True, max_length=300, verbose_name="Название")),
                ("description", models.TextField(blank=True, default="", verbose_name="Описание")),
                ("price", models.PositiveIntegerField(verbose_name="Цена (СК коины)")),
                ("stock_quantity", models.IntegerField(default=-1, help_text="-1 = безлимит", verbose_name="Количество на складе")),
                ("photo", models.ImageField(blank=True, null=True, upload_to=apps.shop.models.shop_item_photo_upload_path, verbose_name="Фото")),
                ("is_active", models.BooleanField(default=True, verbose_name="Активен")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="shop_items", to="core.company")),
                ("unit", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="shop_items", to="core.unit")),
                ("category", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="items", to="shop.shopcategory")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Товар",
                "verbose_name_plural": "Товары",
                "db_table": "shop_items",
                "ordering": ["-created_at"],
                "indexes": [models.Index(fields=["company", "unit", "is_active"], name="shop_items_company_f492c9_idx")],
            },
        ),
        migrations.CreateModel(
            name="Order",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("quantity", models.PositiveIntegerField(default=1, verbose_name="Количество")),
                ("total_price", models.PositiveIntegerField(verbose_name="Итого (СК коины)")),
                ("status", models.CharField(choices=[("pending", "Ожидает подтверждения"), ("completed", "Выполнен"), ("rejected", "Отклонён")], default="pending", max_length=20, verbose_name="Статус")),
                ("reviewed_at", models.DateTimeField(blank=True, null=True, verbose_name="Дата рассмотрения")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="shop_orders", to="core.employee")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="shop_orders", to="core.company")),
                ("item", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="orders", to="shop.shopitem")),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Заказ",
                "verbose_name_plural": "Заказы",
                "db_table": "shop_orders",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="CoinTransaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.IntegerField(verbose_name="Сумма")),
                ("transaction_type", models.CharField(choices=[("accrual", "Начисление"), ("purchase", "Покупка"), ("refund", "Возврат")], max_length=20, verbose_name="Тип")),
                ("comment", models.TextField(blank=True, default="", verbose_name="Комментарий")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="coin_transactions", to="core.employee")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="coin_transactions", to="core.company")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("related_order", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="transactions", to="shop.order")),
            ],
            options={
                "verbose_name": "Транзакция коинов",
                "verbose_name_plural": "Транзакции коинов",
                "db_table": "shop_coin_transactions",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="PurchasedItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("quantity_remaining", models.PositiveIntegerField(verbose_name="Осталось активаций")),
                ("is_fully_activated", models.BooleanField(default=False, verbose_name="Полностью активирован")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="purchased_items", to="core.employee")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="purchased_items", to="core.company")),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="purchased_items", to="shop.order")),
                ("item", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="purchased_items", to="shop.shopitem")),
            ],
            options={
                "verbose_name": "Купленный товар",
                "verbose_name_plural": "Купленные товары",
                "db_table": "shop_purchased_items",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="ItemActivation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("activated_at", models.DateTimeField(auto_now_add=True)),
                ("purchased_item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="activations", to="shop.purchaseditem")),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="item_activations", to="core.employee")),
            ],
            options={
                "verbose_name": "Активация товара",
                "verbose_name_plural": "Активации товаров",
                "db_table": "shop_item_activations",
                "ordering": ["-activated_at"],
            },
        ),
        migrations.CreateModel(
            name="AutoAccrualRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("trigger_type", models.CharField(choices=[("quiz_complete", "Прохождение квиза"), ("custom", "Произвольное")], max_length=30, verbose_name="Тип триггера")),
                ("amount", models.PositiveIntegerField(verbose_name="Сумма начисления")),
                ("is_active", models.BooleanField(default=True, verbose_name="Активно")),
                ("conditions", models.JSONField(blank=True, default=dict, verbose_name="Условия")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="auto_accrual_rules", to="core.company")),
            ],
            options={
                "verbose_name": "Правило автоначисления",
                "verbose_name_plural": "Правила автоначисления",
                "db_table": "shop_auto_accrual_rules",
            },
        ),
    ]
