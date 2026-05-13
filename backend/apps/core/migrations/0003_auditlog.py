import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_alter_department_company_alter_department_unit_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "timestamp",
                    models.DateTimeField(
                        auto_now_add=True, db_index=True, verbose_name="Время"
                    ),
                ),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("create", "Создание"),
                            ("update", "Обновление"),
                            ("delete", "Удаление"),
                            ("login", "Вход"),
                            ("login_fail", "Неудачный вход"),
                            ("request", "Запрос"),
                        ],
                        max_length=10,
                        verbose_name="Действие",
                    ),
                ),
                (
                    "model_name",
                    models.CharField(
                        db_index=True, max_length=100, verbose_name="Модель"
                    ),
                ),
                (
                    "object_id",
                    models.CharField(
                        blank=True,
                        default="",
                        max_length=255,
                        verbose_name="ID объекта",
                    ),
                ),
                (
                    "object_repr",
                    models.CharField(
                        blank=True,
                        default="",
                        max_length=255,
                        verbose_name="Представление",
                    ),
                ),
                (
                    "changes",
                    models.JSONField(default=dict, verbose_name="Изменения"),
                ),
                (
                    "ip_address",
                    models.GenericIPAddressField(
                        blank=True, null=True, verbose_name="IP-адрес"
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audit_logs",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Пользователь",
                    ),
                ),
                (
                    "company",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audit_logs",
                        to="core.company",
                        verbose_name="Компания",
                    ),
                ),
            ],
            options={
                "verbose_name": "Запись аудита",
                "verbose_name_plural": "Записи аудита",
                "ordering": ["-timestamp"],
                "indexes": [
                    models.Index(
                        fields=["company", "-timestamp"],
                        name="audit_company_ts_idx",
                    ),
                    models.Index(
                        fields=["user", "-timestamp"],
                        name="audit_user_ts_idx",
                    ),
                    models.Index(
                        fields=["model_name", "-timestamp"],
                        name="audit_model_ts_idx",
                    ),
                ],
            },
        ),
    ]
