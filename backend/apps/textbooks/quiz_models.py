import os
import uuid

from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone


# ─── Enums ────────────────────────────────────────────────

class QuizMode(models.TextChoices):
    LEARNING = "learning", "Обучение"
    EXAM = "exam", "Экзамен"


class QuestionType(models.TextChoices):
    SINGLE = "single", "Один правильный"
    MULTIPLE = "multiple", "Несколько правильных"


class AttemptStatus(models.TextChoices):
    IN_PROGRESS = "in_progress", "В процессе"
    COMPLETED = "completed", "Завершён (не пройден)"
    PASSED = "passed", "Пройден"
    PASSED_WITH_FLAGS = "passed_with_flags", "Пройден с замечаниями"
    SUSPICIOUS = "suspicious_attempt", "Подозрительная попытка"
    TERMINATED = "terminated_for_violation", "Прекращён за нарушения"
    EXPIRED = "expired", "Истёк"


class ViolationType(models.TextChoices):
    TAB_HIDDEN = "tab_hidden", "Вкладка скрыта"
    TAB_VISIBLE = "tab_visible_return", "Возврат на вкладку"
    WINDOW_BLUR = "window_blur", "Окно потеряло фокус"
    WINDOW_FOCUS = "window_focus", "Окно получило фокус"
    FULLSCREEN_EXIT = "fullscreen_exit", "Выход из полноэкранного режима"


class FileType(models.TextChoices):
    PDF = "pdf", "PDF"
    EXCEL = "excel", "Excel"
    IMAGE = "image", "Изображение"
    OTHER = "other", "Другое"


# ─── Template ─────────────────────────────────────────────

DEFAULT_POLICY = {
    "max_switches_warning": 2,
    "max_switches_suspicious": 3,
    "max_switches_terminate": 5,
    "max_hidden_time_ms_terminate": 15000,
    "risk_weights": {"under_1s": 1, "1_to_3s": 2, "over_3s": 4},
    "consecutive_penalty_multiplier": 1.5,
}


class QuizTemplate(models.Model):
    company = models.ForeignKey(
        "core.Company", on_delete=models.CASCADE,
        related_name="quiz_templates", verbose_name="Компания",
    )
    unit = models.ForeignKey(
        "core.Unit", on_delete=models.CASCADE,
        related_name="quiz_templates", verbose_name="Юнит",
    )
    department = models.ForeignKey(
        "core.Department", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="quiz_templates",
        verbose_name="Подразделение",
    )
    org_role = models.ForeignKey(
        "core.OrgRole", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="quiz_templates",
        verbose_name="Должность",
    )
    name = models.CharField("Название", max_length=255)
    description = models.TextField("Описание материалов", blank=True, default="")
    mode = models.CharField(
        "Режим", max_length=10,
        choices=QuizMode.choices, default=QuizMode.EXAM,
    )
    is_active = models.BooleanField("Активен", default=True)
    policy_config = models.JSONField(
        "Настройки античита", default=dict, blank=True,
        help_text="JSON с порогами античита.",
    )
    pass_score_pct = models.PositiveSmallIntegerField(
        "Порог прохождения (%)", default=70,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
    )
    study_deadline_days = models.PositiveSmallIntegerField(
        "Дней на изучение материалов", null=True, blank=True,
    )
    attempt_deadline_days = models.PositiveSmallIntegerField(
        "Дней на прохождение теста", null=True, blank=True,
    )
    shuffle_questions = models.BooleanField("Перемешивать вопросы", default=True)
    shuffle_options = models.BooleanField("Перемешивать варианты", default=False)
    created_by = models.ForeignKey(
        "core.CustomUser", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+", verbose_name="Автор",
    )
    created_at = models.DateTimeField("Создано", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлено", auto_now=True)

    class Meta:
        db_table = "quiz_templates"
        verbose_name = "Шаблон теста"
        verbose_name_plural = "Шаблоны тестов"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "unit"]),
            models.Index(fields=["company", "is_active"]),
        ]

    def __str__(self):
        return self.name


# ─── Questions ────────────────────────────────────────────

class QuizQuestion(models.Model):
    template = models.ForeignKey(
        QuizTemplate, on_delete=models.CASCADE,
        related_name="questions", verbose_name="Шаблон",
    )
    text = models.TextField("Текст вопроса")
    question_type = models.CharField(
        "Тип", max_length=20,
        choices=QuestionType.choices, default=QuestionType.SINGLE,
    )
    order = models.PositiveSmallIntegerField("Порядок", default=0)
    timer_seconds = models.PositiveSmallIntegerField(
        "Таймер (сек)", default=30,
        validators=[MinValueValidator(15), MaxValueValidator(60)],
    )

    class Meta:
        db_table = "quiz_questions"
        verbose_name = "Вопрос теста"
        verbose_name_plural = "Вопросы тестов"
        ordering = ["order"]

    def __str__(self):
        return f"Q{self.order}: {self.text[:50]}"


