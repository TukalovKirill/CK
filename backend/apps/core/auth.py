import json

from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Company


class DevContextJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, token = result

        request.dev_context = None

        if user.is_superuser:
            header = request.META.get("HTTP_X_DEV_CONTEXT")
            if header:
                try:
                    ctx = json.loads(header)
                    user.company = Company.objects.get(id=ctx["company_id"])
                    user._dev_org_role_id = ctx.get("org_role_id")
                    user._dev_unit_id = ctx.get("unit_id")
                    user._dev_department_id = ctx.get("department_id")
                    user._dev_company_id = ctx["company_id"]
                    request.dev_context = ctx
                except (json.JSONDecodeError, KeyError, Company.DoesNotExist):
                    pass

        return (user, token)
