from django.conf import settings
from django.db import models


class StaffWish(models.Model):
    company = models.ForeignKey(
        "core.Company",
        verbose_name="Компания",
        on_delete=models.CASCADE,
        related_name="staff_wishes",
    )
    unit = models.ForeignKey(
        "core.Unit",
        verbose_name="Юнит",
        on_delete=models.CASCADE,
        related_name="staff_wishes",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Автор",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_wishes",
    )
    text = models.TextField("Текст пожелания")

    reply_text = models.TextField("Текст ответа", blank=True, default="")
    replied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Ответил",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="wish_replies",
    )
    replied_at = models.DateTimeField("Дата ответа", null=True, blank=True)

    created_at = models.DateTimeField("Дата создания", auto_now_add=True)

    class Meta:
        verbose_name = "Пожелание сотрудника"
        verbose_name_plural = "Пожелания сотрудников"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["company", "-created_at"],
                name="wish_company_created_idx",
            ),
        ]

    def __str__(self):
        return f"Wish #{self.pk} ({self.company})"
