from django.db import migrations


PERMISSIONS = [
    ("org.view", "Просмотр структуры", "Просмотр юнитов, департаментов, ролей, зон"),
    ("org.manage", "Управление структурой", "CRUD юнитов, департаментов, зон"),
    ("org.roles_manage", "Управление ролями", "Создание и настройка ролей"),
    ("team.view", "Просмотр сотрудников", "Просмотр списка сотрудников"),
    ("team.manage", "Управление сотрудниками", "Добавление, редактирование, удаление сотрудников"),
    ("textbooks.view", "Просмотр учебников", "Просмотр назначенных учебных материалов"),
    ("textbooks.edit", "Редактирование учебников", "Редактирование карточек учебника"),
    ("textbooks.manage_assignments", "Назначение учебников", "Назначение карточек на департаменты"),
    ("textbooks.manage_all", "Полный доступ к учебникам", "Полный доступ ко всем учебным материалам"),
    ("quizzes.manage_templates", "Управление шаблонами тестов", "Управление шаблонами тестов"),
    ("quizzes.take", "Прохождение тестов", "Прохождение тестов"),
    ("quizzes.view_stats", "Статистика тестов", "Просмотр статистики по тестам"),
]


def create_permissions(apps, schema_editor):
    OrgPermission = apps.get_model("core", "OrgPermission")
    OrgRole = apps.get_model("core", "OrgRole")

    for code, name, description in PERMISSIONS:
        OrgPermission.objects.get_or_create(
            code=code, defaults={"name": name, "description": description},
        )

    all_perms = list(OrgPermission.objects.all())
    for role in OrgRole.objects.filter(code__in=("developer", "owner"), is_system=True):
        role.permissions.set(all_perms)


def remove_permissions(apps, schema_editor):
    OrgPermission = apps.get_model("core", "OrgPermission")
    codes = [code for code, _, _ in PERMISSIONS]
    OrgPermission.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_auditlog"),
    ]

    operations = [
        migrations.RunPython(create_permissions, remove_permissions),
    ]
