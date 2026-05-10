from django.contrib import admin
from django.db.models import Count, Avg, Q
from django.utils.html import format_html

from .quiz_models import (
    QuizTemplate, QuizQuestion, QuizQuestionOption,
    QuizTemplateMaterial, QuizTemplateFile, QuizTemplateLink,
    QuizAssignment, QuizAttempt, AttemptAnswer, ViolationEvent,
)


class QuizQuestionInline(admin.TabularInline):
    model = QuizQuestion
    extra = 0
    fields = ("order", "text", "question_type", "timer_seconds")
    ordering = ("order",)
    show_change_link = True


class QuizQuestionOptionInline(admin.TabularInline):
    model = QuizQuestionOption
    extra = 0
    fields = ("order", "text", "is_correct")
    ordering = ("order",)


class QuizTemplateMaterialInline(admin.TabularInline):
    model = QuizTemplateMaterial
    extra = 0
    fields = ("order", "section", "category")
    raw_id_fields = ("section", "category")
    ordering = ("order",)


class QuizTemplateFileInline(admin.TabularInline):
    model = QuizTemplateFile
    extra = 0
    fields = ("order", "name", "file", "file_type", "uploaded_at")
    readonly_fields = ("uploaded_at",)
    ordering = ("order",)


class QuizTemplateLinkInline(admin.TabularInline):
    model = QuizTemplateLink
    extra = 0
    fields = ("order", "name", "url")
    ordering = ("order",)


class AttemptAnswerInline(admin.TabularInline):
    model = AttemptAnswer
    extra = 0
    fields = ("question", "selected_options", "is_correct", "time_spent_ms", "timed_out", "answered_at")
    readonly_fields = ("question", "selected_options", "is_correct", "time_spent_ms", "timed_out", "answered_at")
    ordering = ("question__order",)

    def has_add_permission(self, request, obj=None):
        return False


class ViolationEventInline(admin.TabularInline):
    model = ViolationEvent
    extra = 0
    fields = ("event_type", "occurred_at", "duration_ms", "risk_contribution")
    readonly_fields = ("event_type", "occurred_at", "duration_ms", "risk_contribution")

    def has_add_permission(self, request, obj=None):
        return False


class QuizAssignmentInline(admin.TabularInline):
    model = QuizAssignment
    extra = 0
    fields = ("unit", "department", "org_role", "is_active", "study_deadline", "attempt_deadline")
    raw_id_fields = ("unit", "department", "org_role")
    show_change_link = True


@admin.register(QuizTemplate)
class QuizTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "unit", "mode", "is_active", "pass_score_pct",
                    "question_count", "assignment_count", "attempt_count", "avg_score", "created_at")
    list_filter = ("company", "mode", "is_active", "unit")
    search_fields = ("name", "description")
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "created_at"
    actions = ["activate_templates", "deactivate_templates", "duplicate_templates"]

    fieldsets = (
        (None, {
            "fields": ("company", "unit", "department", "org_role", "name", "description", "mode", "is_active"),
        }),
        ("Параметры оценки", {
            "fields": ("pass_score_pct", "study_deadline_days", "attempt_deadline_days",
                       "shuffle_questions", "shuffle_options"),
        }),
        ("Античит", {
            "fields": ("policy_config",),
            "classes": ("collapse",),
        }),
        ("Служебное", {
            "fields": ("created_by", "created_at", "updated_at"),
        }),
    )
    inlines = [QuizQuestionInline, QuizTemplateMaterialInline,
               QuizTemplateFileInline, QuizTemplateLinkInline, QuizAssignmentInline]
    raw_id_fields = ("company", "unit", "department", "org_role", "created_by")

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _q_count=Count("questions", distinct=True),
            _assign_count=Count("assignments", distinct=True),
            _attempt_count=Count("assignments__attempts", distinct=True),
            _avg_score=Avg("assignments__attempts__score_pct",
                           filter=Q(assignments__attempts__status__in=["completed", "passed", "passed_with_flags"])),
        )

    @admin.display(description="Вопросов", ordering="_q_count")
    def question_count(self, obj):
        return obj._q_count

    @admin.display(description="Назначений", ordering="_assign_count")
    def assignment_count(self, obj):
        return obj._assign_count

    @admin.display(description="Попыток", ordering="_attempt_count")
    def attempt_count(self, obj):
        return obj._attempt_count

    @admin.display(description="Средний %", ordering="_avg_score")
    def avg_score(self, obj):
        if obj._avg_score is not None:
            return f"{obj._avg_score:.0f}%"
        return "—"

    @admin.action(description="Активировать шаблоны")
    def activate_templates(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Деактивировать шаблоны")
    def deactivate_templates(self, request, queryset):
        queryset.update(is_active=False)

    @admin.action(description="Дублировать шаблоны")
    def duplicate_templates(self, request, queryset):
        for template in queryset:
            questions = list(template.questions.all())
            materials = list(template.materials.all())
            files = list(template.files.all())
            links = list(template.links.all())

            template.pk = None
            template.name = f"{template.name} (копия)"
            template.is_active = False
            template.save()

            for q in questions:
                options = list(q.options.all())
                q.pk = None
                q.template = template
                q.save()
                for opt in options:
                    opt.pk = None
                    opt.question = q
                    opt.save()

            for m in materials:
                m.pk = None
                m.template = template
                m.save()

            for f in files:
                f.pk = None
                f.template = template
                f.save()

            for link in links:
                link.pk = None
                link.template = template
                link.save()

        self.message_user(request, f"Дублировано шаблонов: {queryset.count()}")


@admin.register(QuizQuestion)
class QuizQuestionAdmin(admin.ModelAdmin):
    list_display = ("text_short", "template", "question_type", "timer_seconds", "order", "option_count", "correct_options")
    list_filter = ("question_type", "template__company", "template")
    search_fields = ("text", "template__name")
    list_select_related = ("template",)
    inlines = [QuizQuestionOptionInline]
    raw_id_fields = ("template",)
    list_editable = ("order", "timer_seconds")

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _opt_count=Count("options", distinct=True),
            _correct_count=Count("options", filter=Q(options__is_correct=True), distinct=True),
        )

    @admin.display(description="Текст")
    def text_short(self, obj):
        return obj.text[:80] + ("..." if len(obj.text) > 80 else "")

    @admin.display(description="Вариантов", ordering="_opt_count")
    def option_count(self, obj):
        return obj._opt_count

    @admin.display(description="Верных", ordering="_correct_count")
    def correct_options(self, obj):
        return obj._correct_count


