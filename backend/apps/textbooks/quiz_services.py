import random
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .quiz_models import (
    DEFAULT_POLICY, AttemptStatus, ViolationType,
    QuizTemplate, QuizQuestion, QuizAttempt, AttemptAnswer,
    ViolationEvent, QuizAssignment,
)


def get_policy(template: QuizTemplate) -> dict:
    policy = dict(DEFAULT_POLICY)
    if template.policy_config:
        policy.update(template.policy_config)
    return policy


def compute_risk_contribution(duration_ms: int, policy: dict, consecutive_count: int) -> float:
    weights = policy.get("risk_weights", DEFAULT_POLICY["risk_weights"])
    multiplier = policy.get("consecutive_penalty_multiplier",
                            DEFAULT_POLICY["consecutive_penalty_multiplier"])

    if duration_ms < 1000:
        base = weights.get("under_1s", 1)
    elif duration_ms <= 3000:
        base = weights.get("1_to_3s", 2)
    else:
        base = weights.get("over_3s", 4)

    if consecutive_count > 0:
        base *= multiplier

    return float(base)


def apply_policy(attempt: QuizAttempt, policy: dict) -> dict:
    template = attempt.assignment.template
    if template.mode == "learning":
        return {"action": "none", "message": ""}

    max_warn = policy.get("max_switches_warning", 2)
    max_suspicious = policy.get("max_switches_suspicious", 3)
    max_terminate = policy.get("max_switches_terminate", 5)
    max_hidden_ms = policy.get("max_hidden_time_ms_terminate", 15000)

    if attempt.total_hidden_ms >= max_hidden_ms:
        attempt.status = AttemptStatus.TERMINATED
        attempt.completed_at = timezone.now()
        attempt.save(update_fields=["status", "completed_at"])
        return {
            "action": "terminate",
            "message": "Тест завершён: суммарное время отсутствия превысило допустимый лимит.",
        }

    if attempt.violation_count >= max_terminate:
        attempt.status = AttemptStatus.TERMINATED
        attempt.completed_at = timezone.now()
        attempt.save(update_fields=["status", "completed_at"])
        return {
            "action": "terminate",
            "message": "Тест завершён системой из-за многократных нарушений правил прохождения.",
        }

    if attempt.violation_count >= max_suspicious:
        return {
            "action": "flag_suspicious",
            "message": (
                f"Внимание! Зафиксировано {attempt.violation_count} нарушений. "
                "При повторном нарушении тест будет завершён автоматически."
            ),
        }

    if attempt.violation_count >= max_warn:
        return {
            "action": "warn",
            "message": (
                f"Предупреждение: вы покинули вкладку {attempt.violation_count} раз(а). "
                "Пожалуйста, не переключайтесь во время теста."
            ),
        }

    return {"action": "none", "message": ""}


def process_violation(attempt: QuizAttempt, event_type: str,
                      occurred_at, duration_ms: int, metadata: dict) -> dict:
    policy = get_policy(attempt.assignment.template)

    recent_violations = ViolationEvent.objects.filter(
        attempt=attempt,
        event_type=ViolationType.TAB_HIDDEN,
        occurred_at__gte=occurred_at - timedelta(seconds=60),
    ).count()

    risk = compute_risk_contribution(duration_ms, policy, recent_violations)

    ViolationEvent.objects.create(
        attempt=attempt,
        event_type=event_type,
        occurred_at=occurred_at,
        duration_ms=duration_ms,
        risk_contribution=risk,
        metadata=metadata or {},
    )

    if event_type == ViolationType.TAB_HIDDEN:
        attempt.violation_count += 1
        attempt.risk_score += risk
        attempt.save(update_fields=["violation_count", "risk_score"])
    elif event_type == ViolationType.TAB_VISIBLE and duration_ms > 0:
        attempt.total_hidden_ms += duration_ms
        attempt.save(update_fields=["total_hidden_ms"])

    result = apply_policy(attempt, policy)
    result["attempt_status"] = attempt.status
    result["violation_count"] = attempt.violation_count
    result["risk_score"] = attempt.risk_score
    return result


