import json
from collections import defaultdict

from django.db.models import Max, Prefetch, Avg, Count, Q, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import get_subordinate_role_ids, _is_full_access
from .quiz_models import (
    QuizTemplate, QuizQuestion, QuizQuestionOption,
    QuizTemplateMaterial, QuizTemplateFile, QuizTemplateLink,
    QuizAssignment, QuizAttempt, AttemptAnswer, AttemptStatus,
    ViolationEvent,
)
from .quiz_permissions import (
    CanManageQuizTemplates, CanTakeQuiz, CanViewQuizStats,
)
from .quiz_serializers import (
    QuizTemplateListSerializer, QuizTemplateDetailSerializer, QuizTemplateWriteSerializer,
    QuizQuestionSerializer, QuizQuestionWriteSerializer,
    QuizQuestionOptionSerializer, QuizQuestionOptionWriteSerializer,
    QuizTemplateMaterialSerializer, QuizTemplateFileSerializer, QuizTemplateLinkSerializer,
    QuizAssignmentSerializer, QuizAssignmentWriteSerializer,
    QuizAttemptStartSerializer, QuizAttemptAnswerSerializer, QuizViolationSerializer,
    QuestionForAttemptSerializer, MyTestSerializer,
    QuizAttemptReviewSerializer, QuizResultListSerializer,
)
from .quiz_services import (
    build_question_order, get_next_question, evaluate_answer,
    finalize_attempt, process_violation, validate_attempt_deadline,
    resolve_employee_assignments,
)


# ─── Template CRUD ────────────────────────────────────────

class QuizTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageQuizTemplates]
    pagination_class = None

    def get_queryset(self):
        qs = QuizTemplate.objects.filter(company=self.request.user.company, is_active=True)
        unit = self.request.query_params.get("unit")
        dept = self.request.query_params.get("department")
        role = self.request.query_params.get("org_role")
        if unit:
            qs = qs.filter(unit_id=unit)
        if dept:
            qs = qs.filter(department_id=dept)
        if role:
            qs = qs.filter(org_role_id=role)
        return qs.select_related("unit", "department", "org_role")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return QuizTemplateWriteSerializer
        if self.action == "retrieve":
            return QuizTemplateDetailSerializer
        return QuizTemplateListSerializer

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])

        assignments = QuizAssignment.objects.filter(template=instance, is_active=True)
        QuizAttempt.objects.filter(
            assignment__in=assignments,
            status=AttemptStatus.IN_PROGRESS,
        ).update(status=AttemptStatus.TERMINATED, completed_at=timezone.now())
        assignments.update(is_active=False)

    @action(detail=True, methods=["post"], url_path="reorder-questions")
    def reorder_questions(self, request, pk=None):
        template = self.get_object()
        order = request.data.get("order", [])
        for idx, q_id in enumerate(order):
            QuizQuestion.objects.filter(id=q_id, template=template).update(order=idx)
        return Response({"status": "ok"})


# ─── Question CRUD ────────────────────────────────────────

class QuizQuestionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageQuizTemplates]
    pagination_class = None

    def get_queryset(self):
        qs = QuizQuestion.objects.filter(
            template__company=self.request.user.company
        ).prefetch_related("options")
        template = self.request.query_params.get("template")
        if template:
            qs = qs.filter(template_id=template)
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return QuizQuestionWriteSerializer
        return QuizQuestionSerializer

    def perform_create(self, serializer):
        template_id = self.request.data.get("template")
        template = get_object_or_404(
            QuizTemplate, id=template_id, company=self.request.user.company
        )
        max_order = template.questions.aggregate(m=Max("order"))["m"] or -1
        serializer.save(template=template, order=max_order + 1)


# ─── Option CRUD ──────────────────────────────────────────

class QuizOptionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageQuizTemplates]
    serializer_class = QuizQuestionOptionSerializer
    pagination_class = None

    def get_queryset(self):
        return QuizQuestionOption.objects.filter(
            question__template__company=self.request.user.company
        )

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return QuizQuestionOptionWriteSerializer
        return QuizQuestionOptionSerializer

    def perform_create(self, serializer):
        question_id = self.request.data.get("question")
        question = get_object_or_404(
            QuizQuestion, id=question_id,
            template__company=self.request.user.company,
        )
        max_order = question.options.aggregate(m=Max("order"))["m"] or -1
        serializer.save(question=question, order=max_order + 1)


