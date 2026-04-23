import secrets

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


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


class Company(models.Model):
    name = models.CharField("Название", max_length=255)
    timezone = models.CharField("Часовой пояс", max_length=64, default="Europe/Moscow")
    created_at = models.DateTimeField("Дата создания", auto_now_add=True)

    class Meta:
        verbose_name = "Компания"
        verbose_name_plural = "Компании"
        indexes = [models.Index(fields=["name"])]

    def __str__(self):
        return self.name


class CustomUser(AbstractUser):
    username = None
    email = models.EmailField("Email", unique=True, db_index=True)
    company = models.ForeignKey(
        Company,
        verbose_name="Компания",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="users",
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


class OrgPermission(models.Model):
    code = models.SlugField("Код", unique=True, max_length=100)
    name = models.CharField("Название", max_length=255)
    description = models.TextField("Описание", blank=True, default="")

    class Meta:
        verbose_name = "Право доступа"
        verbose_name_plural = "Права доступа"

    def __str__(self):
        return f"{self.code} — {self.name}"


class OrgRole(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="org_roles")
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True, related_name="roles"
    )
    code = models.SlugField("Код", max_length=100)
    title = models.CharField("Название", max_length=255)
    level = models.PositiveSmallIntegerField(
        "Уровень", default=0, validators=[MaxValueValidator(10)]
    )
    parent_role = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="child_roles"
    )
    permissions = models.ManyToManyField(OrgPermission, blank=True, related_name="roles")
    can_manage_permissions = models.BooleanField("Может управлять правами", default=False)
    group = models.CharField("Группа", max_length=255, blank=True, default="")
    is_assignable = models.BooleanField("Назначаема через UI", default=True)
    is_system = models.BooleanField("Системная роль", default=False)

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
        depth = 0
        current = self.parent_role
        visited = set()
        while current is not None:
            if current.pk in visited:
                break
            visited.add(current.pk)
            depth += 1
            current = current.parent_role
        return depth

    def _update_subtree_levels(self):
        for child in self.child_roles.all():
            new_level = child._compute_level()
            if child.level != new_level:
                child.level = new_level
                child.save(update_fields=["level"])

    def save(self, *args, **kwargs):
        self.level = self._compute_level()
        super().save(*args, **kwargs)
        self._update_subtree_levels()


class Zone(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="zones")
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name="zones")
    org_role = models.ForeignKey(OrgRole, on_delete=models.CASCADE, related_name="zones")
    name = models.CharField("Название", max_length=255)

    class Meta:
        verbose_name = "Зона"
        verbose_name_plural = "Зоны"
        unique_together = ("company", "department", "org_role", "name")

    def __str__(self):
        return self.name


class Employee(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="employees")
    user = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE, related_name="employee_profile", null=True, blank=True
    )
    org_role = models.ForeignKey(
        OrgRole, on_delete=models.SET_NULL, null=True, blank=True, related_name="employees"
    )
    units = models.ManyToManyField(Unit, blank=True, related_name="employees")
    full_name = models.CharField("ФИО", max_length=255, blank=True, default="")
    birth_date = models.DateField("Дата рождения", null=True, blank=True)
    grade = models.PositiveSmallIntegerField(
        "Грейд", default=1, validators=[MinValueValidator(0), MaxValueValidator(5)]
    )
    avatar_url = models.URLField("Аватар (URL)", blank=True, default="")
    pattern = models.CharField(
        "Паттерн работы",
        max_length=16,
        choices=(("5/2", "5/2"), ("2/2", "2/2"), ("flex", "Гибкий")),
        default="flex",
    )
    can_split = models.BooleanField("Сплит-смены", default=False)
    can_extra = models.BooleanField("Доп. смены", default=True)

    class Meta:
        verbose_name = "Сотрудник"
        verbose_name_plural = "Сотрудники"
        indexes = [models.Index(fields=["company", "grade"])]

    def __str__(self):
        return self.full_name or (self.user.email if self.user else f"Employee #{self.pk}")

    def save(self, *args, **kwargs):
        if not (self.full_name or "").strip() and self.user:
            fn = f"{self.user.first_name or ''} {self.user.last_name or ''}".strip()
            if fn:
                self.full_name = fn
        super().save(*args, **kwargs)


class EmployeeAssignment(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="assignments")
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="assignments")
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, null=True, blank=True, related_name="assignments"
    )
    org_role = models.ForeignKey(OrgRole, on_delete=models.CASCADE, related_name="assignments")

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


class Invite(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="invites")
    invited_by = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True, related_name="sent_invites"
    )
    email = models.EmailField("Email")
    first_name = models.CharField("Имя", max_length=150, blank=True, default="")
    last_name = models.CharField("Фамилия", max_length=150, blank=True, default="")
    grade = models.PositiveSmallIntegerField(
        "Грейд", default=0, validators=[MinValueValidator(0), MaxValueValidator(5)]
    )
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
        return self.status == "pending" and timezone.now() < self.expires_at


class InviteAssignment(models.Model):
    invite = models.ForeignKey(Invite, on_delete=models.CASCADE, related_name="invite_assignments")
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="invite_assignments")
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, null=True, blank=True, related_name="invite_assignments"
    )
    org_role = models.ForeignKey(OrgRole, on_delete=models.CASCADE, related_name="invite_assignments")

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
