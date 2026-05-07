from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import quiz_views as views

router = DefaultRouter()
router.register("templates", views.QuizTemplateViewSet, basename="quiz-templates")
router.register("questions", views.QuizQuestionViewSet, basename="quiz-questions")
router.register("options", views.QuizOptionViewSet, basename="quiz-options")
router.register("template-materials", views.QuizTemplateMaterialViewSet, basename="quiz-materials")
router.register("template-files", views.QuizTemplateFileViewSet, basename="quiz-files")
router.register("template-links", views.QuizTemplateLinkViewSet, basename="quiz-links")
router.register("assignments", views.QuizAssignmentViewSet, basename="quiz-assignments")

urlpatterns = [
    path("my-tests/", views.MyTestsView.as_view(), name="quiz-my-tests"),
    path("attempts/", views.StartAttemptView.as_view(), name="quiz-start-attempt"),
    path("attempts/<int:attempt_id>/next-question/", views.NextQuestionView.as_view(), name="quiz-next-question"),
    path("attempts/<int:attempt_id>/answer/", views.SubmitAnswerView.as_view(), name="quiz-submit-answer"),
    path("attempts/<int:attempt_id>/violation/", views.LogViolationView.as_view(), name="quiz-log-violation"),
    path("attempts/<int:attempt_id>/complete/", views.CompleteAttemptView.as_view(), name="quiz-complete"),
    path("attempts/<int:attempt_id>/my-result/", views.MyAttemptResultView.as_view(), name="quiz-my-result"),
    path("attempts/<int:attempt_id>/review/", views.AttemptReviewView.as_view(), name="quiz-attempt-review"),
    path("results/", views.QuizResultsView.as_view(), name="quiz-results"),
    path("statistics/", views.QuizStatisticsView.as_view(), name="quiz-statistics"),
    path("", include(router.urls)),
]
