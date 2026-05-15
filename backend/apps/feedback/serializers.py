from rest_framework import serializers

from .models import StaffWish


class StaffWishSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    has_author = serializers.SerializerMethodField()
    replied_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StaffWish
        fields = (
            "id",
            "unit",
            "unit_name",
            "text",
            "created_at",
            "has_author",
            "reply_text",
            "replied_by_name",
            "replied_at",
        )

    def get_has_author(self, obj):
        return obj.author_id is not None

    def get_replied_by_name(self, obj):
        if not obj.replied_by:
            return None
        emp = getattr(obj.replied_by, "employee_profile", None)
        if emp and emp.full_name:
            return emp.full_name
        return obj.replied_by.email


class StaffWishSubmitSerializer(serializers.Serializer):
    unit_id = serializers.IntegerField()
    text = serializers.CharField()
