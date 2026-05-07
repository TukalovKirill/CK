from .permissions import TextbookModuleEnabled, has_org_permission


class QuizModuleEnabled(TextbookModuleEnabled):
    pass


class QuizPermission(QuizModuleEnabled):
    permission_code = None

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if self.permission_code is None:
            return True
        return has_org_permission(request.user, self.permission_code)


class CanManageQuizTemplates(QuizPermission):
    permission_code = "quizzes.manage_templates"


class CanTakeQuiz(QuizPermission):
    permission_code = "quizzes.take"


class CanViewQuizStats(QuizPermission):
    permission_code = "quizzes.view_stats"
