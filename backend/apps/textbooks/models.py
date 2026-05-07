import uuid

from django.db import models
from django.db.models import CASCADE, SET_NULL


def paragraph_photo_upload_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "jpg"
    return f"textbook_paragraph_photos/{instance.card_id}/{uuid.uuid4().hex}.{ext}"


def card_photo_upload_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "jpg"
    return f"textbook_photos/{instance.card_id}/{uuid.uuid4().hex}.{ext}"


class CompanyTextbookSettings(models.Model):
    company = models.OneToOneField(
        "core.Company", on_delete=CASCADE, related_name="textbook_settings"
    )
    is_enabled = models.BooleanField("Модуль включён", default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "textbook_settings"
        verbose_name = "Настройки учебников"
        verbose_name_plural = "Настройки учебников"

    def __str__(self):
        return f"{self.company.name} — {'вкл' if self.is_enabled else 'выкл'}"


class TextbookSection(models.Model):
    company = models.ForeignKey(
        "core.Company", on_delete=CASCADE, related_name="textbook_sections"
    )
    units = models.ManyToManyField("core.Unit", blank=True, related_name="textbook_sections")
    name = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "textbook_sections"
        ordering = ["order", "name"]
        unique_together = ("company", "name")
        verbose_name = "Раздел учебника"
        verbose_name_plural = "Разделы учебников"

    def __str__(self):
        return self.name


class TextbookCategory(models.Model):
    section = models.ForeignKey(TextbookSection, on_delete=CASCADE, related_name="categories")
    name = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "textbook_categories"
        ordering = ["order", "name"]
        unique_together = ("section", "name")
        verbose_name = "Категория учебника"
        verbose_name_plural = "Категории учебников"

    def __str__(self):
        return self.name


class TextbookCard(models.Model):
    company = models.ForeignKey(
        "core.Company", on_delete=CASCADE, related_name="textbook_cards"
    )
    section = models.ForeignKey(
        TextbookSection, on_delete=SET_NULL, null=True, blank=True, related_name="cards"
    )
    category = models.ForeignKey(
        TextbookCategory, on_delete=SET_NULL, null=True, blank=True, related_name="cards"
    )
    name = models.CharField(max_length=300, db_index=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        "core.CustomUser", on_delete=SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "textbook_cards"
        ordering = ["order", "name"]
        indexes = [models.Index(fields=["company", "section", "category"])]
        verbose_name = "Карточка учебника"
        verbose_name_plural = "Карточки учебников"

    def __str__(self):
        return self.name


class CardParagraph(models.Model):
    class ParagraphType(models.TextChoices):
        FRONT = "front", "Основной"
        DETAIL = "detail", "Подробность"

    card = models.ForeignKey(TextbookCard, on_delete=CASCADE, related_name="paragraphs")
    paragraph_type = models.CharField(
        max_length=10, choices=ParagraphType.choices, default="front"
    )
    label = models.CharField(max_length=200)
    text = models.TextField()
    order = models.PositiveIntegerField(default=0)
    photo = models.ImageField(upload_to=paragraph_photo_upload_path, null=True, blank=True)

    class Meta:
        db_table = "textbook_card_paragraphs"
        ordering = ["card", "paragraph_type", "order"]
        verbose_name = "Параграф карточки"
        verbose_name_plural = "Параграфы карточек"

    def __str__(self):
        return f"{self.card.name} — {self.label}"


class CardTag(models.Model):
    card = models.ForeignKey(TextbookCard, on_delete=CASCADE, related_name="tags")
    tag = models.CharField(max_length=100, db_index=True)

    class Meta:
        db_table = "textbook_card_tags"
        unique_together = ("card", "tag")
        verbose_name = "Тег карточки"
        verbose_name_plural = "Теги карточек"

    def __str__(self):
        return self.tag


class CardPhoto(models.Model):
    card = models.ForeignKey(TextbookCard, on_delete=CASCADE, related_name="photos")
    file = models.ImageField(upload_to=card_photo_upload_path)
    order = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "textbook_card_photos"
        ordering = ["order", "uploaded_at"]
        verbose_name = "Фото карточки"
        verbose_name_plural = "Фото карточек"


class CardAssignment(models.Model):
    card = models.ForeignKey(TextbookCard, on_delete=CASCADE, related_name="assignments")
    unit = models.ForeignKey(
        "core.Unit", on_delete=CASCADE, related_name="textbook_assignments"
    )
    department = models.ForeignKey(
        "core.Department", on_delete=CASCADE, null=True, blank=True
    )
    org_role = models.ForeignKey(
        "core.OrgRole", on_delete=CASCADE, null=True, blank=True
    )
    assigned_by = models.ForeignKey(
        "core.CustomUser", on_delete=SET_NULL, null=True, blank=True, related_name="+"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "textbook_card_assignments"
        constraints = [
            models.UniqueConstraint(
                fields=["card", "unit", "department", "org_role"],
                name="unique_card_assignment",
                nulls_distinct=False,
            ),
        ]
        verbose_name = "Назначение карточки"
        verbose_name_plural = "Назначения карточек"


from .quiz_models import *  # noqa: E402, F401, F403