class QuizQuestionOption(models.Model):
    question = models.ForeignKey(
        QuizQuestion, on_delete=models.CASCADE,
        related_name="options", verbose_name="Вопрос",
    )
    text = models.CharField("Текст варианта", max_length=512)
    is_correct = models.BooleanField("Правильный", default=False)
    order = models.PositiveSmallIntegerField("Порядок", default=0)

    class Meta:
        db_table = "quiz_question_options"
        verbose_name = "Вариант ответа"
        verbose_name_plural = "Варианты ответов"
        ordering = ["order"]

    def __str__(self):
        mark = "✓" if self.is_correct else "✗"
        return f"{mark} {self.text[:40]}"


# ─── Materials ────────────────────────────────────────────

class QuizTemplateMaterial(models.Model):
    template = models.ForeignKey(
        QuizTemplate, on_delete=models.CASCADE,
        related_name="materials", verbose_name="Шаблон",
    )
    section = models.ForeignKey(
        "textbooks.TextbookSection", on_delete=models.CASCADE,
        related_name="quiz_materials", verbose_name="Раздел",
    )
    category = models.ForeignKey(
        "textbooks.TextbookCategory", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="quiz_materials",
        verbose_name="Категория",
    )
    card = models.ForeignKey(
        "textbooks.TextbookCard", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="quiz_materials",
        verbose_name="Карточка учебника (legacy)",
    )
    order = models.PositiveSmallIntegerField("Порядок", default=0)

    class Meta:
        db_table = "quiz_template_materials"
        verbose_name = "Материал теста"
        verbose_name_plural = "Материалы тестов"
        unique_together = ("template", "section", "category")
        ordering = ["order"]

    def __str__(self):
        label = self.category.name if self.category else self.section.name
        return f"{self.template.name} → {label}"


def quiz_file_upload_path(instance, filename):
    ext = os.path.splitext(filename)[1]
    return f"quiz_materials/{instance.template_id}/{uuid.uuid4().hex}{ext}"


class QuizTemplateFile(models.Model):
    template = models.ForeignKey(
        QuizTemplate, on_delete=models.CASCADE,
        related_name="files", verbose_name="Шаблон",
    )
    name = models.CharField("Название файла", max_length=255)
    file = models.FileField("Файл", upload_to=quiz_file_upload_path)
    file_type = models.CharField(
        "Тип файла", max_length=10,
        choices=FileType.choices, default=FileType.OTHER,
    )
    order = models.PositiveSmallIntegerField("Порядок", default=0)
    uploaded_at = models.DateTimeField("Загружен", auto_now_add=True)

    class Meta:
        db_table = "quiz_template_files"
        verbose_name = "Файл теста"
        verbose_name_plural = "Файлы тестов"
        ordering = ["order"]

    def __str__(self):
        return self.name


class QuizTemplateLink(models.Model):
    template = models.ForeignKey(
        QuizTemplate, on_delete=models.CASCADE,
        related_name="links", verbose_name="Шаблон",
    )
    name = models.CharField("Название ссылки", max_length=255)
    url = models.URLField("URL")
    order = models.PositiveSmallIntegerField("Порядок", default=0)

    class Meta:
        db_table = "quiz_template_links"
        verbose_name = "Ссылка теста"
        verbose_name_plural = "Ссылки тестов"
        ordering = ["order"]

    def __str__(self):
        return self.name


# ─── Assignment ───────────────────────────────────────────

class QuizAssignment(models.Model):
    template = models.ForeignKey(
        QuizTemplate, on_delete=models.CASCADE,
        related_name="assignments", verbose_name="Шаблон теста",
    )
    company = models.ForeignKey(
        "core.Company", on_delete=models.CASCADE,
        related_name="quiz_assignments", verbose_name="Компания",
    )
    unit = models.ForeignKey(
        "core.Unit", on_delete=models.CASCADE,
        related_name="quiz_assignments", verbose_name="Юнит",
    )
    department = models.ForeignKey(
        "core.Department", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="quiz_assignments",
        verbose_name="Подразделение",
    )
    org_role = models.ForeignKey(
        "core.OrgRole", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="quiz_assignments",
        verbose_name="Должность",
    )
    study_deadline = models.DateTimeField(
        "Дедлайн изучения", null=True, blank=True,
    )
    attempt_deadline = models.DateTimeField(
        "Дедлайн прохождения", null=True, blank=True,
    )
    assigned_by = models.ForeignKey(
        "core.CustomUser", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+", verbose_name="Назначил",
    )
    assigned_at = models.DateTimeField("Дата назначения", auto_now_add=True)
    is_active = models.BooleanField("Активно", default=True)

    class Meta:
        db_table = "quiz_assignments"
        verbose_name = "Назначение теста"
        verbose_name_plural = "Назначения тестов"
        ordering = ["-assigned_at"]
        indexes = [
            models.Index(fields=["company", "unit"]),
            models.Index(fields=["template", "unit", "department", "org_role"]),
        ]

    def __str__(self):
        return f"{self.template.name} → {self.unit}"