# ─── Materials CRUD ───────────────────────────────────────

class QuizTemplateMaterialViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageQuizTemplates]
    serializer_class = QuizTemplateMaterialSerializer
    pagination_class = None
    http_method_names = ["get", "post", "delete"]

    def get_queryset(self):
        qs = QuizTemplateMaterial.objects.filter(
            template__company=self.request.user.company
        ).select_related("section", "category")
        template = self.request.query_params.get("template")
        if template:
            qs = qs.filter(template_id=template)
        return qs

    def perform_create(self, serializer):
        template_id = self.request.data.get("template")
        template = get_object_or_404(
            QuizTemplate, id=template_id, company=self.request.user.company
        )
        serializer.save(template=template)


class QuizTemplateFileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageQuizTemplates]
    serializer_class = QuizTemplateFileSerializer
    parser_classes = [JSONParser, MultiPartParser]
    pagination_class = None
    http_method_names = ["get", "post", "delete"]

    def get_queryset(self):
        qs = QuizTemplateFile.objects.filter(
            template__company=self.request.user.company
        )
        template = self.request.query_params.get("template")
        if template:
            qs = qs.filter(template_id=template)
        return qs

    def perform_create(self, serializer):
        template_id = self.request.data.get("template") or self.request.query_params.get("template")
        template = get_object_or_404(
            QuizTemplate, id=template_id, company=self.request.user.company
        )
        file_obj = serializer.validated_data.get("file")
        file_type = "other"
        if file_obj:
            name_lower = file_obj.name.lower()
            if name_lower.endswith(".pdf"):
                file_type = "pdf"
            elif any(name_lower.endswith(ext) for ext in (".xls", ".xlsx", ".csv")):
                file_type = "excel"
            elif any(name_lower.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".gif", ".webp")):
                file_type = "image"
        serializer.save(template=template, file_type=file_type)


class QuizTemplateLinkViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageQuizTemplates]
    serializer_class = QuizTemplateLinkSerializer
    pagination_class = None
    http_method_names = ["get", "post", "delete"]

    def get_queryset(self):
        qs = QuizTemplateLink.objects.filter(
            template__company=self.request.user.company
        )
        template = self.request.query_params.get("template")
        if template:
            qs = qs.filter(template_id=template)
        return qs

    def perform_create(self, serializer):
        template_id = self.request.data.get("template")
        template = get_object_or_404(
            QuizTemplate, id=template_id, company=self.request.user.company
        )
        serializer.save(template=template)


# ─── Assignment CRUD ──────────────────────────────────────

class QuizAssignmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageQuizTemplates]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        qs = QuizAssignment.objects.filter(
            company=self.request.user.company
        ).select_related("template", "unit", "department", "org_role")
        template = self.request.query_params.get("template")
        if template:
            qs = qs.filter(template_id=template)
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "partial_update"):
            return QuizAssignmentWriteSerializer
        return QuizAssignmentSerializer


# ─── Employee: My Tests ───────────────────────────────────

class MyTestsView(APIView):
    permission_classes = [IsAuthenticated, CanTakeQuiz]

    def get(self, request):
        employee = getattr(request.user, "employee_profile", None)
        if not employee:
            return Response([])

        show_all = request.query_params.get("all") == "true" and _is_full_access(request.user)
        if show_all:
            assignments = QuizAssignment.objects.filter(
                template__company=request.user.company,
                template__is_active=True,
                is_active=True,
            ).select_related("template", "unit", "department", "org_role")
        else:
            assignments = resolve_employee_assignments(employee)

        for assignment in assignments:
            latest = QuizAttempt.objects.filter(
                assignment=assignment, employee=employee,
            ).order_by("-started_at").first()
            assignment._latest_attempt = latest

        serializer = MyTestSerializer(assignments, many=True, context={"request": request})
        return Response(serializer.data)


# ─── Employee: Attempt lifecycle ──────────────────────────

