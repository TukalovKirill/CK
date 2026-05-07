from datetime import timedelta
from rest_framework import serializers
from django.utils import timezone

from apps.core.mixins import CompanyScopedCreateMixin
from .quiz_models import (
    QuizTemplate, QuizQuestion, QuizQuestionOption,
    QuizTemplateMaterial, QuizTemplateFile, QuizTemplateLink,
    QuizAssignment, QuizAttempt, AttemptAnswer, ViolationEvent,
)


# ─── Options ──────────────────────────────────────────────

class QuizQuestionOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizQuestionOption
        fields = ("id", "text", "is_correct", "order")


class QuizQuestionOptionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizQuestionOption
        fields = ("id", "text", "is_correct", "order")
        extra_kwargs = {"id": {"read_only": False, "required": False}}


# ─── Questions ────────────────────────────────────────────

class QuizQuestionSerializer(serializers.ModelSerializer):
    options = QuizQuestionOptionSerializer(many=True, read_only=True)

    class Meta:
        model = QuizQuestion
        fields = ("id", "text", "question_type", "order", "timer_seconds", "options")


class QuizQuestionWriteSerializer(serializers.ModelSerializer):
    options = QuizQuestionOptionWriteSerializer(many=True, required=False)

    class Meta:
        model = QuizQuestion
        fields = ("id", "template", "text", "question_type", "order", "timer_seconds", "options")
        extra_kwargs = {"template": {"required": False}}

    def create(self, validated_data):
        options_data = validated_data.pop("options", [])
        question = QuizQuestion.objects.create(**validated_data)
        for i, opt in enumerate(options_data):
            opt.setdefault("order", i)
            QuizQuestionOption.objects.create(question=question, **opt)
        return question

    def update(self, instance, validated_data):
        options_data = validated_data.pop("options", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if options_data is not None:
            existing_ids = set(instance.options.values_list("id", flat=True))
            incoming_ids = set()
            for i, opt in enumerate(options_data):
                opt.setdefault("order", i)
                opt_id = opt.pop("id", None)
                if opt_id and opt_id in existing_ids:
                    QuizQuestionOption.objects.filter(id=opt_id).update(**opt)
                    incoming_ids.add(opt_id)
                else:
                    created = QuizQuestionOption.objects.create(question=instance, **opt)
                    incoming_ids.add(created.id)
            instance.options.exclude(id__in=incoming_ids).delete()

        return instance


# ─── Materials ────────────────────────────────────────────

class QuizTemplateMaterialSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source="section.name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)

    class Meta:
        model = QuizTemplateMaterial
        fields = ("id", "template", "section", "section_name", "category", "category_name", "order")
        extra_kwargs = {"template": {"required": False}}


class QuizTemplateFileSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = QuizTemplateFile
        fields = ("id", "template", "name", "file", "file_url", "file_type", "order", "uploaded_at")
        extra_kwargs = {"template": {"required": False}, "file": {"write_only": True}}

    def get_file_url(self, obj):
        if obj.file:
            return f"/media/{obj.file.name}"
        return None


class QuizTemplateLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizTemplateLink
        fields = ("id", "template", "name", "url", "order")
        extra_kwargs = {"template": {"required": False}}


# ─── Template ─────────────────────────────────────────────

class QuizTemplateListSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    org_role_title = serializers.CharField(source="org_role.title", read_only=True, default=None)
    questions_count = serializers.IntegerField(source="questions.count", read_only=True)
    materials_count = serializers.SerializerMethodField()

    class Meta:
        model = QuizTemplate
        fields = (
            "id", "name", "description", "mode", "is_active",
            "unit", "unit_name", "department", "department_name",
            "org_role", "org_role_title",
            "questions_count", "materials_count",
            "pass_score_pct", "study_deadline_days", "attempt_deadline_days",
            "shuffle_questions", "shuffle_options",
            "created_at", "updated_at",
        )

    def get_materials_count(self, obj):
        return obj.materials.count() + obj.files.count() + obj.links.count()


class QuizTemplateDetailSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    org_role_title = serializers.CharField(source="org_role.title", read_only=True, default=None)
    questions = QuizQuestionSerializer(many=True, read_only=True)
    materials = QuizTemplateMaterialSerializer(many=True, read_only=True)
    files = QuizTemplateFileSerializer(many=True, read_only=True)
    links = QuizTemplateLinkSerializer(many=True, read_only=True)

    class Meta:
        model = QuizTemplate
        fields = (
            "id", "name", "description", "mode", "is_active",
            "unit", "unit_name", "department", "department_name",
            "org_role", "org_role_title",
            "pass_score_pct", "study_deadline_days", "attempt_deadline_days",
            "shuffle_questions", "shuffle_options",
            "questions", "materials", "files", "links",
            "created_at", "updated_at",
        )


class QuizTemplateWriteSerializer(CompanyScopedCreateMixin, serializers.ModelSerializer):
    class Meta:
        model = QuizTemplate
        fields = (
            "id", "name", "description", "unit", "department", "org_role", "mode",
            "is_active", "pass_score_pct",
            "study_deadline_days", "attempt_deadline_days",
            "shuffle_questions", "shuffle_options",
        )

    def create(self, validated_data):
        request = self.context.get("request")
        if request:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


# ─── Assignment ───────────────────────────────────────────

class QuizAssignmentSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    org_role_title = serializers.CharField(source="org_role.title", read_only=True, default=None)

    class Meta:
        model = QuizAssignment
        fields = (
            "id", "template", "template_name",
            "unit", "unit_name", "department", "department_name",
            "org_role", "org_role_title",
            "study_deadline", "attempt_deadline",
            "assigned_at", "is_active",
        )


class QuizAssignmentWriteSerializer(CompanyScopedCreateMixin, serializers.ModelSerializer):
    class Meta:
        model = QuizAssignment
        fields = (
            "id", "template", "unit", "department", "org_role",
            "study_deadline", "attempt_deadline", "is_active",
        )

    def create(self, validated_data):
        request = self.context.get("request")
        if request:
            validated_data["assigned_by"] = request.user
        return super().create(validated_data)


# ─── Attempt (employee-facing) ────────────────────────────

class QuizAttemptStartSerializer(serializers.Serializer):
    assignment = serializers.PrimaryKeyRelatedField(queryset=QuizAssignment.objects.all())


class QuizAttemptAnswerSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    selected_option_ids = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=True,
    )
    time_spent_ms = serializers.IntegerField(min_value=0)
    timed_out = serializers.BooleanField(default=False)


