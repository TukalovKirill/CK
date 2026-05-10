from django.contrib import admin
from django.db.models import Count
from django.utils.html import format_html

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
    search_fields = ("company__name",)


class CardParagraphInline(admin.TabularInline):
    model = CardParagraph
    extra = 0
    fields = ("order", "paragraph_type", "label", "text", "photo")
    ordering = ("order",)


class CardPhotoInline(admin.TabularInline):
    model = CardPhoto
    extra = 0
    fields = ("order", "file", "uploaded_at")
    readonly_fields = ("uploaded_at",)
    ordering = ("order",)


class CardTagInline(admin.TabularInline):
    model = CardTag
    extra = 0
    fields = ("tag",)


class CardAssignmentInline(admin.TabularInline):
    model = CardAssignment
    extra = 0
    fields = ("unit", "department", "org_role", "assigned_by", "assigned_at")
    readonly_fields = ("assigned_at",)
    raw_id_fields = ("unit", "department", "org_role", "assigned_by")


@admin.register(TextbookSection)
class TextbookSectionAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "order", "is_active", "category_count", "card_count", "units_list")
    list_filter = ("company", "is_active")
    search_fields = ("name",)
    list_editable = ("order", "is_active")
    filter_horizontal = ("units",)
    actions = ["activate_sections", "deactivate_sections"]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _cat_count=Count("categories", distinct=True),
            _card_count=Count("cards", distinct=True),
        )

    @admin.display(description="Категорий", ordering="_cat_count")
    def category_count(self, obj):
        return obj._cat_count

    @admin.display(description="Карточек", ordering="_card_count")
    def card_count(self, obj):
        return obj._card_count

    @admin.display(description="Юниты")
    def units_list(self, obj):
        units = obj.units.all()[:3]
        names = ", ".join(u.name for u in units)
        if obj.units.count() > 3:
            names += "..."
        return names or "—"

    @admin.action(description="Активировать секции")
    def activate_sections(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Деактивировать секции")
    def deactivate_sections(self, request, queryset):
        queryset.update(is_active=False)


@admin.register(TextbookCategory)
class TextbookCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "section", "section_company", "order", "card_count")
    list_filter = ("section__company", "section")
    search_fields = ("name", "section__name")
    list_editable = ("order",)
    list_select_related = ("section", "section__company")

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _card_count=Count("cards", distinct=True),
        )

    @admin.display(description="Компания")
    def section_company(self, obj):
        return obj.section.company

    @admin.display(description="Карточек", ordering="_card_count")
    def card_count(self, obj):
        return obj._card_count


@admin.register(TextbookCard)
class TextbookCardAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "section", "category", "is_active", "paragraph_count", "tag_list", "created_by", "created_at")
    list_filter = ("company", "is_active", "section", "category")
    search_fields = ("name", "tags__tag", "paragraphs__text")
    list_select_related = ("company", "section", "category", "created_by")
    raw_id_fields = ("company", "section", "category", "created_by")
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "created_at"
    inlines = [CardParagraphInline, CardPhotoInline, CardTagInline, CardAssignmentInline]
    actions = ["activate_cards", "deactivate_cards", "duplicate_cards"]

    fieldsets = (
        (None, {"fields": ("company", "name", "section", "category", "order")}),
        ("Статус", {"fields": ("is_active",)}),
        ("Служебное", {"fields": ("created_by", "created_at", "updated_at")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _para_count=Count("paragraphs", distinct=True),
        )

    @admin.display(description="Абзацев", ordering="_para_count")
    def paragraph_count(self, obj):
        return obj._para_count

    @admin.display(description="Теги")
    def tag_list(self, obj):
        tags = obj.tags.all()[:4]
        return ", ".join(t.tag for t in tags) or "—"

    @admin.action(description="Активировать карточки")
    def activate_cards(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Деактивировать карточки")
    def deactivate_cards(self, request, queryset):
        queryset.update(is_active=False)

    @admin.action(description="Дублировать карточки")
    def duplicate_cards(self, request, queryset):
        for card in queryset:
            paragraphs = list(card.paragraphs.all())
            tags = list(card.tags.all())
            photos = list(card.photos.all())
            card.pk = None
            card.name = f"{card.name} (копия)"
            card.save()
            for p in paragraphs:
                p.pk = None
                p.card = card
                p.save()
            for t in tags:
                t.pk = None
                t.card = card
                t.save()
            for photo in photos:
                photo.pk = None
                photo.card = card
                photo.save()
        self.message_user(request, f"Дублировано: {queryset.count()}")


@admin.register(CardAssignment)
class CardAssignmentAdmin(admin.ModelAdmin):
    list_display = ("card", "unit", "department", "org_role", "assigned_by", "assigned_at")
    list_filter = ("unit", "department", "org_role", "card__company")
    search_fields = ("card__name",)
    list_select_related = ("card", "unit", "department", "org_role", "assigned_by")
    raw_id_fields = ("card", "unit", "department", "org_role", "assigned_by")
    date_hierarchy = "assigned_at"


@admin.register(CardTag)
class CardTagAdmin(admin.ModelAdmin):
    list_display = ("tag", "card", "card_company")
    list_filter = ("card__company",)
    search_fields = ("tag", "card__name")
    list_select_related = ("card", "card__company")

    @admin.display(description="Компания")
    def card_company(self, obj):
        return obj.card.company