# ─── Attempt ─────────────────────────────────────────────

class QuizAttempt(models.Model):
    assignment = models.ForeignKey(
        QuizAssignment, on_delete=models.CASCADE,
        related_name="attempts", verbose_name="Назначение",
    )
    employee = models.ForeignKey(
        "core.Employee", on_delete=models.CASCADE,
        related_name="quiz_attempts", verbose_name="Сотрудник",
    )
    company = models.ForeignKey(
        "core.Company", on_delete=models.CASCADE,
        related_name="quiz_attempts", verbose_name="Компания",
    )
    status = models.CharField(
        "Статус", max_length=30,
        choices=AttemptStatus.choices, default=AttemptStatus.IN_PROGRESS,
    )
    current_question_index = models.PositiveSmallIntegerField(
        "Текущий индекс вопроса", default=0,
    )
    score_raw = models.PositiveSmallIntegerField("Правильных ответов", default=0)
    score_pct = models.FloatField("Результат (%)", null=True, blank=True)
    risk_score = models.FloatField("Risk score", default=0.0)
    violation_count = models.PositiveSmallIntegerField("Кол-во нарушений", default=0)
    total_hidden_ms = models.PositiveIntegerField(
        "Суммарное время вне страницы (мс)", default=0,
    )
    question_order = models.JSONField(
        "Порядок вопросов", default=list, blank=True,
    )
    server_deadline = models.DateTimeField(
        "Серверный дедлайн", null=True, blank=True,
    )
    started_at = models.DateTimeField("Начато", auto_now_add=True)
    completed_at = models.DateTimeField("Завершено", null=True, blank=True)

    class Meta:
        db_table = "quiz_attempts"
        verbose_name = "Попытка теста"
        verbose_name_plural = "Попытки тестов"
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["company", "employee", "status"]),
            models.Index(fields=["assignment", "employee"]),
        ]

    def __str__(self):
        return f"{self.employee} — {self.assignment.template.name} ({self.status})"


# ─── Attempt Answer ───────────────────────────────────────

class AttemptAnswer(models.Model):
    attempt = models.ForeignKey(
        QuizAttempt, on_delete=models.CASCADE,
        related_name="answers", verbose_name="Попытка",
    )
    question = models.ForeignKey(
        QuizQuestion, on_delete=models.CASCADE,
        related_name="attempt_answers", verbose_name="Вопрос",
    )
    selected_options = models.JSONField(
        "Выбранные варианты (PK)", default=list, blank=True,
    )
    is_correct = models.BooleanField("Верно", null=True, blank=True)
    time_spent_ms = models.PositiveIntegerField("Время ответа (мс)", default=0)
    timed_out = models.BooleanField("Время истекло", default=False)
    answered_at = models.DateTimeField("Время ответа", null=True, blank=True)

    class Meta:
        db_table = "quiz_attempt_answers"
        verbose_name = "Ответ на вопрос"
        verbose_name_plural = "Ответы на вопросы"
        unique_together = ("attempt", "question")

    def __str__(self):
        mark = "✓" if self.is_correct else "✗"
        return f"{mark} {self.question.text[:30]}"


# ─── Violation Event ──────────────────────────────────────

class ViolationEvent(models.Model):
    attempt = models.ForeignKey(
        QuizAttempt, on_delete=models.CASCADE,
        related_name="violations", verbose_name="Попытка",
    )
    event_type = models.CharField(
        "Тип события", max_length=30,
        choices=ViolationType.choices,
    )
    occurred_at = models.DateTimeField("Время события")
    duration_ms = models.PositiveIntegerField("Длительность (мс)", default=0)
    risk_contribution = models.FloatField("Вклад в risk score", default=0.0)
    metadata = models.JSONField("Метаданные", default=dict, blank=True)

    class Meta:
        db_table = "quiz_violation_events"
        verbose_name = "Событие нарушения"
        verbose_name_plural = "События нарушений"
        ordering = ["occurred_at"]
        indexes = [
            models.Index(fields=["attempt", "event_type"]),
            models.Index(fields=["attempt", "occurred_at"]),
        ]

    def __str__(self):
        return f"{self.get_event_type_display()} ({self.duration_ms}ms)"
