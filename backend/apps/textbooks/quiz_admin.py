from django.contrib import admin

from .quiz_models import (
    QuizTemplate, QuizQuestion, QuizQuestionOption,
    QuizTemplateMaterial, QuizTemplateFile, QuizTemplateLink,
    QuizAssignment, QuizAttempt, AttemptAnswer, ViolationEvent,
)


class QuizQuestionInline(admin.TabularInline):
    model = QuizQuestion
    extra = 0
    fields = ("order", "text", "question_type", "timer_seconds")


class QuizQuestionOptionInline(admin.TabularInline):
    model = QuizQuestionOption
    extra = 0
    fields = ("order", "text", "is_correct")


class QuizTemplateMaterialInline(admin.TabularInline):
    model = QuizTemplateMaterial
    extra = 0
    fields = ("order", "section", "category")
    raw_id_fields = ("section", "category")


class QuizTemplateFileInline(admin.TabularInline):
    model = QuizTemplateFile
    extra = 0
    fields = ("order", "name", "file", "file_type")


class QuizTemplateLinkInline(admin.TabularInline):
    model = QuizTemplateLink
    extra = 0
    fields = ("order", "name", "url")


@admin.register(QuizTemplate)
class QuizTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "unit", "mode", "is_active", "pass_score_pct", "created_at")
    list_filter = ("company", "mode", "is_active")
    search_fields = ("name",)
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (None, {
            "fields": ("company", "unit", "department", "org_role", "name", "description", "mode", "is_active"),
        }),
        ("Параметры", {
            "fields": ("pass_score_pct", "study_deadline_days", "attempt_deadline_days",
                       "shuffle_questions", "shuffle_options"),
        }),
        ("Античит", {
            "fields": ("policy_config",),
        }),
        ("Служебное", {
            "fields": ("created_by", "created_at", "updated_at"),
        }),
    )
    inlines = [QuizQuestionInline, QuizTemplateMaterialInline,
               QuizTemplateFileInline, QuizTemplateLinkInline]
    raw_id_fields = ("company", "unit", "department", "org_role", "created_by")


@admin.register(QuizQuestion)
class QuizQuestionAdmin(admin.ModelAdmin):
    list_display = ("text_short", "template", "question_type", "timer_seconds", "order")
    list_filter = ("question_type",)
    search_fields = ("text",)
    inlines = [QuizQuestionOptionInline]
    raw_id_fields = ("template",)

    def text_short(self, obj):
        return obj.text[:60]
    text_short.short_description = "Текст"


@admin.register(QuizAssignment)
class QuizAssignmentAdmin(admin.ModelAdmin):
    list_display = ("template", "unit", "department", "org_role", "is_active", "assigned_at")
    list_filter = ("is_active", "company")
    raw_id_fields = ("template", "company", "unit", "department", "org_role", "assigned_by")


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ("employee", "template_name", "status", "score_pct",
                    "violation_count", "risk_score", "started_at")
    list_filter = ("status", "company")
    readonly_fields = ("started_at", "completed_at", "question_order")
    raw_id_fields = ("assignment", "employee", "company")

    def template_name(self, obj):
        return obj.assignment.template.name
    template_name.short_description = "Тест"


@admin.register(ViolationEvent)
class ViolationEventAdmin(admin.ModelAdmin):
    list_display = ("attempt", "event_type", "duration_ms", "risk_contribution", "occurred_at")
    list_filter = ("event_type",)
    raw_id_fields = ("attempt",)