class StartAttemptView(APIView):
    permission_classes = [IsAuthenticated, CanTakeQuiz]

    def post(self, request):
        serializer = QuizAttemptStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        assignment = serializer.validated_data["assignment"]
        employee = getattr(request.user, "employee_profile", None)
        if not employee:
            return Response({"error": "Профиль сотрудника не найден"}, status=400)

        if assignment.attempt_deadline and timezone.now() > assignment.attempt_deadline:
            return Response({"error": "Дедлайн прохождения теста истёк"}, status=400)

        existing = QuizAttempt.objects.filter(
            assignment=assignment, employee=employee,
            status=AttemptStatus.IN_PROGRESS,
        ).first()
        if existing:
            return Response({
                "attempt_id": existing.id,
                "server_deadline": existing.server_deadline,
                "total_questions": len(existing.question_order),
                "resumed": True,
            })

        template = assignment.template
        question_order = build_question_order(template)
        if not question_order:
            return Response({"error": "В тесте нет вопросов"}, status=400)

        server_deadline = None
        if assignment.attempt_deadline:
            server_deadline = assignment.attempt_deadline

        attempt = QuizAttempt.objects.create(
            assignment=assignment,
            employee=employee,
            company=request.user.company,
            question_order=question_order,
            server_deadline=server_deadline,
        )

        return Response({
            "attempt_id": attempt.id,
            "server_deadline": attempt.server_deadline,
            "total_questions": len(question_order),
            "resumed": False,
        }, status=201)


class NextQuestionView(APIView):
    permission_classes = [IsAuthenticated, CanTakeQuiz]

    def get(self, request, attempt_id):
        employee = getattr(request.user, "employee_profile", None)
        attempt = get_object_or_404(
            QuizAttempt, id=attempt_id, employee=employee,
        )

        if attempt.status != AttemptStatus.IN_PROGRESS:
            return Response({
                "attempt_status": attempt.status,
                "question": None,
            })

        if not validate_attempt_deadline(attempt):
            return Response({
                "attempt_status": attempt.status,
                "question": None,
            })

        question = get_next_question(attempt)
        if question is None:
            return Response({
                "attempt_status": attempt.status,
                "question": None,
                "total_questions": len(attempt.question_order),
            })

        template = attempt.assignment.template
        serializer = QuestionForAttemptSerializer(
            question,
            context={"shuffle_options": template.shuffle_options, "request": request},
        )

        return Response({
            "question_index": attempt.current_question_index,
            "total_questions": len(attempt.question_order),
            "question": serializer.data,
            "server_now": timezone.now().isoformat(),
            "server_deadline": attempt.server_deadline,
            "attempt_status": attempt.status,
        })


class SubmitAnswerView(APIView):
    permission_classes = [IsAuthenticated, CanTakeQuiz]

    def post(self, request, attempt_id):
        employee = getattr(request.user, "employee_profile", None)
        attempt = get_object_or_404(
            QuizAttempt, id=attempt_id, employee=employee,
            status=AttemptStatus.IN_PROGRESS,
        )

        if not validate_attempt_deadline(attempt):
            return Response({"attempt_status": attempt.status, "expired": True})

        serializer = QuizAttemptAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        question = get_object_or_404(QuizQuestion, id=data["question_id"])

        if AttemptAnswer.objects.filter(attempt=attempt, question=question).exists():
            return Response({"error": "Вопрос уже отвечен"}, status=400)

        result = evaluate_answer(
            attempt, question,
            data["selected_option_ids"],
            data["time_spent_ms"],
            data["timed_out"],
        )

        return Response({
            "next_index": result["next_index"],
            "attempt_status": result["attempt_status"],
        })


class LogViolationView(APIView):
    permission_classes = [IsAuthenticated, CanTakeQuiz]

    def post(self, request, attempt_id):
        employee = getattr(request.user, "employee_profile", None)

        body = request.data
        if not body and request.content_type in ("text/plain", "text/plain;charset=UTF-8"):
            try:
                body = json.loads(request.body)
            except (json.JSONDecodeError, ValueError):
                return Response({"error": "Invalid JSON"}, status=400)

        attempt = get_object_or_404(
            QuizAttempt, id=attempt_id, employee=employee,
            status=AttemptStatus.IN_PROGRESS,
        )

        serializer = QuizViolationSerializer(data=body)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result = process_violation(
            attempt,
            data["event_type"],
            data["occurred_at"],
            data["duration_ms"],
            data["metadata"],
        )

        return Response(result)


