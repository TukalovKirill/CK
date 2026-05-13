from django.db import migrations


PERMISSIONS = [
    ("org.view", "Видеть структуру компании", "Позволяет видеть список юнитов, департаментов, должностей и зон в компании."),
    ("org.manage", "Управлять структурой компании", "Позволяет создавать, редактировать и удалять юниты, департаменты и зоны."),
    ("org.roles_manage", "Управлять ролями и правами", "Позволяет создавать новые роли, настраивать их права доступа и иерархию подчинения."),
    ("team.view", "Видеть список сотрудников", "Позволяет видеть список всех сотрудников компании: их имена, должности и контактные данные."),
    ("team.manage", "Добавлять и редактировать сотрудников", "Позволяет добавлять новых сотрудников, редактировать их данные, отправлять приглашения и удалять из компании."),
    ("textbooks.view", "Просматривать учебники", "Позволяет читать учебные материалы, назначенные на подразделение сотрудника."),
    ("textbooks.edit", "Редактировать учебники", "Позволяет создавать и изменять карточки учебных материалов."),
    ("textbooks.manage_assignments", "Распределять учебники по подразделениям", "Позволяет назначать учебные карточки на конкретные департаменты и юниты."),
    ("textbooks.manage_all", "Полный доступ к учебникам", "Даёт полный контроль над всеми учебными материалами компании без ограничений."),
    ("quizzes.manage_templates", "Редактировать тесты", "Позволяет создавать, редактировать и удалять шаблоны тестов."),
    ("quizzes.take", "Проходить тесты", "Позволяет проходить назначенные тесты и видеть свои результаты."),
    ("quizzes.view_stats", "Видеть статистику тестирования", "Позволяет просматривать общую статистику по результатам тестов всех сотрудников."),
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
