import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("core", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="StaffWish",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("text", models.TextField(verbose_name="Текст пожелания")),
                ("reply_text", models.TextField(blank=True, default="", verbose_name="Текст ответа")),
                ("replied_at", models.DateTimeField(blank=True, null=True, verbose_name="Дата ответа")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="staff_wishes", to="core.company", verbose_name="Компания")),
                ("unit", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="staff_wishes", to="core.unit", verbose_name="Юнит")),
                ("author", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="staff_wishes", to=settings.AUTH_USER_MODEL, verbose_name="Автор")),
                ("replied_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="wish_replies", to=settings.AUTH_USER_MODEL, verbose_name="Ответил")),
            ],
            options={
                "verbose_name": "Пожелание сотрудника",
                "verbose_name_plural": "Пожелания сотрудников",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="staffwish",
            index=models.Index(fields=["company", "-created_at"], name="wish_company_created_idx"),
        ),
    ]