class CompleteAttemptView(APIView):
    permission_classes = [IsAuthenticated, CanTakeQuiz]

    def post(self, request, attempt_id):
        employee = getattr(request.user, "employee_profile", None)
        attempt = get_object_or_404(
            QuizAttempt, id=attempt_id, employee=employee,
            status=AttemptStatus.IN_PROGRESS,
        )

        final_status = finalize_attempt(attempt)

        return Response({
            "status": final_status,
            "score_raw": attempt.score_raw,
            "score_pct": attempt.score_pct,
            "pass_score_pct": attempt.assignment.template.pass_score_pct,
            "violation_count": attempt.violation_count,
            "risk_score": attempt.risk_score,
            "total_questions": len(attempt.question_order),
        })


# ─── Result (employee's own attempt) ─────────────────────

class MyAttemptResultView(APIView):
    permission_classes = [IsAuthenticated, CanTakeQuiz]

    def get(self, request, attempt_id):
        employee = getattr(request.user, "employee_profile", None)
        attempt = get_object_or_404(
            QuizAttempt.objects.select_related("assignment__template"),
            id=attempt_id, employee=employee,
        )
        if attempt.status == AttemptStatus.IN_PROGRESS:
            return Response(
                {"error": "Тест ещё не завершён"}, status=400,
            )
        return Response({
            "status": attempt.status,
            "score_raw": attempt.score_raw,
            "score_pct": attempt.score_pct,
            "pass_score_pct": attempt.assignment.template.pass_score_pct,
            "violation_count": attempt.violation_count,
            "total_questions": len(attempt.question_order),
            "template_name": attempt.assignment.template.name,
            "started_at": attempt.started_at,
            "completed_at": attempt.completed_at,
        })


# ─── Results (manager) ────────────────────────────────────

class QuizResultsView(APIView):
    permission_classes = [IsAuthenticated, CanViewQuizStats]

    def get(self, request):
        company = request.user.company
        qs = QuizAttempt.objects.filter(company=company).select_related(
            "assignment__template", "employee__user",
        ).exclude(status=AttemptStatus.IN_PROGRESS)

        unit = request.query_params.get("unit")
        department = request.query_params.get("department")
        org_role = request.query_params.get("org_role")
        template = request.query_params.get("template")

        if unit:
            qs = qs.filter(assignment__unit_id=unit)
        if department:
            qs = qs.filter(assignment__department_id=department)
        if org_role:
            qs = qs.filter(assignment__org_role_id=org_role)
        if template:
            qs = qs.filter(assignment__template_id=template)

        subordinate_role_ids = get_subordinate_role_ids(request.user)
        if subordinate_role_ids is not None:
            from apps.core.models import EmployeeAssignment
            subordinate_employee_ids = set(
                EmployeeAssignment.objects.filter(
                    org_role_id__in=subordinate_role_ids
                ).values_list("employee_id", flat=True)
            )
            qs = qs.filter(employee_id__in=subordinate_employee_ids)

        qs = qs.order_by("-started_at")[:200]
        serializer = QuizResultListSerializer(qs, many=True)
        return Response(serializer.data)


class AttemptReviewView(APIView):
    permission_classes = [IsAuthenticated, CanViewQuizStats]

    def get(self, request, attempt_id):
        attempt = get_object_or_404(
            QuizAttempt.objects.select_related(
                "assignment__template", "employee__user",
            ).prefetch_related("answers__question", "violations"),
            id=attempt_id, company=request.user.company,
        )
        serializer = QuizAttemptReviewSerializer(attempt)
        return Response(serializer.data)


# ─── Statistics (dashboard) ──────────────────────────────

FINISHED_STATUSES = [
    AttemptStatus.COMPLETED,
    AttemptStatus.PASSED,
    AttemptStatus.PASSED_WITH_FLAGS,
    AttemptStatus.SUSPICIOUS,
    AttemptStatus.TERMINATED,
    AttemptStatus.EXPIRED,
]

PASSED_STATUSES = [AttemptStatus.PASSED, AttemptStatus.PASSED_WITH_FLAGS]

VIOLATION_STATUSES = [AttemptStatus.SUSPICIOUS, AttemptStatus.TERMINATED]