@admin.register(QuizQuestionOption)
class QuizQuestionOptionAdmin(admin.ModelAdmin):
    list_display = ("text_short", "question_short", "is_correct", "order")
    list_filter = ("is_correct", "question__template__company")
    search_fields = ("text", "question__text")
    list_select_related = ("question", "question__template")
    raw_id_fields = ("question",)

    @admin.display(description="Вариант")
    def text_short(self, obj):
        return obj.text[:60]

    @admin.display(description="Вопрос")
    def question_short(self, obj):
        return obj.question.text[:40]


@admin.register(QuizTemplateMaterial)
class QuizTemplateMaterialAdmin(admin.ModelAdmin):
    list_display = ("template", "section", "category", "order")
    list_filter = ("template__company",)
    raw_id_fields = ("template", "section", "category")


@admin.register(QuizTemplateFile)
class QuizTemplateFileAdmin(admin.ModelAdmin):
    list_display = ("name", "template", "file_type", "order", "uploaded_at")
    list_filter = ("file_type", "template__company")
    search_fields = ("name", "template__name")
    raw_id_fields = ("template",)


@admin.register(QuizTemplateLink)
class QuizTemplateLinkAdmin(admin.ModelAdmin):
    list_display = ("name", "template", "url_short", "order")
    search_fields = ("name", "url", "template__name")
    raw_id_fields = ("template",)

    @admin.display(description="URL")
    def url_short(self, obj):
        return obj.url[:60] + ("..." if len(obj.url) > 60 else "")


