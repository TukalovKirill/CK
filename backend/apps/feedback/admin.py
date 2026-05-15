from django.contrib import admin

from .models import StaffWish


@admin.register(StaffWish)
class StaffWishAdmin(admin.ModelAdmin):
    list_display = ("id", "company", "unit", "created_at", "replied_at")
    list_filter = ("company", "unit")
    readonly_fields = ("author", "created_at")