class QuizStatisticsView(APIView):
    permission_classes = [IsAuthenticated, CanViewQuizStats]

    def get(self, request):
        company = request.user.company

        qs = QuizAttempt.objects.filter(
            company=company,
            status__in=FINISHED_STATUSES,
        ).select_related(
            "assignment__template",
            "assignment__unit",
            "assignment__department",
            "assignment__org_role",
            "employee__user",
        )

        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        unit = request.query_params.get("unit")
        department = request.query_params.get("department")
        org_role = request.query_params.get("org_role")
        template_id = request.query_params.get("template")

        if date_from:
            from datetime import datetime
            dt = datetime.strptime(date_from, "%Y-%m-%d")
            qs = qs.filter(completed_at__gte=timezone.make_aware(
                dt.replace(hour=0, minute=0, second=0), timezone.get_current_timezone(),
            ))
        if date_to:
            from datetime import datetime
            dt = datetime.strptime(date_to, "%Y-%m-%d")
            qs = qs.filter(completed_at__lte=timezone.make_aware(
                dt.replace(hour=23, minute=59, second=59), timezone.get_current_timezone(),
            ))
        if unit:
            qs = qs.filter(assignment__unit_id=unit)
        if department:
            qs = qs.filter(assignment__department_id=department)
        if org_role:
            qs = qs.filter(assignment__org_role_id=org_role)
        if template_id:
            qs = qs.filter(assignment__template_id=template_id)

        subordinate_role_ids = get_subordinate_role_ids(request.user)
        if subordinate_role_ids is not None:
            from apps.core.models import EmployeeAssignment
            sub_emp_ids = set(
                EmployeeAssignment.objects.filter(
                    org_role_id__in=subordinate_role_ids,
                ).values_list("employee_id", flat=True)
            )
            qs = qs.filter(employee_id__in=sub_emp_ids)

        attempts = list(qs)
        total = len(attempts)

        if total == 0:
            return Response({
                "summary": {
                    "total": 0, "passed": 0, "pass_rate": 0,
                    "avg_score": 0, "violations": 0,
                },
                "trend": [],
                "by_employee": [],
                "by_template": [],
                "by_department": [],
                "hard_questions": [],
            })

        passed = sum(1 for a in attempts if a.status in PASSED_STATUSES)
        violations = sum(1 for a in attempts if a.status in VIOLATION_STATUSES)
        avg_score = sum(a.score_pct or 0 for a in attempts) / total

        summary = {
            "total": total,
            "passed": passed,
            "pass_rate": round(passed / total * 100, 1) if total else 0,
            "avg_score": round(avg_score, 1),
            "violations": violations,
        }

        # ── Trend ──
        current_tz = timezone.get_current_timezone()
        trend_map = defaultdict(lambda: {"total": 0, "passed": 0, "sum_score": 0, "violations": 0})
        for a in attempts:
            if not a.completed_at:
                continue
            day = a.completed_at.astimezone(current_tz).date().isoformat()
            trend_map[day]["total"] += 1
            if a.status in PASSED_STATUSES:
                trend_map[day]["passed"] += 1
            trend_map[day]["sum_score"] += (a.score_pct or 0)
            if a.status in VIOLATION_STATUSES:
                trend_map[day]["violations"] += 1

        trend = []
        for day in sorted(trend_map):
            d = trend_map[day]
            trend.append({
                "date": day,
                "total": d["total"],
                "passed": d["passed"],
                "pass_rate": round(d["passed"] / d["total"] * 100, 1) if d["total"] else 0,
                "avg_score": round(d["sum_score"] / d["total"], 1) if d["total"] else 0,
                "violations": d["violations"],
            })

        # ── By employee ──
        emp_map = defaultdict(lambda: {
            "name": "", "department": "", "total": 0,
            "passed": 0, "sum_score": 0, "violations": 0,
        })
        for a in attempts:
            eid = a.employee_id
            e = emp_map[eid]
            if not e["name"]:
                emp = a.employee
                e["name"] = (
                    f"{emp.user.last_name} {emp.user.first_name}".strip()
                    if emp.user else f"Employee #{eid}"
                )
                dept = a.assignment.department
                e["department"] = dept.name if dept else ""
            e["total"] += 1
            if a.status in PASSED_STATUSES:
                e["passed"] += 1
            e["sum_score"] += (a.score_pct or 0)
            if a.status in VIOLATION_STATUSES:
                e["violations"] += 1

        by_employee = []
        for eid, e in emp_map.items():
            by_employee.append({
                "employee_id": eid,
                "name": e["name"],
                "department": e["department"],
                "total": e["total"],
                "passed": e["passed"],
                "pass_rate": round(e["passed"] / e["total"] * 100, 1) if e["total"] else 0,
                "avg_score": round(e["sum_score"] / e["total"], 1) if e["total"] else 0,
                "violations": e["violations"],
            })
        by_employee.sort(key=lambda x: x["avg_score"], reverse=True)

        # ── By template ──
        tpl_map = defaultdict(lambda: {"name": "", "mode": "", "total": 0, "passed": 0, "sum_score": 0})
        for a in attempts:
            tid = a.assignment.template_id
            t = tpl_map[tid]
            if not t["name"]:
                t["name"] = a.assignment.template.name
                t["mode"] = a.assignment.template.mode
            t["total"] += 1
            if a.status in PASSED_STATUSES:
                t["passed"] += 1
            t["sum_score"] += (a.score_pct or 0)

        by_template = []
        for tid, t in tpl_map.items():
            by_template.append({
                "template_id": tid,
                "name": t["name"],
                "mode": t["mode"],
                "total": t["total"],
                "passed": t["passed"],
                "pass_rate": round(t["passed"] / t["total"] * 100, 1) if t["total"] else 0,
                "avg_score": round(t["sum_score"] / t["total"], 1) if t["total"] else 0,
            })
        by_template.sort(key=lambda x: x["avg_score"])

        # ── By department ──
        dept_map = defaultdict(lambda: {"department_name": "", "unit_name": "", "total": 0, "passed": 0, "sum_score": 0})
        for a in attempts:
            dept = a.assignment.department
            key = dept.id if dept else 0
            d = dept_map[key]
            if not d["department_name"]:
                d["department_name"] = dept.name if dept else "Без подразделения"
                u = a.assignment.unit
                d["unit_name"] = u.name if u else ""
            d["total"] += 1
            if a.status in PASSED_STATUSES:
                d["passed"] += 1
            d["sum_score"] += (a.score_pct or 0)

        by_department = []
        for did, d in dept_map.items():
            by_department.append({
                "department_id": did,
                "department_name": d["department_name"],
                "unit_name": d["unit_name"],
                "total": d["total"],
                "passed": d["passed"],
                "pass_rate": round(d["passed"] / d["total"] * 100, 1) if d["total"] else 0,
                "avg_score": round(d["sum_score"] / d["total"], 1) if d["total"] else 0,
            })
        by_department.sort(key=lambda x: x["avg_score"])

        # ── Hard questions ──
        attempt_ids = [a.id for a in attempts]
        answers_qs = AttemptAnswer.objects.filter(
            attempt_id__in=attempt_ids,
        ).select_related("question__template")

        q_map = defaultdict(lambda: {"text": "", "template_name": "", "total": 0, "correct": 0, "sum_time_ms": 0, "timeouts": 0})
        for ans in answers_qs.iterator():
            qid = ans.question_id
            q = q_map[qid]
            if not q["text"]:
                q["text"] = ans.question.text[:120]
                q["template_name"] = ans.question.template.name if ans.question.template else ""
            q["total"] += 1
            if ans.is_correct:
                q["correct"] += 1
            q["sum_time_ms"] += (ans.time_spent_ms or 0)
            if ans.timed_out:
                q["timeouts"] += 1

        hard_questions = []
        for qid, q in q_map.items():
            if q["total"] < 2:
                continue
            correct_rate = round(q["correct"] / q["total"] * 100, 1)
            hard_questions.append({
                "question_id": qid,
                "text": q["text"],
                "template_name": q["template_name"],
                "total_answers": q["total"],
                "correct_rate": correct_rate,
                "avg_time_ms": round(q["sum_time_ms"] / q["total"]),
                "timeouts": q["timeouts"],
            })
        hard_questions.sort(key=lambda x: x["correct_rate"])
        hard_questions = hard_questions[:15]

        return Response({
            "summary": summary,
            "trend": trend,
            "by_employee": by_employee,
            "by_template": by_template,
            "by_department": by_department,
            "hard_questions": hard_questions,
        })
