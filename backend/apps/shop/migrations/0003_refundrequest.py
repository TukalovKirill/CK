import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0002_shop_permissions"),
        ("core", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="RefundRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reason", models.TextField(blank=True, default="", verbose_name="Причина возврата")),
                ("refund_amount", models.PositiveIntegerField(verbose_name="Сумма возврата")),
                ("status", models.CharField(choices=[("pending", "Ожидает подтверждения"), ("approved", "Одобрен"), ("rejected", "Отклонён")], default="pending", max_length=20, verbose_name="Статус")),
                ("reviewed_at", models.DateTimeField(blank=True, null=True, verbose_name="Дата рассмотрения")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("purchased_item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="refund_requests", to="shop.purchaseditem")),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="refund_requests", to="core.employee")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="refund_requests", to="core.company")),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Запрос на возврат",
                "verbose_name_plural": "Запросы на возврат",
                "db_table": "shop_refund_requests",
                "ordering": ["-created_at"],
            },
        ),
    ]