@admin.register(QuizAssignment)
class QuizAssignmentAdmin(admin.ModelAdmin):
    list_display = ("template", "company", "unit", "department", "org_role",
                    "is_active", "attempt_count", "pass_rate", "assigned_at")
    list_filter = ("is_active", "company", "unit")
    search_fields = ("template__name",)
    list_select_related = ("template", "company", "unit", "department", "org_role")
    raw_id_fields = ("template", "company", "unit", "department", "org_role", "assigned_by")
    date_hierarchy = "assigned_at"
    readonly_fields = ("assigned_at",)
    actions = ["activate_assignments", "deactivate_assignments"]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _attempt_count=Count("attempts", distinct=True),
            _passed_count=Count("attempts", filter=Q(attempts__status__in=["passed", "passed_with_flags"]), distinct=True),
        )

    @admin.display(description="Попыток", ordering="_attempt_count")
    def attempt_count(self, obj):
        return obj._attempt_count

    @admin.display(description="% сдали")
    def pass_rate(self, obj):
        if obj._attempt_count > 0:
            rate = (obj._passed_count / obj._attempt_count) * 100
            return f"{rate:.0f}%"
        return "—"

    @admin.action(description="Активировать назначения")
    def activate_assignments(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Деактивировать назначения")
    def deactivate_assignments(self, request, queryset):
        queryset.update(is_active=False)


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ("employee", "template_name", "status", "status_badge", "score_pct_display",
                    "violation_count", "risk_score_display", "started_at", "duration")
    list_filter = ("status", "company", "assignment__template")
    search_fields = ("employee__full_name", "assignment__template__name")
    list_select_related = ("assignment", "assignment__template", "employee", "company")
    readonly_fields = ("started_at", "completed_at", "question_order", "score_raw", "score_pct",
                       "risk_score", "violation_count", "total_hidden_ms")
    raw_id_fields = ("assignment", "employee", "company")
    date_hierarchy = "started_at"
    inlines = [AttemptAnswerInline, ViolationEventInline]
    actions = ["mark_suspicious", "reset_status_completed"]

    fieldsets = (
        (None, {"fields": ("assignment", "employee", "company", "status")}),
        ("Результат", {"fields": ("score_raw", "score_pct", "current_question_index")}),
        ("Античит", {"fields": ("risk_score", "violation_count", "total_hidden_ms")}),
        ("Время", {"fields": ("started_at", "completed_at", "server_deadline")}),
        ("Техническое", {"fields": ("question_order",), "classes": ("collapse",)}),
    )

    @admin.display(description="Тест")
    def template_name(self, obj):
        return obj.assignment.template.name

    @admin.display(description="Статус")
    def status_badge(self, obj):
        colors = {
            "in_progress": "#3b82f6",
            "completed": "#6b7280",
            "passed": "#10b981",
            "passed_with_flags": "#f59e0b",
            "suspicious_attempt": "#f97316",
            "terminated_for_violation": "#ef4444",
            "expired": "#6b7280",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, obj.get_status_display())

    @admin.display(description="Балл")
    def score_pct_display(self, obj):
        if obj.score_pct is not None:
            pct = obj.score_pct
            color = "#10b981" if pct >= 70 else "#f59e0b" if pct >= 50 else "#ef4444"
            return format_html('<span style="color: {};">{:.0f}%</span>', color, pct)
        return "—"

    @admin.display(description="Риск")
    def risk_score_display(self, obj):
        if obj.risk_score > 0.7:
            color = "#ef4444"
        elif obj.risk_score > 0.3:
            color = "#f59e0b"
        else:
            color = "#10b981"
        return format_html('<span style="color: {};">{:.2f}</span>', color, obj.risk_score)

    @admin.display(description="Длительность")
    def duration(self, obj):
        if obj.started_at and obj.completed_at:
            delta = obj.completed_at - obj.started_at
            minutes = int(delta.total_seconds() // 60)
            seconds = int(delta.total_seconds() % 60)
            return f"{minutes}м {seconds}с"
        return "—"

    @admin.action(description="Пометить как подозрительные")
    def mark_suspicious(self, request, queryset):
        updated = queryset.exclude(status="in_progress").update(status="suspicious_attempt")
        self.message_user(request, f"Помечено: {updated}")

    @admin.action(description="Сбросить статус на completed")
    def reset_status_completed(self, request, queryset):
        updated = queryset.filter(
            status__in=["suspicious_attempt", "passed_with_flags"]
        ).update(status="completed")
        self.message_user(request, f"Сброшено: {updated}")


@admin.register(AttemptAnswer)
class AttemptAnswerAdmin(admin.ModelAdmin):
    list_display = ("attempt", "question_short", "is_correct", "timed_out", "time_spent_display", "answered_at")
    list_filter = ("is_correct", "timed_out", "attempt__company")
    search_fields = ("attempt__employee__full_name", "question__text")
    list_select_related = ("attempt", "attempt__employee", "question")
    raw_id_fields = ("attempt", "question")
    readonly_fields = ("selected_options", "is_correct", "time_spent_ms", "timed_out", "answered_at")

    @admin.display(description="Вопрос")
    def question_short(self, obj):
        return obj.question.text[:50]

    @admin.display(description="Время")
    def time_spent_display(self, obj):
        if obj.time_spent_ms:
            return f"{obj.time_spent_ms / 1000:.1f}с"
        return "—"


@admin.register(ViolationEvent)
class ViolationEventAdmin(admin.ModelAdmin):
    list_display = ("attempt", "employee_name", "event_type", "duration_ms", "risk_contribution", "occurred_at")
    list_filter = ("event_type", "attempt__company")
    search_fields = ("attempt__employee__full_name",)
    list_select_related = ("attempt", "attempt__employee")
    raw_id_fields = ("attempt",)
    date_hierarchy = "occurred_at"
    readonly_fields = ("metadata",)

    @admin.display(description="Сотрудник")
    def employee_name(self, obj):
        return obj.attempt.employee.full_name