def evaluate_answer(attempt: QuizAttempt, question: QuizQuestion,
                    selected_ids: list, time_ms: int, timed_out: bool) -> dict:
    correct_ids = set(
        question.options.filter(is_correct=True).values_list("id", flat=True)
    )
    selected_set = set(selected_ids)

    is_correct = (selected_set == correct_ids) and len(selected_ids) > 0

    AttemptAnswer.objects.create(
        attempt=attempt,
        question=question,
        selected_options=selected_ids,
        is_correct=is_correct,
        time_spent_ms=time_ms,
        timed_out=timed_out,
        answered_at=timezone.now(),
    )

    if is_correct:
        attempt.score_raw += 1

    attempt.current_question_index += 1
    attempt.save(update_fields=["score_raw", "current_question_index"])

    return {
        "is_correct": is_correct,
        "next_index": attempt.current_question_index,
        "attempt_status": attempt.status,
    }


def finalize_attempt(attempt: QuizAttempt) -> str:
    if attempt.status != AttemptStatus.IN_PROGRESS:
        return attempt.status

    total_questions = len(attempt.question_order)
    if total_questions > 0:
        attempt.score_pct = round((attempt.score_raw / total_questions) * 100, 1)
    else:
        attempt.score_pct = 0.0

    template = attempt.assignment.template
    passed = attempt.score_pct >= template.pass_score_pct

    if passed:
        if attempt.violation_count > 0:
            attempt.status = AttemptStatus.PASSED_WITH_FLAGS
        else:
            attempt.status = AttemptStatus.PASSED
    else:
        attempt.status = AttemptStatus.COMPLETED

    attempt.completed_at = timezone.now()
    attempt.save(update_fields=["score_pct", "status", "completed_at"])
    return attempt.status


def get_next_question(attempt: QuizAttempt):
    if attempt.current_question_index >= len(attempt.question_order):
        return None
    question_pk = attempt.question_order[attempt.current_question_index]
    try:
        return QuizQuestion.objects.get(pk=question_pk)
    except QuizQuestion.DoesNotExist:
        return None


def build_question_order(template: QuizTemplate) -> list:
    pks = list(template.questions.values_list("id", flat=True))
    if template.shuffle_questions:
        random.shuffle(pks)
    return pks


def resolve_employee_assignments(employee) -> "QuerySet[QuizAssignment]":
    from apps.core.models import EmployeeAssignment

    emp_assignments = EmployeeAssignment.objects.filter(employee=employee)
    unit_ids = set(emp_assignments.values_list("unit_id", flat=True))
    dept_ids = set(emp_assignments.values_list("department_id", flat=True))
    role_ids = set(emp_assignments.values_list("org_role_id", flat=True))

    dept_ids.discard(None)
    role_ids.discard(None)

    if not unit_ids:
        return QuizAssignment.objects.none()

    q = Q(unit_id__in=unit_ids, is_active=True, template__is_active=True)

    filters = Q()
    filters |= Q(department__isnull=True, org_role__isnull=True)
    if dept_ids:
        filters |= Q(department_id__in=dept_ids, org_role__isnull=True)
    if role_ids:
        filters |= Q(org_role_id__in=role_ids)
    if dept_ids and role_ids:
        filters |= Q(department_id__in=dept_ids, org_role_id__in=role_ids)

    return QuizAssignment.objects.filter(q & filters).select_related(
        "template", "unit", "department", "org_role"
    )


def validate_attempt_deadline(attempt: QuizAttempt) -> bool:
    if attempt.server_deadline and timezone.now() > attempt.server_deadline:
        attempt.status = AttemptStatus.EXPIRED
        attempt.completed_at = timezone.now()
        attempt.save(update_fields=["status", "completed_at"])
        return False
    return True
