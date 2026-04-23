from rest_framework import serializers

from apps.core.mixins import CompanyScopedCreateMixin

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

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_FILE_SIZE = 20 * 1024 * 1024


def validate_image_file(value):
    import os

    ext = os.path.splitext(value.name)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise serializers.ValidationError(f"Недопустимый формат: {ext}")
    if value.size > MAX_FILE_SIZE:
        raise serializers.ValidationError("Файл слишком большой (макс. 20 МБ)")


class TextbookSettingsSerializer(serializers.ModelSerializer):
    enabled = serializers.BooleanField(source="is_enabled", read_only=True)

    class Meta:
        model = CompanyTextbookSettings
        fields = ("enabled",)


class TextbookSectionSerializer(serializers.ModelSerializer):
    categories_count = serializers.SerializerMethodField()
    cards_count = serializers.SerializerMethodField()

    class Meta:
        model = TextbookSection
        fields = ("id", "company", "name", "order", "is_active", "categories_count", "cards_count", "created_at")
        read_only_fields = ("company", "created_at")

    def get_categories_count(self, obj):
        return obj.categories.count()

    def get_cards_count(self, obj):
        return obj.cards.count()


class TextbookSectionWriteSerializer(CompanyScopedCreateMixin, serializers.ModelSerializer):
    class Meta:
        model = TextbookSection
        fields = ("id", "name", "order", "is_active", "units")


class TextbookCategorySerializer(serializers.ModelSerializer):
    cards_count = serializers.SerializerMethodField()
    section_name = serializers.CharField(source="section.name", read_only=True)

    class Meta:
        model = TextbookCategory
        fields = ("id", "section", "section_name", "name", "order", "cards_count")

    def get_cards_count(self, obj):
        return obj.cards.count()


class TextbookCategoryWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TextbookCategory
        fields = ("id", "section", "name", "order")


class CardParagraphSerializer(serializers.ModelSerializer):
    photo = serializers.SerializerMethodField()

    class Meta:
        model = CardParagraph
        fields = ("id", "card", "paragraph_type", "label", "text", "order", "photo")

    def get_photo(self, obj):
        if obj.photo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None


class CardTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = CardTag
        fields = ("id", "card", "tag")


class CardPhotoSerializer(serializers.ModelSerializer):
    file = serializers.ImageField(validators=[validate_image_file])

    class Meta:
        model = CardPhoto
        fields = ("id", "card", "file", "order", "uploaded_at")
        read_only_fields = ("uploaded_at",)


class CardAssignmentSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True, default=None)
    department_name = serializers.SerializerMethodField()
    org_role_title = serializers.SerializerMethodField()

    class Meta:
        model = CardAssignment
        fields = (
            "id", "card", "unit", "unit_name",
            "department", "department_name",
            "org_role", "org_role_title",
            "assigned_at",
        )
        read_only_fields = ("assigned_at",)

    def get_department_name(self, obj):
        return obj.department.name if obj.department else None

    def get_org_role_title(self, obj):
        return obj.org_role.title if obj.org_role else None


class CardAssignmentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CardAssignment
        fields = ("card", "unit", "department", "org_role")


class ParagraphInlineSerializer(serializers.Serializer):
    paragraph_type = serializers.ChoiceField(choices=["front", "detail"], default="front")
    label = serializers.CharField(max_length=200, allow_blank=True, default="")
    text = serializers.CharField(allow_blank=True, default="")
    order = serializers.IntegerField(default=0)
    has_photo = serializers.BooleanField(default=False)


class TextbookCardListSerializer(serializers.ModelSerializer):
    first_photo = serializers.SerializerMethodField()
    photos_count = serializers.SerializerMethodField()
    tags = serializers.SlugRelatedField(many=True, read_only=True, slug_field="tag")

    class Meta:
        model = TextbookCard
        fields = (
            "id", "company", "section", "category", "name",
            "order", "is_active", "first_photo", "photos_count",
            "tags", "created_at", "updated_at",
        )

    def get_first_photo(self, obj):
        photo = obj.photos.first()
        if photo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(photo.file.url)
            return photo.file.url
        return None

    def get_photos_count(self, obj):
        return obj.photos.count()


class TextbookCardDetailSerializer(serializers.ModelSerializer):
    paragraphs = CardParagraphSerializer(many=True, read_only=True)
    tags = CardTagSerializer(many=True, read_only=True)
    photos = CardPhotoSerializer(many=True, read_only=True)
    assignments = CardAssignmentSerializer(many=True, read_only=True)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = TextbookCard
        fields = (
            "id", "company", "section", "category", "name",
            "order", "is_active", "created_by", "created_at", "updated_at",
            "paragraphs", "tags", "photos", "assignments", "can_edit",
        )

    def get_can_edit(self, obj):
        request = self.context.get("request")
        if not request:
            return False
        from .permissions_utils import can_edit_card
        return can_edit_card(request.user, obj)


class TextbookCardWriteSerializer(CompanyScopedCreateMixin, serializers.ModelSerializer):
    paragraphs_data = ParagraphInlineSerializer(many=True, required=False, write_only=True)
    tags_data = serializers.ListField(child=serializers.CharField(), required=False, write_only=True)

    class Meta:
        model = TextbookCard
        fields = ("id", "section", "category", "name", "order", "is_active", "paragraphs_data", "tags_data")

    def create(self, validated_data):
        paragraphs_data = validated_data.pop("paragraphs_data", [])
        tags_data = validated_data.pop("tags_data", [])
        request = self.context.get("request")
        if request:
            validated_data["created_by"] = request.user
        card = super().create(validated_data)

        for p_data in paragraphs_data:
            CardParagraph.objects.create(
                card=card,
                paragraph_type=p_data.get("paragraph_type", "front"),
                label=p_data.get("label", ""),
                text=p_data.get("text", ""),
                order=p_data.get("order", 0),
            )

        for tag_text in tags_data:
            tag_text = tag_text.strip().lower()
            if tag_text:
                CardTag.objects.get_or_create(card=card, tag=tag_text)

        return card

    def update(self, instance, validated_data):
        paragraphs_data = validated_data.pop("paragraphs_data", None)
        tags_data = validated_data.pop("tags_data", None)

        instance = super().update(instance, validated_data)

        if paragraphs_data is not None:
            old_paragraphs = list(instance.paragraphs.order_by("order").all())
            old_photos = {}
            for p in old_paragraphs:
                if p.photo:
                    old_photos[p.order] = p.photo

            instance.paragraphs.all().delete()
            for p_data in paragraphs_data:
                order = p_data.get("order", 0)
                photo = old_photos.get(order) if p_data.get("has_photo") else None
                CardParagraph.objects.create(
                    card=instance,
                    paragraph_type=p_data.get("paragraph_type", "front"),
                    label=p_data.get("label", ""),
                    text=p_data.get("text", ""),
                    order=order,
                    photo=photo,
                )

        if tags_data is not None:
            instance.tags.all().delete()
            for tag_text in tags_data:
                tag_text = tag_text.strip().lower()
                if tag_text:
                    CardTag.objects.get_or_create(card=instance, tag=tag_text)

        return instance
