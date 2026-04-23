from django.contrib import admin

from .models import (
    CardAssignment,
    CardParagraph,
    CardPhoto,
    CardTag,
    CompanyTextbookSettings,
    TextbookCard,
    TextbookCategory,
    TextbookSection,
)


@admin.register(CompanyTextbookSettings)
class CompanyTextbookSettingsAdmin(admin.ModelAdmin):
    list_display = ("company", "is_enabled", "created_at")
    list_filter = ("is_enabled",)
    list_editable = ("is_enabled",)


class CardParagraphInline(admin.TabularInline):
    model = CardParagraph
    extra = 0


class CardPhotoInline(admin.TabularInline):
    model = CardPhoto
    extra = 0


@admin.register(TextbookSection)
class TextbookSectionAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "order", "is_active")
    list_filter = ("company",)


@admin.register(TextbookCategory)
class TextbookCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "section", "order")


@admin.register(TextbookCard)
class TextbookCardAdmin(admin.ModelAdmin):
    list_display = ("name", "section", "category", "is_active", "created_at")
    inlines = [CardParagraphInline, CardPhotoInline]
    list_filter = ("company",)


@admin.register(CardAssignment)
class CardAssignmentAdmin(admin.ModelAdmin):
    list_display = ("card", "unit", "department", "assigned_at")


@admin.register(CardTag)
class CardTagAdmin(admin.ModelAdmin):
    list_display = ("card", "tag")
