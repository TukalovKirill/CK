# Реализация оргструктуры — полная документация

Подробная документация по реализации модуля организационной структуры (multi-tenant, RBAC, иерархические роли) для воспроизведения в другом проекте.

**Стек**: Django 5 + DRF + Channels (WebSocket), React 19, PostgreSQL, Redis, JWT (SimpleJWT)

---

## Оглавление

1. [Архитектура и концепции](#1-архитектура-и-концепции)
2. [Модели (Backend)](#2-модели-backend)
3. [Система пермишенов (RBAC)](#3-система-пермишенов-rbac)
4. [Сериализаторы](#4-сериализаторы)
5. [Views / API эндпоинты](#5-views--api-эндпоинты)
6. [WebSocket (real-time)](#6-websocket-real-time)
7. [Сигналы и автоматизация](#7-сигналы-и-автоматизация)
8. [Management-команда seed_permissions](#8-management-команда-seed_permissions)
9. [Фронтенд](#9-фронтенд)
10. [Onboarding: регистрация и инвайты](#10-onboarding-регистрация-и-инвайты)

---

## 1. Архитектура и концепции

### Multi-tenant

Все модели скоупятся по FK `company`. Каждый запрос фильтруется по `request.user.company`. Ни один пользователь не видит данные другой компании.

### Иерархия сущностей

```
Company
  └── Unit (физическое заведение / точка)
        └── Department (отдел: Бар, Кухня, Сервис...)
              └── OrgRole (роль: Бармен, Шеф, Менеджер...)
                    └── Zone (зона работы: Основной зал, VIP...)
```

### RBAC (Role-Based Access Control)

- `OrgPermission` — атомарное право доступа (глобальное, не привязано к компании)
- `OrgRole` — роль внутри компании, привязана к набору пермишенов (M2M)
- Роли образуют **дерево** через `parent_role` (FK на self)
- `level` вычисляется автоматически как глубина от корня
- Сотрудник получает union пермишенов из всех своих назначений

### Назначения (Assignments)

Один сотрудник может иметь **несколько назначений** (разные роли в разных юнитах/департаментах). Это реализовано через промежуточную модель `EmployeeAssignment`.

```
Employee
  └── EmployeeAssignment (unit + department + org_role)
  └── EmployeeAssignment (unit + department + org_role)
  └── ...
```

---

## 2. Модели (Backend)

### 2.1 CustomUserManager

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

### 2.2 Company

Корень multi-tenant. Минимальная модель — только название и часовой пояс.

```python
class Company(models.Model):
    name = models.CharField("Название", max_length=255)
    timezone = models.CharField("Часовой пояс", max_length=64, default="Europe/Moscow")
    created_at = models.DateTimeField("Дата создания", auto_now_add=True)

    class Meta:
        verbose_name = "Компания"
        verbose_name_plural = "Компании"
        indexes = [
            models.Index(fields=["name"]),
        ]

    def __str__(self):
        return self.name
```

### 2.3 CustomUser

Пользователь без username. Аутентификация по email. Привязан к компании.

```python
class CustomUser(AbstractUser):
    username = None
    email = models.EmailField("Email", unique=True, db_index=True)
    company = models.ForeignKey(
        Company, verbose_name="Компания",
        on_delete=models.CASCADE, null=True, blank=True,
        related_name="users"
    )
    ROLE_CHOICES = (
        ("owner", "Владелец"),
        ("employee", "Сотрудник"),
    )
    role = models.CharField("Роль", max_length=20, choices=ROLE_CHOICES, default="owner")

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = CustomUserManager()

    class Meta(AbstractUser.Meta):
        verbose_name = "Пользователь"
        verbose_name_plural = "Пользователи"

    def __str__(self):
        return self.email
```

**Важно**: `role` на уровне User — это только "owner" vs "employee" (определяет, является ли пользователь владельцем компании). Гранулярные права — через `OrgRole` + `OrgPermission`.

### 2.4 Unit

Физическое заведение / точка внутри компании. Поддерживает кастомную сортировку.

```python
class Unit(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="units")
    name = models.CharField("Название", max_length=255)
    is_active = models.BooleanField("Активен", default=True)
    sort_order = models.PositiveIntegerField("Порядок", default=0)

    class Meta:
        verbose_name = "Юнит"
        verbose_name_plural = "Юниты"
        unique_together = ("company", "name")
        ordering = ["sort_order", "name"]
        indexes = [
            models.Index(fields=["company", "is_active"], name="core_unit_company_active_idx"),
        ]

    def __str__(self):
        return self.name
```

### 2.5 Department

Отдел внутри юнита (IT, Бар, Кухня, Сервис и т.д.).

```python
class Department(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="departments")
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="departments")
    name = models.CharField("Название", max_length=255)
    code = models.SlugField("Код", blank=True, default="")
    sort_order = models.PositiveIntegerField("Порядок", default=0)

    class Meta:
        verbose_name = "Департамент"
        verbose_name_plural = "Департаменты"
        unique_together = ("company", "unit", "name")
        ordering = ["sort_order", "name"]
        indexes = [
            models.Index(fields=["company", "unit"], name="core_dept_company_unit_idx"),
        ]

    def __str__(self):
        return f"{self.name} ({self.unit.name})"
```

### 2.6 OrgPermission

Атомарное право доступа. **Глобальное** — не привязано к компании. Создаётся через management-команду.

```python
class OrgPermission(models.Model):
    code = models.SlugField("Код", unique=True)       # "team.view", "org.manage" и т.д.
    name = models.CharField("Название", max_length=255)
    description = models.TextField("Описание", blank=True, default="")

    class Meta:
        verbose_name = "Право доступа"
        verbose_name_plural = "Права доступа"

    def __str__(self):
        return f"{self.code} — {self.name}"
```

**Формат кода**: `домен.действие` — например `team.view`, `org.manage`, `checklists.fill`.

### 2.7 OrgRole

Настраиваемая роль в оргструктуре. **Company-scoped**. Иерархия через `parent_role` (FK на self).

```python
class OrgRole(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="org_roles")
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="roles"
    )
    code = models.SlugField("Код")                     # auto-generated slug from title
    title = models.CharField("Название", max_length=255)
    level = models.PositiveSmallIntegerField(           # auto-computed depth from root
        "Уровень", default=0, validators=[MaxValueValidator(10)]
    )
    parent_role = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="child_roles"
    )
    permissions = models.ManyToManyField(
        OrgPermission, blank=True, related_name="roles"
    )
    can_manage_permissions = models.BooleanField(
        "Может управлять правами", default=False,
        help_text="Может редактировать пермишены нижестоящих ролей"
    )
    group = models.CharField("Группа", max_length=255, blank=True, default="")
    is_assignable = models.BooleanField("Назначаема через UI", default=True)
    is_system = models.BooleanField(
        "Системная роль", default=False,
        help_text="Системные роли нельзя удалить или переименовать через UI"
    )

    class Meta:
        verbose_name = "Роль"
        verbose_name_plural = "Роли"
        unique_together = ("company", "code")
        indexes = [
            models.Index(fields=["company", "department"], name="core_orgrole_co_dept_idx"),
            models.Index(fields=["company", "level"], name="core_orgrole_co_level_idx"),
        ]

    def __str__(self):
        return f"{self.title} ({self.company.name})"

    def _compute_level(self):
        """Вычисляет глубину в дереве от корня."""
        depth = 0
        current = self.parent_role
        visited = set()
        while current is not None:
            if current.pk in visited:
                break  # защита от циклов
            visited.add(current.pk)
            depth += 1
            current = current.parent_role
        return depth

    def _update_subtree_levels(self):
        """Пересчитывает level для всех потомков."""
        for child in self.child_roles.all():
            new_level = child._compute_level()
            if child.level != new_level:
                child.level = new_level
                child.save(update_fields=["level"])

    def save(self, *args, **kwargs):
        self.level = self._compute_level()
        super().save(*args, **kwargs)
        self._update_subtree_levels()
```

**Ключевые моменты**:
- `level` пересчитывается при каждом save (проход по parent_role до корня)
- При сохранении рекурсивно обновляется level у всех потомков
- Защита от циклических ссылок через `visited` set
- `is_system` — системные роли (developer, owner) нельзя удалить/переименовать через UI
- `is_assignable` — можно ли назначить роль сотруднику через UI

### 2.8 Zone

Зона работы внутри Department. Привязана к роли.

```python
class Zone(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="zones")
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name="zones")
    org_role = models.ForeignKey(OrgRole, on_delete=models.CASCADE, related_name="zones")
    name = models.CharField("Название", max_length=255)

    class Meta:
        verbose_name = "Зона"
        verbose_name_plural = "Зоны"
        unique_together = ("company", "department", "org_role", "name")
        indexes = [
            models.Index(fields=["company", "department", "org_role", "name"]),
        ]

    def __str__(self):
        return self.name
```

### 2.9 Employee

Сотрудник компании. Привязан к User (опционально — Employee может существовать без User).

```python
class Employee(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="employees")
    user = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE,
        related_name="employee_profile", null=True, blank=True
    )
    # Legacy поля (используй assignments):
    org_role = models.ForeignKey(
        OrgRole, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="employees"
    )
    units = models.ManyToManyField(Unit, blank=True, related_name="employees")

    full_name = models.CharField("ФИО", max_length=255, blank=True, default="")
    birth_date = models.DateField("Дата рождения", null=True, blank=True)
    grade = models.PositiveSmallIntegerField(
        "Грейд", default=1,
        validators=[MinValueValidator(0), MaxValueValidator(5)]
    )
    avatar_url = models.URLField("Аватар (URL)", blank=True, default="")
    pattern = models.CharField(
        "Паттерн работы", max_length=16,
        choices=(("5/2", "5/2"), ("2/2", "2/2"), ("flex", "Гибкий")),
        default="flex",
    )
    can_split = models.BooleanField("Сплит-смены", default=False)
    can_extra = models.BooleanField("Доп. смены", default=True)

    class Meta:
        verbose_name = "Сотрудник"
        verbose_name_plural = "Сотрудники"
        indexes = [
            models.Index(fields=["company", "grade"]),
        ]

    def __str__(self):
        return self.full_name or (self.user.email if self.user else f"Employee #{self.pk}")

    def save(self, *args, **kwargs):
        # Автозаполнение full_name из user, если пустое
        if not (self.full_name or "").strip() and self.user:
            fn = f"{self.user.first_name or ''} {self.user.last_name or ''}".strip()
            if fn:
                self.full_name = fn
        super().save(*args, **kwargs)
```

### 2.10 EmployeeAssignment

Назначение сотрудника: юнит + департамент + роль. Один сотрудник может иметь несколько назначений.

```python
class EmployeeAssignment(models.Model):
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="assignments"
    )
    unit = models.ForeignKey(
        Unit, on_delete=models.CASCADE, related_name="assignments"
    )
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, null=True, blank=True,
        related_name="assignments"
    )
    org_role = models.ForeignKey(
        OrgRole, on_delete=models.CASCADE, related_name="assignments"
    )

    class Meta:
        verbose_name = "Назначение сотрудника"
        verbose_name_plural = "Назначения сотрудников"
        unique_together = ("employee", "unit", "org_role")

    def __str__(self):
        parts = [str(self.employee), str(self.unit)]
        if self.department:
            parts.append(str(self.department))
        parts.append(str(self.org_role))
        return " → ".join(parts)
```

### 2.11 Invite

Приглашение сотрудника в компанию. Содержит токен, срок действия, статус.

```python
class Invite(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="invites")
    invited_by = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="sent_invites"
    )
    email = models.EmailField("Email")
    first_name = models.CharField("Имя", max_length=150, blank=True, default="")
    last_name = models.CharField("Фамилия", max_length=150, blank=True, default="")
    grade = models.PositiveSmallIntegerField(
        "Грейд", default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)]
    )
    # Legacy оргструктура (для обратной совместимости):
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
        verbose_name = "Приглашение"
        verbose_name_plural = "Приглашения"
        unique_together = ("company", "email")

    def __str__(self):
        return f"Invite {self.email} ({self.company}) [{self.status}]"

    @staticmethod
    def make_token():
        return secrets.token_urlsafe(32)

    @staticmethod
    def default_expire(days=14):
        return timezone.now() + timezone.timedelta(days=days)

    def is_usable(self):
        if self.status != "pending":
            return False
        if timezone.now() >= self.expires_at:
            return False
        return True
```

### 2.12 InviteAssignment

Назначение для приглашения. При принятии инвайта каждая запись превращается в `EmployeeAssignment`.

```python
class InviteAssignment(models.Model):
    invite = models.ForeignKey(
        Invite, on_delete=models.CASCADE, related_name="invite_assignments"
    )
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="invite_assignments")
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, null=True, blank=True,
        related_name="invite_assignments"
    )
    org_role = models.ForeignKey(
        OrgRole, on_delete=models.CASCADE, related_name="invite_assignments"
    )

    class Meta:
        verbose_name = "Назначение приглашения"
        verbose_name_plural = "Назначения приглашений"
        unique_together = ("invite", "unit", "org_role")

    def __str__(self):
        parts = [str(self.invite), str(self.unit)]
        if self.department:
            parts.append(str(self.department))
        parts.append(str(self.org_role))
        return " → ".join(parts)
```

---

## 3. Система пермишенов (RBAC)

Файл `permissions.py` — ядро авторизации. Все проверки основаны на `OrgRole.permissions` M2M.

### 3.1 Проверка полного доступа

```python
def _is_full_access(user):
    """owner / developer / superuser = полный доступ, без ограничений."""
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False):
        return True
    if getattr(user, "role", None) == "owner":
        return True
    emp = getattr(user, "employee_profile", None)
    if emp is None:
        return False
    # Проверяем через assignments
    if hasattr(emp, "assignments"):
        for assignment in emp.assignments.select_related("org_role").all():
            if assignment.org_role.is_system and assignment.org_role.code in ("developer", "owner"):
                return True
    return False
```

### 3.2 Получение пермишенов пользователя

```python
def _get_user_permission_codes(user):
    """
    Возвращает set кодов пермишенов пользователя.
    None = полный доступ (owner/developer/superuser).
    set() = нет прав.
    """
    if not user or not user.is_authenticated:
        return set()
    if getattr(user, "is_superuser", False):
        return None
    if getattr(user, "role", None) == "owner":
        return None
    emp = getattr(user, "employee_profile", None)
    if emp is None:
        return set()

    # Union пермишенов из ВСЕХ назначений
    codes = set()
    if hasattr(emp, "assignments"):
        for assignment in emp.assignments.select_related("org_role").prefetch_related("org_role__permissions").all():
            role = assignment.org_role
            if role.is_system and role.code in ("developer", "owner"):
                return None  # полный доступ
            codes.update(role.permissions.values_list("code", flat=True))
    return codes
```

### 3.3 Проверка конкретного пермишена

```python
def has_org_permission(user, code):
    codes = _get_user_permission_codes(user)
    if codes is None:
        return True
    return code in codes
```

### 3.4 DRF Permission-классы

```python
class HasOrgPermission(BasePermission):
    """Базовый класс — проверяет один пермишен по коду."""
    required_permission = ""

    def has_permission(self, request, view):
        return has_org_permission(request.user, self.required_permission)


def require_permission(code):
    """Фабрика: require_permission('period.manage') → класс-пермишен."""
    return type(
        f"Requires_{code.replace('.', '_')}",
        (HasOrgPermission,),
        {"required_permission": code},
    )


def require_read_write(read_code, write_code):
    """
    Фабрика: GET → read_code, POST/PUT/PATCH/DELETE → write_code.
    read_code=None → любой аутентифицированный для чтения.
    """
    class _Perm(BasePermission):
        def has_permission(self, request, view):
            if request.method in SAFE_METHODS:
                if read_code is None:
                    return request.user and request.user.is_authenticated
                return has_org_permission(request.user, read_code)
            return has_org_permission(request.user, write_code)
    _Perm.__name__ = f"RW_{read_code}__{write_code}".replace(".", "_")
    return _Perm
```

### 3.5 Unit-scoped пермишены

Пермишены проверяются **per-unit**: сотрудник может иметь `team.manage` в юните A, но не в юните B.

```python
def get_user_unit_ids(user, permission_code):
    """
    Возвращает list[int] юнит-ID, где пользователь имеет данный пермишен.
    None = полный доступ.
    """
    if _is_full_access(user):
        return None
    emp = getattr(user, "employee_profile", None)
    if emp is None:
        return []
    unit_ids = set()
    if hasattr(emp, "assignments"):
        for assignment in emp.assignments.select_related("org_role").prefetch_related("org_role__permissions").all():
            codes = set(assignment.org_role.permissions.values_list("code", flat=True))
            if permission_code in codes:
                unit_ids.add(assignment.unit_id)
    return list(unit_ids)


def get_user_unit_permissions(user):
    """Возвращает dict: { unit_id: [code1, code2, ...] }. None = полный доступ."""
    if _is_full_access(user):
        return None
    emp = getattr(user, "employee_profile", None)
    if emp is None:
        return {}
    from collections import defaultdict
    result = defaultdict(set)
    if hasattr(emp, "assignments"):
        for assignment in emp.assignments.select_related("org_role").prefetch_related("org_role__permissions").all():
            codes = assignment.org_role.permissions.values_list("code", flat=True)
            result[assignment.unit_id].update(codes)
    return {k: list(v) for k, v in result.items()}


def scope_queryset_by_unit(qs, user, permission_code, unit_field="unit_id"):
    """Фильтрует queryset по юнитам, к которым у user есть permission_code."""
    unit_ids = get_user_unit_ids(user, permission_code)
    if unit_ids is None:
        return qs
    return qs.filter(**{f"{unit_field}__in": unit_ids})
```

### 3.6 Иерархия ролей — подчинённые

Менеджер может назначать/видеть только **подчинённые** роли (BFS по дереву child_roles).

```python
def get_subordinate_role_ids(user):
    """
    Возвращает set[int] ID ролей, подчинённых ролям пользователя.
    None = полный доступ.
    """
    if _is_full_access(user):
        return None

    emp = getattr(user, "employee_profile", None)
    if not emp:
        return set()

    user_role_ids = set(
        EmployeeAssignment.objects.filter(employee=emp)
        .values_list("org_role_id", flat=True)
    )
    if not user_role_ids:
        return set()

    # Загружаем всё дерево ролей компании за один запрос
    all_roles = OrgRole.objects.filter(company=user.company).values_list("id", "parent_role_id")

    children_map = {}
    for role_id, parent_id in all_roles:
        if parent_id is not None:
            children_map.setdefault(parent_id, []).append(role_id)

    # BFS от ролей пользователя вниз
    subordinates = set()
    queue = list(user_role_ids)
    while queue:
        current = queue.pop()
        for child_id in children_map.get(current, []):
            if child_id not in subordinates:
                subordinates.add(child_id)
                queue.append(child_id)

    return subordinates
```

### 3.7 Доступные департаменты

```python
def get_accessible_dept_ids(user):
    """
    set[int] ID департаментов: свои + подчинённых ролей.
    None = полный доступ.
    """
    if _is_full_access(user):
        return None

    emp = getattr(user, "employee_profile", None)
    if not emp:
        return set()

    user_role_ids = set(
        EmployeeAssignment.objects.filter(employee=emp).values_list("org_role_id", flat=True)
    )
    if not user_role_ids:
        return set()

    all_roles = OrgRole.objects.filter(company=user.company).values_list("id", "parent_role_id", "department_id")
    children_map = {}
    dept_by_role = {}
    for role_id, parent_id, dept_id in all_roles:
        if dept_id:
            dept_by_role[role_id] = dept_id
        if parent_id is not None:
            children_map.setdefault(parent_id, []).append(role_id)

    # BFS: свои роли + подчинённые
    accessible = set(user_role_ids)
    queue = list(user_role_ids)
    while queue:
        current = queue.pop()
        for child_id in children_map.get(current, []):
            if child_id not in accessible:
                accessible.add(child_id)
                queue.append(child_id)

    return {dept_by_role[rid] for rid in accessible if rid in dept_by_role}
```

### 3.8 Company-scoped permission (IsCompanyScoped)

```python
class IsCompanyScoped(BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        user_company = getattr(request.user, "company", None)
        obj_company = (
            getattr(obj, "company", None)
            or getattr(getattr(obj, "period", None), "company", None)
        )
        return user_company and obj_company and obj_company.id == user_company.id
```

---

## 4. Сериализаторы

### 4.1 UserMiniSerializer

```python
class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name")
```

### 4.2 UserSerializer (полный, для /me/)

Возвращает все данные текущего пользователя включая пермишены и назначения.

```python
class UserSerializer(serializers.ModelSerializer):
    employee_id = serializers.SerializerMethodField()
    org_role_id = serializers.SerializerMethodField()
    org_role_code = serializers.SerializerMethodField()
    org_role_title = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()        # list[str] кодов пермишенов
    unit_permissions = serializers.SerializerMethodField()   # {unit_id: [codes...]}
    can_manage_permissions = serializers.SerializerMethodField()
    birth_date = serializers.SerializerMethodField()
    assignments = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "email", "role", "company", "is_superuser",
            "employee_id", "org_role_id", "org_role_code", "org_role_title",
            "permissions", "unit_permissions", "can_manage_permissions",
            "birth_date", "assignments",
        )

    def _first_assignment_role(self, obj):
        """Кэшированная первая роль из assignments."""
        if not hasattr(self, "_first_role_cache"):
            emp = getattr(obj, "employee_profile", None)
            role = None
            if emp:
                a = emp.assignments.select_related("org_role").first()
                if a:
                    role = a.org_role
                elif emp.org_role:
                    role = emp.org_role
            self._first_role_cache = role
        return self._first_role_cache

    def get_permissions(self, obj):
        from .permissions import _get_user_permission_codes
        codes = _get_user_permission_codes(obj)
        if codes is None:
            return list(OrgPermission.objects.values_list("code", flat=True))
        return list(codes)

    def get_unit_permissions(self, obj):
        from .permissions import get_user_unit_permissions
        result = get_user_unit_permissions(obj)
        if result is None:
            return None  # null = full access на фронтенде
        return {str(k): list(v) for k, v in result.items()}

    def get_can_manage_permissions(self, obj):
        from .permissions import _user_can_manage_permissions
        return _user_can_manage_permissions(obj)

    def get_assignments(self, obj):
        emp = getattr(obj, "employee_profile", None)
        if not emp:
            return []
        return EmployeeAssignmentSerializer(
            emp.assignments.select_related("unit", "department", "org_role").all(),
            many=True
        ).data
```

**Ключевой момент**: `permissions` — плоский список кодов, `unit_permissions` — маппинг юнит→коды. Фронтенд использует оба для проверки доступа.

### 4.3 UnitSerializer

```python
class UnitSerializer(serializers.ModelSerializer):
    departments_count = serializers.SerializerMethodField()

    class Meta:
        model = Unit
        fields = ("id", "company", "name", "is_active", "departments_count")
        read_only_fields = ("company",)

    def get_departments_count(self, obj):
        return obj.departments.count()
```

### 4.4 DepartmentOrgSerializer

```python
class DepartmentOrgSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    roles_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = ("id", "company", "unit", "unit_name", "name", "code", "roles_count")
        read_only_fields = ("company",)

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        company = getattr(getattr(request, "user", None), "company", None) if request else None
        if company and "unit" in fields:
            fields["unit"].queryset = Unit.objects.filter(company=company)
        return fields

    def get_roles_count(self, obj):
        return obj.roles.count()
```

**Паттерн**: `get_fields()` ограничивает queryset FK-полей компанией текущего пользователя.

### 4.5 OrgPermissionListSerializer

```python
DOMAIN_LABELS = {
    "team": "Команда",
    "org": "Структура компании",
    "schedule": "Шаблон графика",
    "period": "Рабочий график",
    "swap": "Обмен сменами",
    "preferences": "Пожелания",
    "finance": "Финансы",
    "subscription": "Подписка",
    "checklists": "Чеклисты",
    "textbooks": "Учебники",
    "feedback": "Отзывы",
}

class OrgPermissionListSerializer(serializers.ModelSerializer):
    domain = serializers.SerializerMethodField()
    domain_label = serializers.SerializerMethodField()

    class Meta:
        model = OrgPermission
        fields = ("id", "code", "name", "description", "domain", "domain_label")

    def get_domain(self, obj):
        return obj.code.split(".")[0] if "." in obj.code else obj.code

    def get_domain_label(self, obj):
        domain = obj.code.split(".")[0] if "." in obj.code else obj.code
        return DOMAIN_LABELS.get(domain, domain)
```

### 4.6 OrgRoleSerializer (чтение/обновление)

```python
class OrgRoleSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    parent_role_title = serializers.CharField(source="parent_role.title", read_only=True, default=None)
    child_roles = serializers.SerializerMethodField()
    permissions = serializers.PrimaryKeyRelatedField(
        queryset=OrgPermission.objects.all(), many=True, required=False,
    )

    class Meta:
        model = OrgRole
        fields = (
            "id", "company", "department", "department_name",
            "code", "title", "group", "level",
            "parent_role", "parent_role_title", "child_roles",
            "is_assignable", "is_system",
            "permissions", "can_manage_permissions",
        )
        read_only_fields = ("company", "level", "code", "is_system")

    def get_child_roles(self, obj):
        return OrgRoleMinimalSerializer(obj.child_roles.all(), many=True).data

    def validate_permissions(self, value):
        """
        Ключевая логика: admin может назначать только те пермишены, которые есть у него самого.
        При обновлении: пермишены, которых нет у admin'а — сохраняются как были.
        """
        request = self.context.get("request")
        if not request:
            return value
        from .permissions import _get_user_permission_codes, _is_full_access, _user_can_manage_permissions
        if _is_full_access(request.user):
            return value
        if not _user_can_manage_permissions(request.user):
            raise serializers.ValidationError("У вас нет права управлять правами других ролей.")
        user_codes = _get_user_permission_codes(request.user)
        if user_codes is None:
            return value

        if self.instance:
            # Update: сохраняем пермишены, которых нет у admin'а
            current_perms = list(self.instance.permissions.all())
            preserved = [p for p in current_perms if p.code not in user_codes]
            admin_selected = [p for p in value if p.code in user_codes]
            return admin_selected + preserved
        else:
            requested_codes = {p.code for p in value}
            forbidden = requested_codes - user_codes
            if forbidden:
                raise serializers.ValidationError(
                    f"Вы не можете назначить права, которых нет у вас: {', '.join(sorted(forbidden))}"
                )
            return value

    def update(self, instance, validated_data):
        perms = validated_data.pop("permissions", None)
        instance = super().update(instance, validated_data)
        if perms is not None:
            instance.permissions.set(perms)
        return instance
```

### 4.7 OrgRoleCreateSerializer (создание)

```python
class OrgRoleCreateSerializer(serializers.ModelSerializer):
    permissions = serializers.PrimaryKeyRelatedField(
        queryset=OrgPermission.objects.all(), many=True, required=False,
    )

    class Meta:
        model = OrgRole
        fields = ("id", "title", "group", "department", "parent_role", "permissions")

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        company = getattr(getattr(request, "user", None), "company", None) if request else None
        if company:
            if "department" in fields:
                fields["department"].queryset = Department.objects.filter(company=company)
            if "parent_role" in fields:
                fields["parent_role"].queryset = OrgRole.objects.filter(company=company)
        return fields

    def validate_title(self, value):
        if not value.strip():
            raise serializers.ValidationError("Название роли не может быть пустым.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        company = request.user.company if request else None
        parent = attrs.get("parent_role")
        if parent and company and parent.company_id != company.id:
            raise serializers.ValidationError({"parent_role": "Родительская роль должна быть из той же компании."})
        department = attrs.get("department")
        if department and company and department.company_id != company.id:
            raise serializers.ValidationError({"department": "Департамент должен быть из той же компании."})
        return attrs

    def create(self, validated_data):
        perms = validated_data.pop("permissions", [])
        request = self.context.get("request")
        validated_data["company"] = request.user.company

        # Auto-generate unique slug code from title
        from django.utils.text import slugify
        base_code = slugify(validated_data["title"], allow_unicode=False) or "role"
        code = base_code
        company = validated_data["company"]
        counter = 1
        while OrgRole.objects.filter(company=company, code=code).exists():
            code = f"{base_code}_{counter}"
            counter += 1
        validated_data["code"] = code

        instance = super().create(validated_data)
        if perms:
            instance.permissions.set(perms)
        return instance
```

### 4.8 EmployeeAssignmentSerializer

```python
class EmployeeAssignmentSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    org_role_title = serializers.CharField(source="org_role.title", read_only=True)

    class Meta:
        model = EmployeeAssignment
        fields = ("id", "employee", "unit", "unit_name", "department", "department_name", "org_role", "org_role_title")
        read_only_fields = ("employee",)
```

### 4.9 EmployeeSerializer

```python
class EmployeeSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        source="user", queryset=User.objects.all(),
        write_only=True, required=False, allow_null=True,
    )
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    role_title = serializers.CharField(source="org_role.title", read_only=True, default="")
    assignments = EmployeeAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = Employee
        fields = (
            "id", "company", "user", "user_id", "email", "full_name",
            "first_name", "last_name", "role_title", "grade", "birth_date",
            "avatar_url", "pattern", "can_split", "can_extra", "assignments",
        )
        read_only_fields = ("company",)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not data.get("full_name"):
            if instance.user:
                name = f"{instance.user.first_name or ''} {instance.user.last_name or ''}".strip()
                data["full_name"] = name or instance.user.email
            else:
                data["full_name"] = f"Сотрудник #{instance.pk}"
        return data

    def create(self, validated_data):
        request = self.context.get("request")
        if "company" not in validated_data and request and getattr(request.user, "company", None):
            validated_data["company"] = request.user.company
        return super().create(validated_data)
```

### 4.10 InviteAssignmentInputSerializer (валидация входных данных)

```python
class InviteAssignmentInputSerializer(serializers.Serializer):
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.none())
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.none(), required=False, allow_null=True, default=None,
    )
    org_role = serializers.PrimaryKeyRelatedField(queryset=OrgRole.objects.none())

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        company = getattr(getattr(request, "user", None), "company", None) if request else None
        if company:
            fields["unit"].queryset = Unit.objects.filter(company=company)
            fields["department"].queryset = Department.objects.filter(company=company)
            fields["org_role"].queryset = OrgRole.objects.filter(company=company, is_assignable=True)
        return fields

    def validate(self, data):
        dept = data.get("department")
        unit = data["unit"]
        org_role = data["org_role"]
        if dept and dept.unit_id != unit.id:
            raise serializers.ValidationError("Департамент должен принадлежать выбранному юниту.")
        if org_role.department_id and dept and org_role.department_id != dept.id:
            raise serializers.ValidationError("Роль привязана к другому департаменту.")
        if org_role.department_id and org_role.department.unit_id != unit.id:
            raise serializers.ValidationError("Роль принадлежит департаменту из другого юнита.")
        return data
```

### 4.11 EmployeeAssignmentBulkSerializer

```python
class EmployeeAssignmentBulkSerializer(serializers.Serializer):
    employee = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.none())
    assignments = InviteAssignmentInputSerializer(many=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        company = getattr(getattr(request, "user", None), "company", None) if request else None
        if company:
            self.fields["employee"].queryset = Employee.objects.filter(company=company)
```

### 4.12 InviteCreateSerializer

```python
class InviteCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")
    grade = serializers.IntegerField(default=0, min_value=0, max_value=5)
    assignments = InviteAssignmentInputSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        if attrs.get("grade") is None:
            attrs["grade"] = 0
        return attrs
```

### 4.13 InviteSerializer

```python
class InviteSerializer(serializers.ModelSerializer):
    org_role_title = serializers.CharField(source="org_role.title", read_only=True, default=None)
    unit_name = serializers.CharField(source="unit.name", read_only=True, default=None)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    invite_assignments = InviteAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = Invite
        fields = (
            "id", "email", "first_name", "last_name",
            "grade", "org_role", "org_role_title", "unit", "unit_name",
            "department", "department_name",
            "invite_assignments",
            "token", "status", "expires_at", "created_at", "sent_at",
        )
        read_only_fields = ("token", "status", "expires_at", "created_at", "sent_at")
```

### 4.14 RegisterSerializer

```python
class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")
    company_name = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Пользователь с таким email уже существует")
        return value

    def create(self, validated_data):
        company_name = (validated_data.pop("company_name", "") or "").strip()
        first_name = (validated_data.pop("first_name", "") or "").strip()
        last_name = (validated_data.pop("last_name", "") or "").strip()

        if not company_name:
            local = validated_data["email"].split("@")[0]
            company_name = f"{local} — компания"

        # Создаём компанию (post_save сигнал создаст роли developer + owner)
        company = Company.objects.create(name=company_name)

        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=first_name, last_name=last_name,
            company=company, role="owner", is_active=True,
        )

        # Создаём Employee с org_role = Владелец
        owner_role = OrgRole.objects.filter(company=company, code="owner").first()
        full_name = f"{last_name} {first_name}".strip()
        emp, created = Employee.objects.get_or_create(
            user=user,
            defaults={"company": company, "org_role": owner_role, "full_name": full_name},
        )
        return user
```

### 4.15 AcceptInviteSerializer

```python
class AcceptInviteSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)
    agree = serializers.BooleanField()
    birth_date = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, data):
        if not data.get("agree"):
            raise serializers.ValidationError({"agree": "Требуется согласие"})

        invite = Invite.objects.select_related("company").prefetch_related(
            "invite_assignments"
        ).get(token=data["token"])

        if invite.status != "pending":
            raise serializers.ValidationError({"token": "Приглашение недействительно"})
        if not invite.is_usable():
            raise serializers.ValidationError({"token": "Срок действия истёк"})
        if User.objects.filter(email=invite.email).exists():
            raise serializers.ValidationError({"token": "Пользователь уже зарегистрирован"})

        data["invite"] = invite
        return data

    def create(self, validated_data):
        invite = validated_data["invite"]

        # Создаём User
        user = User.objects.create_user(
            email=invite.email, password=validated_data["password"],
            first_name=invite.first_name, last_name=invite.last_name,
            role="employee", company=invite.company, is_active=True,
        )

        # Создаём Employee
        emp, _ = Employee.objects.get_or_create(
            user=user,
            defaults={
                "company": invite.company,
                "full_name": f"{invite.last_name} {invite.first_name}".strip(),
                "grade": invite.grade or 0,
                "birth_date": validated_data.get("birth_date"),
            },
        )

        # Конвертируем InviteAssignment → EmployeeAssignment
        invite_assignments = list(invite.invite_assignments.all())
        if invite_assignments:
            safe = [ia for ia in invite_assignments if ia.org_role and ia.org_role.is_assignable]
            for ia in safe:
                EmployeeAssignment.objects.get_or_create(
                    employee=emp, unit=ia.unit, org_role=ia.org_role,
                    defaults={"department": ia.department},
                )
        elif invite.unit and invite.org_role and invite.org_role.is_assignable:
            # Fallback на legacy поля
            EmployeeAssignment.objects.get_or_create(
                employee=emp, unit=invite.unit, org_role=invite.org_role,
                defaults={"department": invite.department},
            )

        invite.status = "accepted"
        invite.save(update_fields=["status"])
        return {"user_id": user.id, "employee_id": emp.id}
```

---

## 5. Views / API эндпоинты

### 5.1 URL-роутинг

```python
# core/urls.py (все маршруты под /api/)
router = DefaultRouter()
router.register("units", UnitViewSet)
router.register("departments", DepartmentViewSet)
router.register("org-roles", OrgRoleViewSet)
router.register("org-permissions", OrgPermissionViewSet)
router.register("employees", EmployeeViewSet)
router.register("employee-assignments", EmployeeAssignmentViewSet)
router.register("invites", InviteViewSet)
router.register("zones", ZoneViewSet)
router.register("companies", CompanyViewSet)
router.register("me", MeViewSet)

urlpatterns = [
    path("auth/register/", RegisterView.as_view()),
    path("auth/accept-invite/", AcceptInviteView.as_view()),
    path("auth/login/", CustomTokenObtainPairView.as_view()),
    path("auth/refresh/", CustomTokenRefreshView.as_view()),
    # ...
] + router.urls
```

### 5.2 Сводная таблица эндпоинтов

| Эндпоинт | Тип | Пермишен (read / write) | Доп. actions |
|---|---|---|---|
| `/api/units/` | ModelViewSet | `org.view` / `org.manage` | `reorder` |
| `/api/departments/` | ModelViewSet | `org.view` / `org.manage` | `reorder` |
| `/api/org-roles/` | ModelViewSet | `org.view` / `org.roles_manage` | `hierarchy`, `assignable` |
| `/api/org-permissions/` | ReadOnlyModelViewSet | `org.roles_manage` | — |
| `/api/employees/` | ModelViewSet | любой auth / `team.manage` | — |
| `/api/employee-assignments/` | ModelViewSet | `team.view` / `team.manage` | `bulk_create` |
| `/api/invites/` | ModelViewSet | `team.view` / `team.manage` | `resend`, `revoke` |
| `/api/zones/` | ModelViewSet | любой auth / `org.manage` | — |
| `/api/auth/register/` | APIView | AllowAny | — |
| `/api/auth/accept-invite/` | APIView | AllowAny | — |

### 5.3 UnitViewSet

```python
class UnitViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "unit"
    serializer_class = UnitSerializer
    permission_classes = [require_read_write("org.view", "org.manage")]
    pagination_class = None

    def get_queryset(self):
        return Unit.objects.filter(
            company=self.request.user.company
        ).prefetch_related("departments")

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        ids = request.data.get("ids", [])
        for i, uid in enumerate(ids):
            Unit.objects.filter(id=uid, company=request.user.company).update(sort_order=i)
        self._broadcast("updated")
        return Response({"status": "ok"})
```

### 5.4 DepartmentViewSet

```python
class DepartmentViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "department"
    serializer_class = DepartmentOrgSerializer
    permission_classes = [require_read_write("org.view", "org.manage")]
    pagination_class = None

    def get_queryset(self):
        qs = Department.objects.filter(
            company=self.request.user.company
        ).select_related("unit")
        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        ids = request.data.get("ids", [])
        for i, did in enumerate(ids):
            Department.objects.filter(id=did, company=request.user.company).update(sort_order=i)
        self._broadcast("updated")
        return Response({"status": "ok"})
```

### 5.5 OrgRoleViewSet

```python
class OrgRoleViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "org_role"
    permission_classes = [require_read_write("org.view", "org.roles_manage")]
    pagination_class = None

    def get_serializer_class(self):
        if self.action == "create":
            return OrgRoleCreateSerializer
        return OrgRoleSerializer

    def get_queryset(self):
        qs = OrgRole.objects.filter(
            company=self.request.user.company
        ).exclude(
            code="developer"  # Роль "Разработчик" скрыта от UI
        ).select_related("department", "department__unit", "parent_role"
        ).prefetch_related("permissions", "child_roles")

        # Фильтры через query params
        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(department__unit_id=unit_id)
        department_id = self.request.query_params.get("department")
        if department_id:
            qs = qs.filter(department_id=department_id)
        parent_id = self.request.query_params.get("parent_role")
        if parent_id:
            qs = qs.filter(parent_role_id=parent_id)
        return qs

    def perform_update(self, serializer):
        if serializer.instance.is_system:
            raise ValidationError({"detail": "Системные роли нельзя редактировать."})
        serializer.save()

    def perform_destroy(self, instance):
        if instance.is_system:
            raise ValidationError({"detail": "Системные роли нельзя удалить."})
        instance.delete()

    @action(detail=False, methods=["get"])
    def hierarchy(self, request):
        """Иерархия ролей сгруппированная по Unit → Department → Roles."""
        roles = list(self.get_queryset().select_related("department", "department__unit", "parent_role"))
        units = Unit.objects.filter(company=request.user.company).order_by("name")
        departments = Department.objects.filter(company=request.user.company).select_related("unit")

        result = []
        for unit in units:
            unit_depts = []
            for dept in departments:
                if dept.unit_id != unit.id:
                    continue
                dept_roles = [r for r in roles if r.department_id == dept.id]
                unit_depts.append({
                    "department_id": dept.id,
                    "department_name": dept.name,
                    "roles": [{"id": r.id, "title": r.title, "code": r.code,
                               "level": r.level, "is_system": r.is_system,
                               "parent_role_id": r.parent_role_id} for r in dept_roles],
                })
            result.append({"unit_id": unit.id, "unit_name": unit.name, "departments": unit_depts})

        # Общие роли (без департамента)
        roles_no_dept = [r for r in roles if r.department_id is None]
        if roles_no_dept:
            result.append({
                "unit_id": None, "unit_name": "Общие роли",
                "departments": [],
                "roles_without_department": [
                    {"id": r.id, "title": r.title, "code": r.code,
                     "level": r.level, "is_system": r.is_system,
                     "parent_role_id": r.parent_role_id} for r in roles_no_dept
                ],
            })
        return Response(result)

    @action(detail=False, methods=["get"])
    def assignable(self, request):
        """Роли, которые текущий пользователь может назначать (подчинённые в иерархии)."""
        subordinate_ids = get_subordinate_role_ids(request.user)
        qs = OrgRole.objects.filter(
            company=request.user.company, is_assignable=True,
        ).exclude(code="developer").select_related("department", "department__unit", "parent_role"
        ).prefetch_related("permissions", "child_roles")
        if subordinate_ids is not None:
            qs = qs.filter(id__in=subordinate_ids)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)
```

### 5.6 OrgPermissionViewSet

```python
class OrgPermissionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrgPermissionListSerializer
    permission_classes = [require_permission("org.roles_manage")]
    pagination_class = None

    def get_queryset(self):
        from .permissions import _get_user_permission_codes
        codes = _get_user_permission_codes(self.request.user)
        qs = OrgPermission.objects.all().order_by("id")
        if codes is not None:
            qs = qs.filter(code__in=codes)  # Видишь только те пермишены, что есть у тебя
        return qs
```

### 5.7 EmployeeViewSet

```python
class EmployeeViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "employee"
    serializer_class = EmployeeSerializer
    permission_classes = [require_read_write(None, "team.manage")]
    pagination_class = None

    def get_queryset(self):
        qs = Employee.objects.filter(
            company=self.request.user.company
        ).select_related("company", "user")

        # Фильтр по иерархии ролей: менеджер видит только подчинённых
        subordinate_ids = get_subordinate_role_ids(self.request.user)
        if subordinate_ids is not None:
            qs = qs.filter(assignments__org_role_id__in=subordinate_ids)
        else:
            qs = scope_queryset_by_unit(qs, self.request.user, "team.view", "assignments__unit_id")

        unit_param = self.request.query_params.get("unit")
        if unit_param:
            qs = qs.filter(assignments__unit_id=unit_param)
        return qs.distinct()

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    def perform_destroy(self, instance):
        user = instance.user
        if user:
            Invite.objects.filter(company=instance.company, email=user.email).delete()
        instance.delete()
        if user:
            try:
                from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
                OutstandingToken.objects.filter(user=user).delete()
            except Exception:
                pass
            user.delete()
```

### 5.8 EmployeeAssignmentViewSet

```python
class EmployeeAssignmentViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "employee_assignment"
    serializer_class = EmployeeAssignmentSerializer
    permission_classes = [require_read_write("team.view", "team.manage")]
    pagination_class = None

    def get_queryset(self):
        qs = EmployeeAssignment.objects.filter(
            employee__company=self.request.user.company
        ).select_related("unit", "department", "org_role", "employee")
        qs = scope_queryset_by_unit(qs, self.request.user, "team.view", "unit_id")
        employee_id = self.request.query_params.get("employee")
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        return qs

    def _check_hierarchy(self, role_id):
        """Проверяет, что назначаемая роль подчинена роли текущего пользователя."""
        subordinate_ids = get_subordinate_role_ids(self.request.user)
        if subordinate_ids is not None and role_id not in subordinate_ids:
            raise PermissionDenied("Вы не можете назначить роль, не подчинённую вашей.")

    def perform_create(self, serializer):
        unit = serializer.validated_data.get("unit")
        allowed = get_user_unit_ids(self.request.user, "team.manage")
        if allowed is not None and (not unit or unit.id not in allowed):
            raise PermissionDenied("Нет доступа к этому юниту")
        self._check_hierarchy(serializer.validated_data["org_role"].id)
        serializer.save()

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        """Массовое назначение: {employee: id, assignments: [{unit, department, org_role}, ...]}"""
        ser = EmployeeAssignmentBulkSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)

        employee = ser.validated_data["employee"]
        allowed_units = get_user_unit_ids(request.user, "team.manage")
        subordinate_ids = get_subordinate_role_ids(request.user)

        # Валидация каждого назначения
        for asgn_data in ser.validated_data["assignments"]:
            if allowed_units is not None and asgn_data["unit"].id not in allowed_units:
                return Response({"detail": "Нет доступа к этому юниту."}, status=403)
            if subordinate_ids is not None and asgn_data["org_role"].id not in subordinate_ids:
                return Response({"detail": "Роль не подчинена вашей."}, status=403)

        created = []
        any_new = False
        with transaction.atomic():
            for asgn_data in ser.validated_data["assignments"]:
                obj, is_new = EmployeeAssignment.objects.get_or_create(
                    employee=employee,
                    unit=asgn_data["unit"],
                    org_role=asgn_data["org_role"],
                    defaults={"department": asgn_data.get("department")},
                )
                if not is_new and obj.department != asgn_data.get("department"):
                    obj.department = asgn_data.get("department")
                    obj.save(update_fields=["department"])
                else:
                    any_new = True
                employee.units.add(asgn_data["unit"])
                created.append(EmployeeAssignmentSerializer(obj).data)

        self._broadcast("updated")
        return Response(created, status=201 if any_new else 200)
```

### 5.9 InviteViewSet

```python
class InviteViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "invite"
    serializer_class = InviteSerializer
    permission_classes = [require_read_write("team.view", "team.manage")]

    def get_queryset(self):
        company = self.request.user.company
        now = timezone.now()
        qs = Invite.objects.filter(
            company=company, status="pending", expires_at__gt=now
        ).select_related("org_role", "unit", "department"
        ).prefetch_related("invite_assignments")

        subordinate_ids = get_subordinate_role_ids(self.request.user)
        if subordinate_ids is not None:
            qs = qs.filter(invite_assignments__org_role_id__in=subordinate_ids)
        else:
            qs = scope_queryset_by_unit(qs, self.request.user, "team.view", "invite_assignments__unit_id")
        return qs.distinct()

    def get_serializer_class(self):
        if self.action == "create":
            return InviteCreateSerializer
        return InviteSerializer

    def perform_create(self, serializer):
        company = self.request.user.company
        email = serializer.validated_data.get("email")

        # Проверка иерархии
        subordinate_ids = get_subordinate_role_ids(self.request.user)
        if subordinate_ids is not None:
            for asgn in serializer.validated_data.get("assignments", []):
                if asgn["org_role"].id not in subordinate_ids:
                    raise ValidationError({"detail": "Роль не подчинена вашей."})

        # Дедупликация
        if Invite.objects.filter(company=company, email=email, status="accepted").exists():
            raise ValidationError({"detail": "Пользователь уже принял приглашение."})
        Invite.objects.filter(
            company=company, email=email, status__in=["pending", "revoked", "expired"]
        ).delete()

        # Атомарное создание
        with transaction.atomic():
            invite = Invite.objects.create(
                company=company, invited_by=self.request.user,
                email=email,
                first_name=serializer.validated_data.get("first_name", ""),
                last_name=serializer.validated_data.get("last_name", ""),
                grade=serializer.validated_data.get("grade", 0),
                token=Invite.make_token(),
                expires_at=Invite.default_expire(days=14),
                status="pending",
            )
            for asgn in serializer.validated_data.get("assignments", []):
                InviteAssignment.objects.create(
                    invite=invite,
                    unit=asgn["unit"],
                    department=asgn.get("department"),
                    org_role=asgn["org_role"],
                )

        self._send_invite_email(invite)
        invite.sent_at = timezone.now()
        invite.save(update_fields=["sent_at"])

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        invite = get_object_or_404(Invite, pk=pk, company=request.user.company)
        if invite.status not in ("pending", "expired"):
            return Response({"detail": "Нельзя переотправить"}, status=400)
        invite.expires_at = Invite.default_expire(days=14)
        invite.status = "pending"
        invite.sent_at = timezone.now()
        invite.save(update_fields=["expires_at", "status", "sent_at", "org_role"])
        self._send_invite_email(invite)
        return Response({"status": "resent"})

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        invite = get_object_or_404(Invite, pk=pk, company=request.user.company)
        if invite.status != "pending":
            return Response({"detail": "Можно отзывать только pending"}, status=400)
        invite.status = "revoked"
        invite.save(update_fields=["status"])
        return Response({"status": "revoked"})
```

---

## 6. WebSocket (real-time)

### 6.1 BroadcastMixin (backend)

Все viewset'ы, изменяющие данные, наследуют `BroadcastMixin`. При создании/обновлении/удалении — отправляется WebSocket-событие всем пользователям компании.

```python
def broadcast_data_change(company_id, entity, action, entity_id=None, extra=None, user_id=None):
    layer = get_channel_layer()
    payload = {"entity": entity, "action": action}
    if entity_id is not None:
        payload["id"] = entity_id
    if user_id is not None:
        payload["user_id"] = user_id
    if extra:
        payload.update(extra)
    async_to_sync(layer.group_send)(
        f"company_{company_id}_updates",
        {"type": "data.change", "payload": payload},
    )


class BroadcastMixin:
    broadcast_entity = None  # "unit", "department", "org_role", "employee" и т.д.

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if not self.broadcast_entity or request.method in ("GET", "HEAD", "OPTIONS"):
            return response
        company_id = getattr(request.user, "company_id", None)
        if not company_id:
            return response

        status_code = response.status_code
        action = getattr(self, "action", None)

        if status_code == 201 and action == "create":
            broadcast_data_change(company_id, self.broadcast_entity, "created", ...)
        elif status_code == 200 and action in ("update", "partial_update"):
            broadcast_data_change(company_id, self.broadcast_entity, "updated", ...)
        elif status_code == 204 and action == "destroy":
            broadcast_data_change(company_id, self.broadcast_entity, "deleted", ...)
        return response

    def _broadcast(self, action, entity_id=None, extra=None):
        """Ручной broadcast (для custom actions типа reorder, bulk_create)."""
        broadcast_data_change(company_id, self.broadcast_entity, action, entity_id, extra)
```

### 6.2 Consumer (WebSocket endpoint)

```python
class DataChangeConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close()
            return
        company_id = await database_sync_to_async(lambda: user.company_id)()
        self.group_name = f"company_{company_id}_updates"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def data_change(self, event):
        await self.send(text_data=json.dumps(event["payload"]))
```

**Routing**:
```python
websocket_urlpatterns = [
    re_path(r"^ws/updates/$", DataChangeConsumer.as_asgi()),
]
```

### 6.3 Фронтенд (RealtimeContext)

```javascript
// Подключение через WebSocket с JWT-токеном
const ws = new WebSocket(`${getWsUrl()}?token=${accessToken}`);

ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    // data = { entity: "unit", action: "created", id: 5, user_id: 1 }
    // Все подписчики получают событие
    listeners.forEach((cb) => cb(data));
};
```

Компоненты подписываются через `subscribe()` и рефетчат данные при изменении entity.

---

## 7. Сигналы и автоматизация

### 7.1 Автосоздание ролей при создании компании

При `post_save` на `Company` (created=True) автоматически создаются две системные роли:

```python
@receiver(post_save, sender=Company)
def seed_base_roles_for_company(sender, instance, created, **kwargs):
    if not created:
        return

    developer = OrgRole.objects.create(
        company=instance,
        code="developer",
        title="Разработчик",
        parent_role=None,       # корень иерархии
        is_assignable=False,    # нельзя назначить через UI
        is_system=True,         # нельзя удалить/переименовать
    )
    owner = OrgRole.objects.create(
        company=instance,
        code="owner",
        title="Владелец",
        parent_role=developer,  # подчиняется Разработчику
        is_assignable=False,
        is_system=True,
    )

    # Назначаем все существующие пермишены обеим ролям
    all_perms = OrgPermission.objects.all()
    if all_perms.exists():
        developer.permissions.set(all_perms)
        owner.permissions.set(all_perms)
```

### 7.2 Синхронизация ФИО

При обновлении `CustomUser` — синхронизируется `Employee.full_name`:

```python
@receiver(post_save, sender=CustomUser)
def sync_employee_full_name(sender, instance, created, **kwargs):
    # Если у User изменились first_name/last_name → обновляем Employee.full_name
    ...
```

---

## 8. Management-команда seed_permissions

Команда `seed_permissions` создаёт/обновляет все `OrgPermission` и назначает их системным ролям.

### 8.1 Полный список пермишенов (42 шт.)

| Домен | Код | Название |
|-------|-----|----------|
| **team** | `team.view` | Видеть список сотрудников |
| | `team.manage` | Добавлять, редактировать и удалять сотрудников |
| **org** | `org.view` | Видеть юниты, департаменты, должности и зоны |
| | `org.manage` | Создавать и удалять юниты, департаменты, должности и зоны |
| | `org.roles_manage` | Создавать и настраивать роли |
| **schedule** | `schedule.view` | Видеть шаблон графика |
| | `schedule.manage` | Редактировать шаблон графика |
| | `schedule.participate` | Участвовать в генерации графика |
| **period** | `period.view` | Видеть рабочий график и смены |
| | `period.view_unit` | Видеть график всего юнита |
| | `period.manage` | Создавать и редактировать периоды и смены |
| | `period.generate` | Запускать автоматическое составление графика |
| | `period.approve` | Утверждать готовый график |
| **swap** | `swap.request` | Отправлять запрос на обмен сменой |
| | `swap.accept` | Принимать или отклонять входящий запрос |
| | `swap.confirm` | Подтверждать обмен как руководитель |
| **preferences** | `preferences.own` | Настраивать свои пожелания по графику |
| | `preferences.all` | Видеть и менять пожелания любого сотрудника |
| **finance** | `finance.dashboard` | Доступ к дашборду |
| | `finance.own` | Видеть свои чаевые и заметки к сменам |
| **subscription** | `subscription.view` | Видеть статус подписки |
| | `subscription.manage` | Оформлять и управлять подпиской |
| **checklists** | `checklists.view_templates` | Видеть шаблоны чеклистов |
| | `checklists.create_template` | Создавать шаблоны чеклистов |
| | `checklists.edit_template` | Редактировать шаблоны чеклистов |
| | `checklists.delete_template` | Удалять шаблоны чеклистов |
| | `checklists.fill` | Заполнять чеклисты |
| | `checklists.view_status` | Видеть статус выполнения чеклистов |
| | `checklists.archive_session` | Отправлять чеклисты в архив |
| **textbooks** | `textbooks.view` | Просматривать учебники |
| | `textbooks.edit` | Редактировать карточки учебников |
| | `textbooks.manage_assignments` | Распределять карточки по подразделениям |
| | `textbooks.manage_all` | Управлять всеми учебниками (полный доступ) |
| **feedback** | `feedback.submit` | Оставлять отзывы |
| | `feedback.view` | Видеть отзывы своих юнитов |
| | `feedback.view_all` | Видеть все отзывы компании |
| | `feedback.edit` | Редактировать и удалять отзывы |
| | `feedback.edit_templates` | Настраивать шаблоны отзывов |
| | `feedback.moderate` | Скрывать и показывать отзывы |
| | `feedback.submit_wish` | Оставлять пожелания |
| | `feedback.view_wishes` | Видеть пожелания сотрудников |
| | `feedback.manage_parser` | Подключать внешние источники отзывов |
| | `feedback.notify_negative` | Получать уведомления о негативных отзывах |

### 8.2 Логика команды

```python
class Command(BaseCommand):
    help = "Создаёт все OrgPermission и назначает их системным ролям"

    def handle(self, *args, **options):
        for code, name, description in PERMISSIONS:
            _, created = OrgPermission.objects.get_or_create(
                code=code,
                defaults={"name": name, "description": description},
            )
            if not created:
                # Upsert: обновляем name и description
                OrgPermission.objects.filter(code=code).update(name=name, description=description)

        all_perms = OrgPermission.objects.all()

        # Назначаем ВСЕ пермишены системным ролям (developer, owner) во всех компаниях
        system_roles = OrgRole.objects.filter(code__in=("developer", "owner"), is_system=True)
        for role in system_roles:
            role.permissions.set(all_perms)
```

---

## 9. Фронтенд

### 9.1 API-модули

**`api/org.js`** — Units, Departments, Roles, Permissions:
```javascript
// Units
export const getUnits = () => axiosInstance.get("units/");
export const createUnit = (data) => axiosInstance.post("units/", data);
export const updateUnit = (id, data) => axiosInstance.patch(`units/${id}/`, data);
export const deleteUnit = (id) => axiosInstance.delete(`units/${id}/`);
export const reorderUnits = (ids) => axiosInstance.post("units/reorder/", { ids });

// Departments
export const getDepartments = (params) => axiosInstance.get("departments/", { params });
export const createDepartment = (data) => axiosInstance.post("departments/", data);
export const updateDepartment = (id, data) => axiosInstance.patch(`departments/${id}/`, data);
export const deleteDepartment = (id) => axiosInstance.delete(`departments/${id}/`);
export const reorderDepartments = (ids) => axiosInstance.post("departments/reorder/", { ids });

// Roles
export const getOrgRoles = (params) => axiosInstance.get("org-roles/", { params });
export const getOrgRole = (id) => axiosInstance.get(`org-roles/${id}/`);
export const getRoleHierarchy = () => axiosInstance.get("org-roles/hierarchy/");
export const createOrgRole = (data) => axiosInstance.post("org-roles/", data);
export const updateOrgRole = (id, data) => axiosInstance.patch(`org-roles/${id}/`, data);
export const deleteOrgRole = (id) => axiosInstance.delete(`org-roles/${id}/`);
export const getAssignableRoles = () => axiosInstance.get("org-roles/assignable/");

// Permissions
export const getOrgPermissions = () => axiosInstance.get("org-permissions/");
```

**`api/team.js`** — Employees:
```javascript
export const getTeam = async () => (await axiosInstance.get("team/")).data;
export const addEmployee = async (data) => (await axiosInstance.post("team/", data)).data;
export const updateEmployee = async (id, data) => (await axiosInstance.patch(`team/${id}/`, data)).data;
export const deleteEmployee = async (id) => (await axiosInstance.delete(`team/${id}/`)).data;
```

**`api/assignments.js`** — Employee assignments:
```javascript
export const getAssignments = (params) => axiosInstance.get("employee-assignments/", { params });
export const createAssignment = (data) => axiosInstance.post("employee-assignments/", data);
export const updateAssignment = (id, data) => axiosInstance.patch(`employee-assignments/${id}/`, data);
export const deleteAssignment = (id) => axiosInstance.delete(`employee-assignments/${id}/`);
export const bulkCreateAssignments = (data) => axiosInstance.post("employee-assignments/bulk_create/", data);
```

**`api/auth.js`** — Аутентификация:
```javascript
export const login = async (email, password) => {
    const res = await axiosInstance.post("auth/login/", { email, password });
    if (res.data?.access) {
        localStorage.setItem("accessToken", res.data.access);
        if (res.data.refresh) localStorage.setItem("refreshToken", res.data.refresh);
    }
    return res.data;
};

export const register = async ({ email, password, first_name, last_name, company_name }) => {
    return (await axiosInstance.post("auth/register/", {
        email, password, first_name, last_name, company_name,
    })).data;
};
```

### 9.2 Контекст авторизации (AuthContext)

```javascript
// AuthContext.jsx
export function hasPermission(user, code) {
    if (!user?.permissions) return false;
    return user.permissions.includes(code);
}

export function getUserUnitsForPermission(user, code) {
    if (!user) return [];
    if (!user.unit_permissions) return null; // null = full access
    return Object.entries(user.unit_permissions)
        .filter(([, codes]) => codes.includes(code))
        .map(([unitId]) => Number(unitId));
}

export function hasPermissionInUnit(user, code, unitId) {
    if (!user) return false;
    if (!user.unit_permissions) return user.permissions?.includes(code) ?? false;
    const codes = user.unit_permissions[String(unitId)];
    return codes ? codes.includes(code) : false;
}
```

### 9.3 Route Guard (RequirePermission)

```jsx
export default function RequirePermission({ code, children }) {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (!hasPermission(user, code)) return <Navigate to="/profile" replace />;
    return children;
}

// Использование в роутере:
<Route path="/team" element={
    <RequirePermission code="team.view">
        <TeamPage />
    </RequirePermission>
} />
```

### 9.4 Получение данных текущего пользователя

Фронтенд вызывает `GET /api/me/` при загрузке и получает:

```json
{
    "id": 1,
    "email": "admin@example.com",
    "role": "owner",
    "company": 1,
    "is_superuser": false,
    "employee_id": 1,
    "org_role_id": 2,
    "org_role_code": "owner",
    "org_role_title": "Владелец",
    "permissions": ["team.view", "team.manage", "org.view", "org.manage", ...],
    "unit_permissions": null,  // null = full access
    "can_manage_permissions": true,
    "assignments": [
        {"id": 1, "unit": 1, "unit_name": "Ресторан 1", "department": null,
         "department_name": null, "org_role": 2, "org_role_title": "Владелец"}
    ]
}
```

---

## 10. Onboarding: регистрация и инвайты

### 10.1 Флоу регистрации (owner)

```
POST /api/auth/register/
    ↓
Company.objects.create(name=company_name)
    ↓ (post_save signal)
OrgRole "developer" создаётся (корень)
OrgRole "owner" создаётся (parent=developer)
Все OrgPermission назначаются обеим ролям
    ↓
User.objects.create_user(role="owner", company=company)
    ↓
Employee.objects.get_or_create(user=user, org_role=owner_role)
    ↓
Response: { user, access, refresh }
```

### 10.2 Флоу приглашения (employee)

```
# Менеджер создаёт инвайт:
POST /api/invites/
body: {
    email: "new@example.com",
    first_name: "Иван",
    last_name: "Петров",
    grade: 2,
    assignments: [
        { unit: 1, department: 3, org_role: 5 },
        { unit: 2, department: null, org_role: 7 },
    ]
}
    ↓
Invite.objects.create(token=..., expires_at=+14 days)
InviteAssignment.objects.create(invite, unit, department, org_role) × N
Email с ссылкой /accept-invite?token=...
    ↓

# Сотрудник принимает инвайт:
POST /api/auth/accept-invite/
body: { token: "...", password: "...", agree: true }
    ↓
User.objects.create_user(role="employee", company=invite.company)
Employee.objects.get_or_create(user=user)
    ↓ (для каждого InviteAssignment)
EmployeeAssignment.objects.get_or_create(employee, unit, org_role)
    ↓
invite.status = "accepted"
Response: { user_id, employee_id }
```

### 10.3 Ограничения при создании инвайта

1. **Иерархия ролей**: менеджер может назначить только роли, подчинённые его собственным (BFS по `parent_role`)
2. **Unit-scope**: менеджер может приглашать только в юниты, к которым у него есть `team.manage`
3. **Дедупликация**: старые pending/revoked/expired инвайты для того же email удаляются
4. **Проверка**: нельзя создать инвайт, если email уже есть в системе с accepted-статусом

---

## Приложение: ER-диаграмма (текстовая)

```
┌──────────┐     ┌────────────┐
│ Company  │────<│ CustomUser │
└──────────┘     └────────────┘
     │                  │ 1:1
     │           ┌──────────────┐
     ├──────────<│   Employee   │
     │           └──────────────┘
     │                  │ 1:N
     │           ┌──────────────────────┐
     │           │ EmployeeAssignment   │
     │           │  employee FK         │
     │           │  unit FK             │
     │           │  department FK (opt) │
     │           │  org_role FK         │
     │           └──────────────────────┘
     │
     ├──────────<┌──────┐
     │           │ Unit │
     │           └──────┘
     │              │ 1:N
     │           ┌────────────┐
     ├──────────<│ Department │
     │           └────────────┘
     │              │ 1:N
     │           ┌─────────┐     ┌───────────────┐
     ├──────────<│ OrgRole │────<│ OrgPermission │ (M2M, global)
     │           │ parent→self   └───────────────┘
     │           └─────────┘
     │              │ 1:N
     │           ┌──────┐
     ├──────────<│ Zone │
     │           └──────┘
     │
     │           ┌────────┐
     ├──────────<│ Invite │
     │           └────────┘
     │              │ 1:N
     │           ┌────────────────────┐
     │           │ InviteAssignment   │
     │           │  → EmployeeAssignment при accept
     │           └────────────────────┘
```