class QuizViolationSerializer(serializers.Serializer):
    event_type = serializers.ChoiceField(
        choices=[c[0] for c in ViolationEvent._meta.get_field("event_type").choices]
    )
    occurred_at = serializers.DateTimeField()
    duration_ms = serializers.IntegerField(min_value=0, default=0)
    metadata = serializers.DictField(required=False, default=dict)


class QuestionForAttemptSerializer(serializers.ModelSerializer):
    options = serializers.SerializerMethodField()

    class Meta:
        model = QuizQuestion
        fields = ("id", "text", "question_type", "timer_seconds", "options")

    def get_options(self, obj):
        options = obj.options.all()
        shuffle = self.context.get("shuffle_options", False)
        if shuffle:
            options = list(options)
            import random
            random.shuffle(options)
        return [{"id": o.id, "text": o.text} for o in options]


# ─── My Tests (employee list) ─────────────────────────────

class MyTestSerializer(serializers.Serializer):
    assignment_id = serializers.IntegerField(source="id")
    template = serializers.SerializerMethodField()
    materials = serializers.SerializerMethodField()
    files = serializers.SerializerMethodField()
    links = serializers.SerializerMethodField()
    study_deadline = serializers.SerializerMethodField()
    attempt_deadline = serializers.SerializerMethodField()
    assigned_at = serializers.DateTimeField()
    my_latest_attempt = serializers.SerializerMethodField()

    def _get_base_date(self, obj):
        request = self.context.get("request")
        user = request.user if request else None
        if not user:
            return obj.assigned_at
        if user.date_joined > obj.assigned_at:
            return user.date_joined
        return obj.assigned_at

    def get_study_deadline(self, obj):
        days = obj.template.study_deadline_days
        if not days:
            return None
        base = self._get_base_date(obj)
        return base + timedelta(days=days)

    def get_attempt_deadline(self, obj):
        study_days = obj.template.study_deadline_days or 0
        attempt_days = obj.template.attempt_deadline_days
        if not attempt_days:
            return None
        base = self._get_base_date(obj)
        return base + timedelta(days=study_days + attempt_days)

    def get_template(self, obj):
        t = obj.template
        return {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "mode": t.mode,
            "questions_count": t.questions.count(),
            "pass_score_pct": t.pass_score_pct,
            "study_deadline_days": t.study_deadline_days,
            "attempt_deadline_days": t.attempt_deadline_days,
        }

    def get_materials(self, obj):
        return [
            {
                "section_id": m.section_id,
                "section_name": m.section.name,
                "category_id": m.category_id,
                "category_name": m.category.name if m.category else None,
            }
            for m in obj.template.materials.select_related("section", "category")
        ]

    def get_files(self, obj):
        result = []
        for f in obj.template.files.all():
            url = f"/media/{f.file.name}" if f.file else None
            result.append({"id": f.id, "name": f.name, "file_url": url, "file_type": f.file_type})
        return result

    def get_links(self, obj):
        return [{"id": lk.id, "name": lk.name, "url": lk.url} for lk in obj.template.links.all()]

    def get_my_latest_attempt(self, obj):
        attempt = getattr(obj, "_latest_attempt", None)
        if attempt is None:
            return None
        return {
            "id": attempt.id,
            "status": attempt.status,
            "score_pct": attempt.score_pct,
            "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        }


# ─── Results / Review ─────────────────────────────────────

class AttemptAnswerReviewSerializer(serializers.ModelSerializer):
    question_text = serializers.CharField(source="question.text", read_only=True)
    question_type = serializers.CharField(source="question.question_type", read_only=True)
    options = serializers.SerializerMethodField()

    class Meta:
        model = AttemptAnswer
        fields = (
            "id", "question_text", "question_type",
            "selected_options", "is_correct",
            "time_spent_ms", "timed_out", "answered_at",
            "options",
        )

    def get_options(self, obj):
        return [
            {"id": o.id, "text": o.text, "is_correct": o.is_correct}
            for o in obj.question.options.all().order_by("order")
        ]


class ViolationEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ViolationEvent
        fields = ("id", "event_type", "occurred_at", "duration_ms", "risk_contribution", "metadata")


class QuizAttemptReviewSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="assignment.template.name", read_only=True)
    employee_name = serializers.SerializerMethodField()
    answers = AttemptAnswerReviewSerializer(many=True, read_only=True)
    violations = ViolationEventSerializer(many=True, read_only=True)

    class Meta:
        model = QuizAttempt
        fields = (
            "id", "template_name", "employee_name",
            "status", "score_raw", "score_pct",
            "risk_score", "violation_count", "total_hidden_ms",
            "started_at", "completed_at",
            "answers", "violations",
        )

    def get_employee_name(self, obj):
        u = obj.employee.user
        return f"{u.last_name} {u.first_name}".strip() or u.email


class QuizResultListSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="assignment.template.name", read_only=True)
    employee_name = serializers.SerializerMethodField()
    employee_id = serializers.IntegerField(source="employee.id", read_only=True)

    class Meta:
        model = QuizAttempt
        fields = (
            "id", "template_name", "employee_name", "employee_id",
            "status", "score_pct", "violation_count", "risk_score", "total_hidden_ms",
            "started_at", "completed_at",
        )

    def get_employee_name(self, obj):
        u = obj.employee.user
        return f"{u.last_name} {u.first_name}".strip() or u.email
