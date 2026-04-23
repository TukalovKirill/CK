# Аутентификация, регистрация и страница команды — спецификация для реализации

Документ описывает полную реализацию системы аутентификации (логин, регистрация, инвайты) и страницы управления командой. Предназначен для воспроизведения в другом репозитории.

**Стек**: Django 5.2 + DRF 3.16 + SimpleJWT 5.5 + Channels 4.3, React 19 + Vite 6, PostgreSQL, Redis

---

## Оглавление

1. [Модели данных](#1-модели-данных)
2. [JWT-конфигурация](#2-jwt-конфигурация)
3. [Сериализаторы аутентификации](#3-сериализаторы-аутентификации)
4. [Views аутентификации](#4-views-аутентификации)
5. [Кастомная JWT-аутентификация](#5-кастомная-jwt-аутентификация)
6. [Система пермишенов (RBAC)](#6-система-пермишенов-rbac)
7. [API-эндпоинты аутентификации](#7-api-эндпоинты-аутентификации)
8. [Frontend: API-слой аутентификации](#8-frontend-api-слой-аутентификации)
9. [Frontend: Axios-инстанс и refresh-интерцептор](#9-frontend-axios-инстанс-и-refresh-интерцептор)
10. [Frontend: AuthContext](#10-frontend-authcontext)
11. [Frontend: Route Guards](#11-frontend-route-guards)
12. [Frontend: Страница логина](#12-frontend-страница-логина)
13. [Frontend: Страница регистрации](#13-frontend-страница-регистрации)
14. [Frontend: Страница принятия инвайта](#14-frontend-страница-принятия-инвайта)
15. [Сериализаторы команды](#15-сериализаторы-команды)
16. [Views команды](#16-views-команды)
17. [API-эндпоинты команды](#17-api-эндпоинты-команды)
18. [Frontend: API-слой команды](#18-frontend-api-слой-команды)
19. [Frontend: Страница команды](#19-frontend-страница-команды)
20. [Real-time обновления](#20-real-time-обновления)
21. [Полные потоки данных](#21-полные-потоки-данных)

---

## 1. Модели данных

### 1.1 CustomUserManager

Кастомный менеджер для email-аутентификации (без username).

```python
class CustomUserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email обязателен")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        if extra_fields.get("is_active") is None:
            user.is_active = True
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        if password is None:
            raise ValueError("Пароль обязателен для суперпользователя")
        return self.create_user(email, password, **extra_fields)
```

### 1.2 CustomUser

```python
class CustomUser(AbstractUser):
    username = None
    email = models.EmailField("Email", unique=True, db_index=True)
    company = models.ForeignKey(
        Company, on_delete=models.CASCADE,
        null=True, blank=True, related_name="users"
    )
    ROLE_CHOICES = (
        ("owner", "Владелец"),
        ("employee", "Сотрудник"),
    )
    role = models.CharField("Роль", max_length=20, choices=ROLE_CHOICES, default="owner")

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = CustomUserManager()
```

**Важно**: `role` на уровне User — только "owner" vs "employee" (является ли владельцем компании). Гранулярные права — через `OrgRole` + `OrgPermission`.

### 1.3 Company

```python
class Company(models.Model):
    name = models.CharField("Название", max_length=255)
    timezone = models.CharField("Часовой пояс", max_length=64, default="Europe/Moscow")
    created_at = models.DateTimeField(auto_now_add=True)
```

**Сигнал `post_save`**: при создании Company автоматически создаются две системные `OrgRole`:
- `developer` (корневая, `is_system=True`, `is_assignable=False`) — все пермишены
- `owner` (child от developer, `is_system=True`, `is_assignable=False`) — все пермишены

### 1.4 Employee

```python
class Employee(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="employees")
    user = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE,
        related_name="employee_profile", null=True, blank=True
    )
    org_role = models.ForeignKey(OrgRole, on_delete=models.SET_NULL, null=True, blank=True)  # legacy
    units = models.ManyToManyField(Unit, blank=True, related_name="employees")  # denormalized

    full_name = models.CharField("ФИО", max_length=255, blank=True, default="")
    birth_date = models.DateField("Дата рождения", null=True, blank=True)
    grade = models.PositiveSmallIntegerField("Грейд", default=1, validators=[MinValueValidator(0), MaxValueValidator(5)])
    avatar_url = models.URLField("Аватар (URL)", blank=True, default="")
    pattern = models.CharField("Паттерн работы", max_length=16,
        choices=(("5/2", "5/2"), ("2/2", "2/2"), ("flex", "Гибкий")), default="flex")
    can_split = models.BooleanField("Сплит-смены", default=False)
    can_extra = models.BooleanField("Доп. смены", default=True)

    def save(self, *args, **kwargs):
        if not (self.full_name or "").strip() and self.user:
            fn = f"{self.user.first_name or ''} {self.user.last_name or ''}".strip()
            if fn:
                self.full_name = fn
        super().save(*args, **kwargs)
```

### 1.5 EmployeeAssignment

Назначение сотрудника: юнит + департамент + роль. Один сотрудник может иметь несколько назначений.

```python
class EmployeeAssignment(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="assignments")
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="assignments")
    department = models.ForeignKey(Department, on_delete=models.CASCADE, null=True, blank=True)
    org_role = models.ForeignKey(OrgRole, on_delete=models.CASCADE, related_name="assignments")

    class Meta:
        unique_together = ("employee", "unit", "org_role")
```

### 1.6 Invite

```python
class Invite(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="invites")
    invited_by = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, blank=True)
    email = models.EmailField("Email")
    first_name = models.CharField("Имя", max_length=150, blank=True, default="")
    last_name = models.CharField("Фамилия", max_length=150, blank=True, default="")
    grade = models.PositiveSmallIntegerField("Грейд", default=0, validators=[MinValueValidator(0), MaxValueValidator(5)])

    # Legacy (обратная совместимость):
    org_role = models.ForeignKey(OrgRole, on_delete=models.SET_NULL, null=True, blank=True)
    unit = models.ForeignKey(Unit, on_delete=models.SET_NULL, null=True, blank=True)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)

    token = models.CharField("Токен", max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField("Истекает")
    STATUS = (
        ("pending", "Ожидает"),
        ("accepted", "Принято"),
        ("revoked", "Отозвано"),
        ("expired", "Истекло"),
    )
    status = models.CharField("Статус", max_length=20, choices=STATUS, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("company", "email")

    @staticmethod
    def make_token():
        return secrets.token_urlsafe(32)

    @staticmethod
    def default_expire(days=14):
        return timezone.now() + timezone.timedelta(days=days)

    def is_usable(self):
        return self.status == "pending" and timezone.now() < self.expires_at
```

### 1.7 InviteAssignment

При принятии инвайта каждая запись превращается в `EmployeeAssignment`.

```python
class InviteAssignment(models.Model):
    invite = models.ForeignKey(Invite, on_delete=models.CASCADE, related_name="invite_assignments")
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, null=True, blank=True)
    org_role = models.ForeignKey(OrgRole, on_delete=models.CASCADE)

    class Meta:
        unique_together = ("invite", "unit", "org_role")
```

---

## 2. JWT-конфигурация

### settings.py

```python
AUTH_USER_MODEL = "core.CustomUser"

INSTALLED_APPS = [
    ...
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.core",
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.core.auth.DevContextJWTAuthentication",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

CORS_ALLOW_HEADERS = [
    ...стандартные...,
    "x-dev-context",  # кастомный заголовок для dev-контекста суперюзера
]
```

---

## 3. Сериализаторы аутентификации

### 3.1 CustomTokenObtainPairSerializer

```python
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "email"
```

Единственное изменение — поле логина `email` вместо `username`. Никаких дополнительных claims.

### 3.2 RegisterSerializer

```python
class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    first_name = serializers.CharField(max_length=150, required=False, default="")
    last_name = serializers.CharField(max_length=150, required=False, default="")
    company_name = serializers.CharField(max_length=255, required=False, default="")

    def validate_email(self, value):
        if CustomUser.objects.filter(email__iexact=value).exists():
            raise ValidationError("Пользователь с таким email уже существует.")
        return value

    def create(self, validated_data):
        email = validated_data["email"]
        company_name = validated_data.get("company_name") or f"{email.split('@')[0]} — компания"

        company = Company.objects.create(name=company_name)
        # post_save сигнал создаёт OrgRole: developer + owner (с полными пермишенами)

        owner_role = OrgRole.objects.filter(company=company, code="owner").first()

        user = CustomUser.objects.create_user(
            email=email,
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            company=company,
            role="owner",
            is_active=True,
        )

        Employee.objects.create(
            company=company,
            user=user,
            org_role=owner_role,
            full_name=f"{user.first_name} {user.last_name}".strip(),
        )

        return user
```

### 3.3 AcceptInviteSerializer

```python
class AcceptInviteSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=8, write_only=True)
    agree = serializers.BooleanField()
    birth_date = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if not attrs.get("agree"):
            raise ValidationError({"agree": "Необходимо согласие."})

        invite = Invite.objects.filter(token=attrs["token"]).first()
        if not invite:
            raise ValidationError({"token": "Приглашение не найдено."})
        if invite.status != "pending":
            raise ValidationError({"token": f"Статус приглашения: {invite.status}"})
        if not invite.is_usable():
            raise ValidationError({"token": "Приглашение просрочено."})
        if CustomUser.objects.filter(email__iexact=invite.email).exists():
            raise ValidationError({"token": "Пользователь с таким email уже зарегистрирован."})

        attrs["invite"] = invite

        # Гибкий парсинг даты рождения (YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY)
        raw = (attrs.get("birth_date") or "").strip()
        if raw:
            for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
                try:
                    attrs["birth_date"] = datetime.strptime(raw, fmt).date()
                    break
                except ValueError:
                    continue
            else:
                attrs["birth_date"] = None
        else:
            attrs["birth_date"] = None

        return attrs

    def create(self, validated_data):
        invite = validated_data["invite"]

        user = CustomUser.objects.create_user(
            email=invite.email,
            password=validated_data["password"],
            first_name=invite.first_name,
            last_name=invite.last_name,
            company=invite.company,
            role="employee",
            is_active=True,
        )

        employee, _ = Employee.objects.update_or_create(
            company=invite.company,
            user=user,
            defaults={
                "full_name": f"{invite.first_name} {invite.last_name}".strip(),
                "grade": invite.grade or 0,
                "birth_date": validated_data.get("birth_date"),
            },
        )

        # Конвертация InviteAssignment → EmployeeAssignment
        invite_assignments = invite.invite_assignments.select_related("unit", "department", "org_role").all()
        if invite_assignments.exists():
            for ia in invite_assignments:
                if ia.org_role and ia.org_role.is_assignable:
                    EmployeeAssignment.objects.get_or_create(
                        employee=employee,
                        unit=ia.unit,
                        org_role=ia.org_role,
                        defaults={"department": ia.department},
                    )
                    employee.units.add(ia.unit)
        elif invite.unit and invite.org_role:
            # Fallback на legacy поля
            if invite.org_role.is_assignable:
                EmployeeAssignment.objects.get_or_create(
                    employee=employee,
                    unit=invite.unit,
                    org_role=invite.org_role,
                    defaults={"department": invite.department},
                )
                employee.units.add(invite.unit)

        invite.status = "accepted"
        invite.save(update_fields=["status"])

        return {"user_id": user.pk, "employee_id": employee.pk}
```

### 3.4 UserSerializer (GET /api/me/)

```python
class UserSerializer(serializers.ModelSerializer):
    employee_id = serializers.SerializerMethodField()
    org_role_id = serializers.SerializerMethodField()
    org_role_code = serializers.SerializerMethodField()
    org_role_title = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    unit_permissions = serializers.SerializerMethodField()
    can_manage_permissions = serializers.SerializerMethodField()
    birth_date = serializers.SerializerMethodField()
    assignments = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = [
            "id", "email", "role", "company", "is_superuser",
            "employee_id", "org_role_id", "org_role_code", "org_role_title",
            "permissions", "unit_permissions", "can_manage_permissions",
            "birth_date", "assignments",
        ]
```

**Логика полей**:
- `permissions` — список кодов пермишенов (все коды если owner/superuser → `None` трактуется как «полный доступ»)
- `unit_permissions` — `{unit_id: [code1, code2, ...]}` или `null` для full access
- `assignments` — все `EmployeeAssignment` записи
- При активном dev-контексте (суперюзер) — подменяет permissions/assignments/role на имитируемую роль

---

## 4. Views аутентификации

### 4.1 CustomTokenObtainPairView (Логин)

```python
class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
```

POST `/api/auth/login/` — возвращает `{access, refresh}`.

### 4.2 CustomTokenRefreshView

```python
class CustomTokenRefreshView(TokenRefreshView):
    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except CustomUser.DoesNotExist:
            return Response(
                {"detail": "Пользователь не найден", "code": "user_not_found"},
                status=401,
            )
```

### 4.3 RegisterView

```python
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = RegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            "user": UserSerializer(user).data,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }, status=201)
```

Регистрация сразу возвращает токены — без подтверждения email.

### 4.4 AcceptInviteView

```python
class AcceptInviteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = AcceptInviteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = ser.save()
        return Response({"status": "ok", **result}, status=201)
```

Токены НЕ возвращаются — клиент перенаправляет на `/login?pwd_set=1`.

### 4.5 MeViewSet (Текущий пользователь)

```python
class MeViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        data = UserSerializer(request.user).data
        # Если dev_context — подменяет permissions, assignments, role
        if request.dev_context:
            data["permissions"] = [...]  # пермишены имитируемой роли
            data["unit_permissions"] = {...}
            data["assignments"] = [...]
            data["is_superuser"] = False
            data["role"] = "employee"
        return Response(data)
```

### 4.6 CheckDevView (Детекция суперюзера)

```python
class CheckDevView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [...]  # 5 запросов в минуту

    def post(self, request):
        user = authenticate(email=request.data.get("email"), password=request.data.get("password"))
        if user and user.is_superuser:
            companies = Company.objects.values("id", "name")
            return Response({"is_dev": True, "companies": list(companies)})
        return Response({"is_dev": False})
```

### 4.7 DevContextOptionsView

```python
class DevContextOptionsView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [...]  # 5 запросов в минуту

    def post(self, request):
        # Аутентификация + проверка superuser + company_id
        # Возвращает: units, departments, roles для выбранной компании
```

---

## 5. Кастомная JWT-аутентификация

### 5.1 DevContextJWTAuthentication (HTTP)

```python
class DevContextJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, token = result

        if user.is_superuser:
            header = request.META.get("HTTP_X_DEV_CONTEXT")
            if header:
                ctx = json.loads(header)
                user.company = Company.objects.get(id=ctx["company_id"])
                user._dev_org_role_id = ctx.get("org_role_id")
                user._dev_unit_id = ctx.get("unit_id")
                user._dev_department_id = ctx.get("department_id")
                user._dev_company_id = ctx["company_id"]
                request.dev_context = ctx

        return (user, token)
```

Глобальный класс аутентификации — используется для всех запросов. Позволяет суперюзеру имитировать любую роль в любой компании через заголовок `X-Dev-Context`.

### 5.2 JWTAuthMiddleware (WebSocket)

```python
class JWTAuthMiddleware:
    """Django Channels middleware — читает token из query string ?token=..."""

    async def __call__(self, scope, receive, send):
        query = parse_qs(scope["query_string"].decode())
        token_str = query.get("token", [None])[0]
        if token_str:
            access_token = AccessToken(token_str)
            user = await database_sync_to_async(CustomUser.objects.get)(id=access_token["user_id"])
            scope["user"] = user
        else:
            scope["user"] = AnonymousUser()
        return await self.inner(scope, receive, send)
```

---

## 6. Система пермишенов (RBAC)

### Ключевые функции (permissions.py)

```python
def _is_full_access(user):
    """owner / developer / superuser = полный доступ."""
    if user.is_superuser:
        return True
    if user.role == "owner":
        return True
    # Проверка system-ролей (developer, owner) через assignments
    emp = getattr(user, "employee_profile", None)
    if emp:
        for a in emp.assignments.select_related("org_role").all():
            if a.org_role.is_system and a.org_role.code in ("developer", "owner"):
                return True
    return False


def _get_user_permission_codes(user):
    """
    Возвращает:
    - None = полный доступ (owner/developer/superuser)
    - set() = нет прав
    - set("code1", "code2") = конкретные права
    """
    if user.is_superuser or user.role == "owner":
        return None
    emp = getattr(user, "employee_profile", None)
    if not emp:
        return set()
    codes = set()
    for a in emp.assignments.select_related("org_role").prefetch_related("org_role__permissions").all():
        if a.org_role.is_system and a.org_role.code in ("developer", "owner"):
            return None
        codes.update(a.org_role.permissions.values_list("code", flat=True))
    return codes


def has_org_permission(user, code):
    codes = _get_user_permission_codes(user)
    if codes is None:
        return True
    return code in codes


def get_subordinate_role_ids(user):
    """BFS по дереву ролей — возвращает set ID всех подчинённых ролей. None = full access."""

def get_user_unit_ids(user, permission_code):
    """Возвращает list[int] юнитов, где у пользователя есть данный пермишен. None = все."""

def scope_queryset_by_unit(qs, user, permission_code, unit_field="unit"):
    """Фильтрует queryset по юнитам с учётом пермишенов. None = без фильтра."""
```

### DRF Permission-классы

```python
class HasOrgPermission(BasePermission):
    required_permission = ""
    def has_permission(self, request, view):
        return has_org_permission(request.user, self.required_permission)

def require_permission(code):
    """Фабрика: require_permission('team.manage') → DRF permission class."""
    return type(f"Requires_{code}", (HasOrgPermission,), {"required_permission": code})

def require_read_write(read_code, write_code):
    """
    GET → read_code, POST/PUT/DELETE → write_code.
    read_code=None → любой аутентифицированный для чтения.
    """
```

---

## 7. API-эндпоинты аутентификации

Все под префиксом `/api/`:

| Эндпоинт | Метод | Auth | Назначение |
|----------|-------|------|-----------|
| `auth/login/` | POST | — | Получение JWT (email + password) → `{access, refresh}` |
| `auth/refresh/` | POST | — | Обновление JWT (refresh token) → `{access, refresh}` |
| `auth/register/` | POST | — | Регистрация (создаёт Company + User + Employee) → `{user, access, refresh}` |
| `auth/accept-invite/` | POST | — | Принятие инвайта → `{status, user_id, employee_id}` |
| `auth/check-dev/` | POST | — | Детекция суперюзера (throttle 5/мин) → `{is_dev, companies}` |
| `auth/dev-context/` | POST | — | Опции dev-контекста (throttle 5/мин) → `{units, departments, roles}` |
| `me/` | GET | Bearer | Профиль + пермишены текущего пользователя |

---

## 8. Frontend: API-слой аутентификации

Файл: `src/api/auth.js`

```javascript
import axiosInstance from "./axiosInstance";

export const login = async (email, password) => {
    const res = await axiosInstance.post("auth/login/", { email, password });
    localStorage.setItem("accessToken", res.data.access);
    localStorage.setItem("refreshToken", res.data.refresh);
    return res.data;
};

export const register = async ({ email, password, first_name, last_name, company_name }) => {
    const res = await axiosInstance.post("auth/register/", {
        email, password, first_name, last_name, company_name,
    });
    return res.data;
    // Токены НЕ сохраняются — пользователь должен залогиниться отдельно
};

export const refreshToken = async () => {
    const refresh = localStorage.getItem("refreshToken");
    if (!refresh) return null;
    try {
        const res = await axiosInstance.post("auth/refresh/", { refresh });
        localStorage.setItem("accessToken", res.data.access);
        return res.data;
    } catch {
        return null;
    }
};

export const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
};
```

---

## 9. Frontend: Axios-инстанс и refresh-интерцептор

Файл: `src/api/axiosInstance.js`

```javascript
import axios from "axios";

const axiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8000/api/",
});

// === Request interceptor ===
axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem("accessToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;

    const devContext = localStorage.getItem("devContext");
    if (devContext) config.headers["X-Dev-Context"] = devContext;

    return config;
});

// === Response interceptor: auto-refresh при 401 ===
let isRefreshing = false;
let pendingQueue = [];

function processQueue(error, token) {
    pendingQueue.forEach(({ resolve, reject }) =>
        error ? reject(error) : resolve(token)
    );
    pendingQueue = [];
}

axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config;

        if (error.response?.status !== 401 || original._retry) {
            return Promise.reject(error);
        }

        const refresh = localStorage.getItem("refreshToken");
        if (!refresh) return Promise.reject(error);

        if (original.url?.includes("auth/refresh")) {
            return Promise.reject(error);
        }

        if (isRefreshing) {
            // Ставим запрос в очередь
            return new Promise((resolve, reject) => {
                pendingQueue.push({ resolve, reject });
            }).then((newAccess) => {
                original.headers.Authorization = `Bearer ${newAccess}`;
                return axiosInstance(original);
            });
        }

        isRefreshing = true;
        original._retry = true;

        try {
            const res = await axiosInstance.post("auth/refresh/", { refresh });
            const newAccess = res.data.access;
            localStorage.setItem("accessToken", newAccess);
            if (res.data.refresh) {
                localStorage.setItem("refreshToken", res.data.refresh);
            }
            processQueue(null, newAccess);
            original.headers.Authorization = `Bearer ${newAccess}`;
            return axiosInstance(original);
        } catch (err) {
            processQueue(err, null);
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("devContext");
            return Promise.reject(err);
        } finally {
            isRefreshing = false;
        }
    }
);
```

**Ключевой паттерн**: очередь запросов (`pendingQueue`) предотвращает параллельные refresh-вызовы при множественных 401.

---

## 10. Frontend: AuthContext

Файл: `src/context/AuthContext.jsx`

```javascript
const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchMe = async () => {
        const res = await axiosInstance.get("me/");
        setUser(res.data);
        Sentry.setUser({ id: res.data.id, email: res.data.email });
    };

    // Инициализация при монтировании
    useEffect(() => {
        const init = async () => {
            const token = localStorage.getItem("accessToken");
            if (!token) { setLoading(false); return; }
            try {
                await fetchMe();
            } catch {
                const refreshed = await apiRefresh();
                if (refreshed) await fetchMe();
            }
            setLoading(false);
        };
        init();
    }, []);

    const login = async (email, password) => {
        await apiLogin(email, password);  // сохраняет токены в localStorage
        await fetchMe();                  // загружает user в state
    };

    const logout = () => {
        apiLogout();  // очищает localStorage
        localStorage.removeItem("devContext");
        Sentry.setUser(null);
        setUser(null);
    };

    const reloadMe = async () => {
        setLoading(true);
        await fetchMe();
        setLoading(false);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, reloadMe }}>
            {children}
        </AuthContext.Provider>
    );
}

// === Хелперы проверки прав ===

export function hasPermission(user, code) {
    if (!user?.permissions) return false;
    return user.permissions.includes(code);
}

export function getUserUnitsForPermission(user, code) {
    if (!user?.unit_permissions) return null;  // null = полный доступ
    return Object.entries(user.unit_permissions)
        .filter(([_, codes]) => codes.includes(code))
        .map(([unitId]) => Number(unitId));
}

export function hasPermissionInUnit(user, code, unitId) {
    if (!user?.unit_permissions) return true;  // null = полный доступ
    const codes = user.unit_permissions[String(unitId)];
    return codes?.includes(code) ?? false;
}
```

**Важно**: периодического таймера обновления токенов нет — всё обновление через response-интерцептор при 401.

---

## 11. Frontend: Route Guards

### RequireAuth

```javascript
export default function RequireAuth() {
    const { loading } = useAuth();
    const location = useLocation();

    if (loading) return <Spinner />;

    const token = localStorage.getItem("accessToken");
    if (!token) return <Navigate to="/login" state={{ from: location }} replace />;

    return <Outlet />;
}
```

Проверяет наличие `accessToken` в localStorage (не `user` из контекста — так работает до загрузки `fetchMe`).

### RequirePermission

```javascript
export default function RequirePermission({ code, children }) {
    const { user, loading } = useAuth();

    if (loading) return null;
    if (!user || !hasPermission(user, code)) return <Navigate to="/profile" replace />;

    return children;
}
```

### PublicOnly

```javascript
export default function PublicOnly({ children }) {
    const token = localStorage.getItem("accessToken");
    if (token) return <Navigate to="/profile" replace />;
    return children;
}
```

Используется для `/`, `/login`, `/register` — перенаправляет залогиненных в `/profile`.

### Структура роутов (App.jsx)

```jsx
<Routes>
    {/* Публичные (перенаправление если залогинен) */}
    <Route path="/" element={<PublicOnly><LandingPage /></PublicOnly>} />
    <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
    <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />

    {/* Полностью публичные */}
    <Route path="/accept-invite" element={<AcceptInvitePage />} />

    {/* Приватные */}
    <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/team" element={
                <RequirePermission code="team.view"><TeamPage /></RequirePermission>
            } />
            {/* ... другие страницы ... */}
        </Route>
    </Route>
</Routes>
```

---

## 12. Frontend: Страница логина

Файл: `src/pages/LoginPage.jsx`

**Поля**: email, password.

**Логика**:
1. При заполнении email+password — debounce (700мс) вызов `POST /api/auth/check-dev/`
2. Если `is_dev: true` → показываются dropdown'ы: компания, юнит, департамент, роль
3. При выборе компании → `POST /api/auth/dev-context/` загружает юниты/департаменты/роли
4. При сабмите:
   - Если dev-режим — записывает `devContext` JSON в localStorage
   - Вызывает `login()` из AuthContext
   - Навигация: `location.state.from` или `?redirect=` query param, по умолчанию `/`
5. При ошибке: «Неверный email или пароль»

---

## 13. Frontend: Страница регистрации

Файл: `src/pages/RegisterPage.jsx`

**Поля**: фамилия, имя, название компании, email, пароль, подтверждение пароля, чекбокс согласия.

**Логика**:
1. Клиентская валидация: совпадение паролей, чекбокс `agree`
2. Вызов `apiRegister()` → POST `/api/auth/register/`
3. При успехе — навигация на `/login` (без автологина, токены не сохраняются)

---

## 14. Frontend: Страница принятия инвайта

Файл: `src/pages/AcceptInvitePage.jsx`

Читает `?token=` из URL. Доступна без авторизации.

**Поля**: пароль (с toggle видимости), подтверждение пароля, дата рождения (DatePicker), чекбокс согласия.

**Валидация** (клиентская):
- Пароль: `/^(?=.*[A-Za-z])(?=.*\d)[\S]{8,}$/` (мин. 8 символов, буквы + цифры)
- Пароли совпадают
- Чекбокс отмечен
- Дата рождения заполнена

**При сабмите**:
1. `POST /api/auth/accept-invite/` с `{token, password, agree: true, birth_date}`
2. При успехе: очищает localStorage (accessToken, refreshToken), удаляет Authorization header
3. Навигация на `/login?pwd_set=1`

---

## 15. Сериализаторы команды

### EmployeeSerializer

```python
class EmployeeSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    email = serializers.SerializerMethodField()     # из user.email
    first_name = serializers.SerializerMethodField() # из user.first_name
    last_name = serializers.SerializerMethodField()  # из user.last_name
    role_title = serializers.SerializerMethodField() # из первого assignment
    assignments = EmployeeAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id", "company", "user", "user_id", "email",
            "first_name", "last_name", "role_title",
            "full_name", "grade", "birth_date", "avatar_url",
            "pattern", "can_split", "can_extra", "assignments",
        ]
```

### EmployeeAssignmentSerializer

```python
class EmployeeAssignmentSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    department_name = serializers.SerializerMethodField()
    org_role_title = serializers.CharField(source="org_role.title", read_only=True)

    class Meta:
        model = EmployeeAssignment
        fields = ["id", "employee", "unit", "unit_name", "department", "department_name", "org_role", "org_role_title"]
```

### EmployeeAssignmentBulkSerializer

```python
class EmployeeAssignmentBulkSerializer(serializers.Serializer):
    employee = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all())
    assignments = InviteAssignmentInputSerializer(many=True)
```

### InviteCreateSerializer

```python
class InviteCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150, required=False, default="")
    last_name = serializers.CharField(max_length=150, required=False, default="")
    grade = serializers.IntegerField(min_value=0, max_value=5, default=0)
    assignments = InviteAssignmentInputSerializer(many=True)
```

### InviteAssignmentInputSerializer

```python
class InviteAssignmentInputSerializer(serializers.Serializer):
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.all())
    department = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), required=False, allow_null=True)
    org_role = serializers.PrimaryKeyRelatedField(queryset=OrgRole.objects.all())

    def validate(self, attrs):
        # department должен принадлежать unit
        # org_role.department (если есть) должен совпадать с department
        ...
```

### InviteSerializer (чтение)

```python
class InviteSerializer(serializers.ModelSerializer):
    invite_assignments = InviteAssignmentSerializer(many=True, read_only=True)
    org_role_title = serializers.SerializerMethodField()
    unit_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()

    class Meta:
        model = Invite
        fields = [
            "id", "email", "first_name", "last_name", "grade",
            "org_role", "org_role_title", "unit", "unit_name",
            "department", "department_name",
            "invite_assignments", "token", "status",
            "expires_at", "created_at", "sent_at",
        ]
```

---

## 16. Views команды

### EmployeeViewSet

```python
class EmployeeViewSet(BroadcastMixin, ModelViewSet):
    broadcast_entity = "employee"
    permission_classes = [require_read_write(None, "team.manage")]
    # read_code=None → любой аутентифицированный может читать

    def get_queryset(self):
        qs = Employee.objects.filter(company=self.request.user.company)
        # Иерархическая фильтрация: только подчинённые роли
        subordinate_ids = get_subordinate_role_ids(self.request.user)
        if subordinate_ids is not None:
            qs = qs.filter(assignments__org_role_id__in=subordinate_ids)
        # + scope по юнитам (team.view)
        qs = scope_queryset_by_unit(qs, self.request.user, "team.view")
        # + фильтр по ?unit=
        return qs.distinct()

    def perform_destroy(self, instance):
        # Каскадное удаление: Invite → Employee → CustomUser + blacklist JWT
        Invite.objects.filter(company=instance.company, email=instance.user.email).delete()
        user = instance.user
        instance.delete()
        if user:
            OutstandingToken.objects.filter(user=user).delete()
            user.delete()
```

### InviteViewSet

```python
class InviteViewSet(BroadcastMixin, ModelViewSet):
    broadcast_entity = "invite"
    permission_classes = [require_read_write("team.view", "team.manage")]

    def get_queryset(self):
        # Только pending + не просроченные
        qs = Invite.objects.filter(
            company=self.request.user.company,
            status="pending",
            expires_at__gt=timezone.now(),
        )
        # + иерархическая фильтрация + scope по юнитам
        return qs.distinct()

    def perform_create(self, serializer):
        # 1. Проверка иерархии (только подчинённые роли)
        # 2. Проверка: нет accepted-инвайта для этого email
        # 3. Удаление старых pending/revoked/expired для этого email
        # 4. Создание Invite + InviteAssignment (atomic)
        # 5. Отправка email с ссылкой: {FRONTEND_URL}/accept-invite?token={token}

    @action(detail=True, methods=["post"])
    def resend(self, request, pk):
        # Продлевает expires_at на 14 дней, пересылает email

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk):
        # Меняет status на "revoked" (только для pending)
```

### EmployeeAssignmentViewSet

```python
class EmployeeAssignmentViewSet(BroadcastMixin, ModelViewSet):
    broadcast_entity = "employee_assignment"
    permission_classes = [require_read_write("team.view", "team.manage")]

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        # Валидация: employee в компании, unit доступен, роль в иерархии
        # get_or_create для каждого назначения
        # Добавляет unit в employee.units M2M
```

---

## 17. API-эндпоинты команды

Все под префиксом `/api/`:

| Эндпоинт | Метод | Пермишен | Назначение |
|----------|-------|----------|-----------|
| `employees/` | GET | authenticated | Список сотрудников (иерархия + scope по юнитам) |
| `employees/{id}/` | GET | authenticated | Детали сотрудника |
| `employees/{id}/` | PATCH | team.manage | Обновление (full_name, grade, birth_date) |
| `employees/{id}/` | DELETE | team.manage | Удаление (каскад: invite → employee → user + blacklist JWT) |
| `invites/` | GET | team.view | Список активных инвайтов |
| `invites/` | POST | team.manage | Создание инвайта + отправка email |
| `invites/{id}/resend/` | POST | team.manage | Повторная отправка email |
| `invites/{id}/revoke/` | POST | team.manage | Отзыв инвайта |
| `employee-assignments/` | GET | team.view | Список назначений |
| `employee-assignments/{id}/` | DELETE | team.manage | Удаление назначения |
| `employee-assignments/bulk_create/` | POST | team.manage | Массовое создание назначений |
| `org-roles/assignable/` | GET | authenticated | Роли, доступные для назначения (по иерархии) |

---

## 18. Frontend: API-слой команды

### org.js

```javascript
export const getUnits = () => axiosInstance.get("units/");
export const getDepartments = (params) => axiosInstance.get("departments/", { params });
export const getOrgRoles = (params) => axiosInstance.get("org-roles/", { params });
export const getAssignableRoles = () => axiosInstance.get("org-roles/assignable/");
```

### assignments.js

```javascript
export const deleteAssignment = (id) => axiosInstance.delete(`employee-assignments/${id}/`);
export const bulkCreateAssignments = (data) => axiosInstance.post("employee-assignments/bulk_create/", data);
```

### Прямые вызовы из TeamPage

```javascript
// Сотрудники
axiosInstance.get("employees/")
axiosInstance.get(`employees/${id}/`)
axiosInstance.patch(`employees/${id}/`, data)
axiosInstance.delete(`employees/${id}/`)

// Инвайты
axiosInstance.get("invites/")
axiosInstance.post("invites/", data)
axiosInstance.post(`invites/${id}/resend/`)
axiosInstance.post(`invites/${id}/revoke/`)
```

---

## 19. Frontend: Страница команды

Файл: `src/pages/TeamPage.jsx`

**Роут**: `/team`
**Пермишен**: `team.view`

### Состояние

```javascript
const [units, setUnits] = useState([]);
const [departments, setDepartments] = useState([]);
const [orgRoles, setOrgRoles] = useState([]);
const [assignableRoles, setAssignableRoles] = useState([]);
const [employees, setEmployees] = useState([]);
const [invites, setInvites] = useState([]);

// Фильтры
const [selectedUnit, setSelectedUnit] = useState("");
const [selectedDept, setSelectedDept] = useState("");
const [selectedRole, setSelectedRole] = useState("");
const [searchQuery, setSearchQuery] = useState("");

// Модалка (persistent через useSessionState)
const [showModal, setShowModal] = useSessionState("team_showModal", false);
const [editing, setEditing] = useSessionState("team_editing", null);
const [form, setForm] = useSessionState("team_form", { full_name: "", email: "", grade: 0, birth_date: "" });
const [inviteAssignments, setInviteAssignments] = useSessionState("team_inviteAssignments", []);
const [pendingAssign, setPendingAssign] = useSessionState("team_pendingAssign", { unit: "", department: "", org_role: "" });
```

### Загрузка данных

```javascript
const loadAll = async () => {
    const [unitsRes, deptsRes, rolesRes, empsRes, ...rest] = await Promise.all([
        getUnits(),
        getDepartments(),
        getOrgRoles(),
        axiosInstance.get("employees/"),
        ...(canManage ? [axiosInstance.get("invites/"), getAssignableRoles()] : []),
    ]);
    // ...
};
```

### Фильтрация

Каскадные dropdown'ы: юнит → департамент → роль.
- `availableUnits` — union юнитов из `team.view` + юниты из assignable-ролей
- `filteredEmployees` — по selectedUnit/Dept/Role + searchQuery (full_name + email + role)
- `filteredInvites` — аналогично

### Модалка (единая для создания инвайта и редактирования сотрудника)

**Режим создания** (`editing === null`):
- Поля: имя, фамилия, email, грейд
- Назначения: каскадные dropdown'ы (юнит → департамент → роль), кнопка «Добавить»
- Назначения накапливаются в `inviteAssignments[]` как chips
- Сабмит → `POST invites/` с `{email, first_name, last_name, grade, assignments}`

**Режим редактирования** (`editing = employee.id`):
- Поля: имя, грейд, дата рождения
- Email — read-only
- Текущие назначения — removable chips (удаление → `DELETE employee-assignments/{id}/`)
- Добавление назначения → `POST employee-assignments/bulk_create/`
- Сабмит → `PATCH employees/{id}/`

### Отображение

- Список сотрудников — карточки с аватаром, именем, email, ролью, грейдом
- Для менеджера: кнопки «Редактировать», «Удалить» (с подтверждением)
- Секция инвайтов (только если `canManage`):
  - Статус badge (pending/accepted/revoked/expired) с цветовой индикацией
  - Дата истечения
  - Кнопки: «Отправить ещё раз», «Отозвать», «Скопировать ссылку»

### Real-time

```javascript
useRealtimeUpdates(["employee", "employee_assignment", "invite"], () => loadAll());
```

---

## 20. Real-time обновления

### BroadcastMixin (Backend)

```python
class BroadcastMixin:
    broadcast_entity = None  # "employee", "invite", "employee_assignment"

    # Автоматически при:
    # - create (201) → broadcast "created"
    # - update/partial_update (200) → broadcast "updated"
    # - destroy (204) → broadcast "deleted"
```

Payload отправляется в WebSocket-группу `company_{company_id}_updates`:

```json
{"entity": "employee", "action": "created", "id": 123, "user_id": 456}
```

### useRealtimeUpdates (Frontend)

```javascript
useRealtimeUpdates(
    ["employee", "employee_assignment", "invite"],
    () => loadAll(),
);
```

При получении WebSocket-сообщения с matching entity — вызывает `loadAll()`.

---

## 21. Полные потоки данных

### Регистрация

```
1. Пользователь открывает /register
2. Заполняет: фамилия, имя, компания, email, пароль
3. Frontend → POST /api/auth/register/
4. Backend:
   a. Создаёт Company
   b. post_save сигнал: создаёт OrgRole developer + owner (все пермишены)
   c. Создаёт CustomUser(role="owner")
   d. Создаёт Employee(user=user, org_role=owner_role)
   e. Генерирует JWT-токены
5. Frontend получает {user, access, refresh}
6. Frontend НЕ сохраняет токены → навигация на /login
7. Пользователь логинится
```

### Логин

```
1. Пользователь открывает /login
2. Вводит email + пароль
3. Debounce 700мс → POST /api/auth/check-dev/
   - Если superuser → показываются dropdown'ы компании/роли
4. Submit:
   a. [Dev] Записывает devContext в localStorage
   b. Вызывает login() из AuthContext
5. AuthContext.login():
   a. POST /api/auth/login/ → {access, refresh}
   b. Токены сохраняются в localStorage
   c. GET /api/me/ → user data + permissions
   d. Sentry.setUser()
6. Навигация на redirect target (state.from / ?redirect= / /)
7. RequireAuth проверяет token → пропускает
8. RequirePermission проверяет user.permissions → рендерит или /profile
```

### Отправка инвайта

```
1. Менеджер открывает /team (пермишен team.view)
2. Нажимает «Пригласить» → открывается модалка
3. Заполняет: имя, фамилия, email, грейд
4. Добавляет назначения: юнит → департамент → роль (каскадные dropdown'ы)
5. Submit → POST /api/invites/
6. Backend:
   a. Проверка иерархии (только подчинённые роли)
   b. Проверка: нет accepted-инвайта для этого email
   c. Удаление старых pending/revoked/expired для этого email
   d. Создание Invite(token=random, expires_at=now+14d)
   e. Создание InviteAssignment для каждого назначения
   f. Отправка email: ссылка {FRONTEND_URL}/accept-invite?token={token}
7. WebSocket broadcast → TeamPage перезагружает данные
```

### Принятие инвайта

```
1. Сотрудник получает email → кликает ссылку /accept-invite?token=...
2. Страница AcceptInvitePage (публичная)
3. Заполняет: пароль, подтверждение, дата рождения, согласие
4. Submit → POST /api/auth/accept-invite/
5. Backend:
   a. Проверка: token существует, status=pending, не просрочен, email не занят
   b. Создание CustomUser(role="employee")
   c. Создание Employee(grade, birth_date, full_name)
   d. Конвертация InviteAssignment → EmployeeAssignment
   e. invite.status = "accepted"
6. Frontend: очищает localStorage → навигация на /login?pwd_set=1
7. Сотрудник логинится
```

### Удаление сотрудника

```
1. Менеджер нажимает «Удалить» на карточке → подтверждение
2. DELETE /api/employees/{id}/
3. Backend:
   a. Удаление Invite записей по email сотрудника
   b. Удаление Employee
   c. Blacklist всех JWT-токенов пользователя (OutstandingToken)
   d. Удаление CustomUser
4. WebSocket broadcast → TeamPage перезагружает данные
```

---

## Приложение: Необходимые settings.py

```python
AUTH_USER_MODEL = "core.CustomUser"

INSTALLED_APPS = [
    ...
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "channels",
    "apps.core",
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.core.auth.DevContextJWTAuthentication",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

CORS_ALLOW_HEADERS = [..., "x-dev-context"]

# Email (для инвайтов)
FRONTEND_URL = "https://your-domain.com"
DEFAULT_FROM_EMAIL = "noreply@your-domain.com"
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

# Seed permissions (team)
# team.view — просмотр сотрудников
# team.manage — создание/удаление/редактирование сотрудников и инвайтов
```

## Приложение: Seed-пермишены команды

```python
PERMISSIONS = [
    ("team.view", "Просматривать команду",
     "Позволяет видеть список сотрудников и их назначения."),
    ("team.manage", "Управлять командой",
     "Позволяет приглашать, редактировать и удалять сотрудников."),
]
```
