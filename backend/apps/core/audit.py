import logging
import threading

from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)

_thread_locals = threading.local()

EXCLUDED_FIELDS = frozenset({
    "password", "last_login", "date_joined", "token",
})

TRACKED_MODELS = [
    ("core", "Company"),
    ("core", "CustomUser"),
    ("core", "Employee"),
    ("core", "EmployeeAssignment"),
    ("core", "Unit"),
    ("core", "Department"),
    ("core", "OrgRole"),
    ("core", "OrgPermission"),
    ("core", "Zone"),
    ("core", "Invite"),
    ("core", "InviteAssignment"),
    ("textbooks", "CompanyTextbookSettings"),
    ("textbooks", "TextbookSection"),
    ("textbooks", "TextbookCategory"),
    ("textbooks", "TextbookCard"),
    ("textbooks", "CardAssignment"),
    ("textbooks", "CardParagraph"),
    ("textbooks", "CardTag"),
    ("textbooks", "CardPhoto"),
    ("shop", "ShopSettings"),
    ("shop", "ShopCategory"),
    ("shop", "ShopItem"),
    ("shop", "ShopItemAssignment"),
    ("shop", "CoinBalance"),
    ("shop", "CoinTransaction"),
    ("shop", "Order"),
    ("shop", "PurchasedItem"),
    ("shop", "RefundRequest"),
    ("shop", "AutoAccrualRule"),
]

SKIP_PREFIXES = (
    "/static/", "/django-static/", "/media/",
    "/admin/jsi18n/", "/favicon.ico",
)

LOGIN_PATHS = frozenset({
    "/api/auth/login/",
})

METHOD_LABELS = {
    "GET": "Просмотр",
    "POST": "Отправка",
    "PUT": "Обновление",
    "PATCH": "Обновление",
    "DELETE": "Удаление",
}


def get_current_request():
    return getattr(_thread_locals, "request", None)


class AuditMiddleware(MiddlewareMixin):
    def process_request(self, request):
        _thread_locals.request = request

    def process_response(self, request, response):
        try:
            self._log_request(request, response)
        except Exception:
            pass
        finally:
            if hasattr(_thread_locals, "request"):
                del _thread_locals.request
        return response

    @staticmethod
    def _log_request(request, response):
        path = request.path

        for prefix in SKIP_PREFIXES:
            if path.startswith(prefix):
                return

        if not path.startswith(("/api/", "/admin/")):
            return

        user = getattr(request, "user", None)
        is_auth = user and hasattr(user, "is_authenticated") and user.is_authenticated
        method = request.method
        status_code = response.status_code

        is_login = path in LOGIN_PATHS and method == "POST"

        if is_login:
            action = "login_fail" if status_code >= 400 else "login"
            model_label = "Авторизация"
        elif not is_auth:
            return
        else:
            action = "request"
            model_label = METHOD_LABELS.get(method, method)

        from apps.core.models import AuditLog

        company_id = None
        log_user = None
        if is_auth:
            log_user = user
            company_id = getattr(user, "company_id", None)

        if is_login and status_code < 400:
            import json
            try:
                body = json.loads(request.body)
                email = body.get("email", "")
            except Exception:
                email = ""
            object_repr = f"Вход в систему: {email}"
        elif is_login:
            import json
            try:
                body = json.loads(request.body)
                email = body.get("email", "")
            except Exception:
                email = ""
            object_repr = f"Неудачный вход: {email}"
        else:
            object_repr = f"{method} {path} → {status_code}"

        try:
            AuditLog.objects.create(
                user=log_user,
                company_id=company_id,
                action=action,
                model_name=model_label,
                object_id=str(status_code),
                object_repr=object_repr[:255],
                changes={},
                ip_address=_get_client_ip(request),
            )
        except Exception:
            pass


def _get_client_ip(request):
    if not request:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _get_company_id(instance):
    company_id = getattr(instance, "company_id", None)
    if company_id is not None:
        return company_id
    from apps.core.models import Company
    if isinstance(instance, Company):
        return instance.pk
    return None


def _serialize_value(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (dict, list)):
        return value
    result = str(value)
    if len(result) > 500:
        return result[:500] + "…"
    return result


def _serialize_instance(instance):
    data = {}
    for field in instance._meta.fields:
        if field.name in EXCLUDED_FIELDS:
            continue
        value = getattr(instance, field.attname)
        data[field.name] = _serialize_value(value)
    return data


def _create_audit_log(instance, action, changes=None):
    from apps.core.models import AuditLog

    request = get_current_request()
    user = None
    ip_address = None

    if request and hasattr(request, "user") and request.user.is_authenticated:
        user = request.user
    if request:
        ip_address = _get_client_ip(request)

    company_id = _get_company_id(instance)

    try:
        AuditLog.objects.create(
            user=user,
            company_id=company_id,
            action=action,
            model_name=instance._meta.verbose_name,
            object_id=str(instance.pk) if instance.pk else "",
            object_repr=str(instance)[:255],
            changes=changes or {},
            ip_address=ip_address,
        )
    except Exception:
        logger.exception("Failed to create audit log entry")


def _pre_save_handler(sender, instance, **kwargs):
    if not instance.pk:
        instance._audit_old_values = None
        return
    try:
        old = sender.objects.get(pk=instance.pk)
        instance._audit_old_values = _serialize_instance(old)
    except sender.DoesNotExist:
        instance._audit_old_values = None


def _post_save_handler(sender, instance, created, **kwargs):
    if created:
        _create_audit_log(instance, "create")
        return

    old_values = getattr(instance, "_audit_old_values", None)
    if old_values is None:
        _create_audit_log(instance, "update")
        return

    new_values = _serialize_instance(instance)
    changes = {}
    all_keys = set(old_values) | set(new_values)
    for key in all_keys:
        old_val = old_values.get(key)
        new_val = new_values.get(key)
        if old_val != new_val:
            try:
                field = instance._meta.get_field(key)
                label = str(field.verbose_name)
            except Exception:
                label = key
            changes[label] = {"old": old_val, "new": new_val}

    if not changes:
        return

    _create_audit_log(instance, "update", changes)


def _post_delete_handler(sender, instance, **kwargs):
    _create_audit_log(instance, "delete")


def connect_audit_signals():
    from django.apps import apps as django_apps
    from django.db.models.signals import post_delete, post_save, pre_save

    for app_label, model_name in TRACKED_MODELS:
        try:
            model = django_apps.get_model(app_label, model_name)
        except LookupError:
            logger.warning("Audit: model %s.%s not found, skipping", app_label, model_name)
            continue

        pre_save.connect(
            _pre_save_handler, sender=model,
            dispatch_uid=f"audit_pre_{app_label}_{model_name}",
        )
        post_save.connect(
            _post_save_handler, sender=model,
            dispatch_uid=f"audit_post_{app_label}_{model_name}",
        )
        post_delete.connect(
            _post_delete_handler, sender=model,
            dispatch_uid=f"audit_del_{app_label}_{model_name}",
        )
