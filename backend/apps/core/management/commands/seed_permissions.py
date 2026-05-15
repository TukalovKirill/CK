from django.core.management.base import BaseCommand

from apps.core.models import OrgPermission, OrgRole


PERMISSIONS = [
    # --- Структура компании ---
    (
        "org.view",
        "Видеть структуру компании",
        "Позволяет видеть список юнитов, департаментов, должностей и зон в компании.",
    ),
    (
        "org.manage",
        "Управлять структурой компании",
        "Позволяет создавать, редактировать и удалять юниты, департаменты и зоны.",
    ),
    (
        "org.roles_manage",
        "Управлять ролями и правами",
        "Позволяет создавать новые роли, настраивать их права доступа и иерархию подчинения.",
    ),
    # --- Команда ---
    (
        "team.view",
        "Видеть список сотрудников",
        "Позволяет видеть список всех сотрудников компании: их имена, должности и контактные данные.",
    ),
    (
        "team.manage",
        "Добавлять и редактировать сотрудников",
        "Позволяет добавлять новых сотрудников, редактировать их данные, отправлять приглашения и удалять из компании.",
    ),
    # --- Учебники ---
    (
        "textbooks.view",
        "Просматривать учебники",
        "Позволяет читать учебные материалы, назначенные на подразделение сотрудника.",
    ),
    (
        "textbooks.edit",
        "Редактировать учебники",
        "Позволяет создавать и изменять карточки учебных материалов.",
    ),
    (
        "textbooks.manage_assignments",
        "Распределять учебники по подразделениям",
        "Позволяет назначать учебные карточки на конкретные департаменты и юниты.",
    ),
    (
        "textbooks.manage_all",
        "Полный доступ к учебникам",
        "Даёт полный контроль над всеми учебными материалами компании без ограничений.",
    ),
    # --- Тестирование ---
    (
        "quizzes.manage_templates",
        "Редактировать тесты",
        "Позволяет создавать, редактировать и удалять шаблоны тестов.",
    ),
    (
        "quizzes.take",
        "Проходить тесты",
        "Позволяет проходить назначенные тесты и видеть свои результаты.",
    ),
    (
        "quizzes.view_stats",
        "Видеть статистику тестирования",
        "Позволяет просматривать общую статистику по результатам тестов всех сотрудников.",
    ),
    # --- Магазин ---
    (
        "shop.view",
        "Просматривать магазин и покупать",
        "Позволяет видеть каталог товаров и совершать покупки за монеты.",
    ),
    (
        "shop.edit",
        "Управлять ассортиментом",
        "Позволяет добавлять, редактировать и удалять товары в магазине.",
    ),
    (
        "shop.manage_coins",
        "Начислять монеты сотрудникам",
        "Позволяет вручную начислять и списывать монеты с балансов сотрудников.",
    ),
    (
        "shop.manage_orders",
        "Обрабатывать заказы",
        "Позволяет просматривать, подтверждать и отклонять заказы сотрудников.",
    ),
    (
        "shop.manage_all",
        "Полный доступ к магазину",
        "Даёт полный контроль над магазином: товары, монеты, заказы — без ограничений.",
    ),
    (
        "shop.review_flagged",
        "Проверять подозрительные операции",
        "Позволяет просматривать и проверять операции, помеченные системой как подозрительные.",
    ),
    (
        "shop.aml_settings",
        "Настраивать правила безопасности",
        "Позволяет изменять пороговые значения и правила автоматического выявления подозрительных операций.",
    ),
    # --- Обратная связь ---
    (
        "feedback.submit_wish",
        "Оставлять пожелания",
        "Позволяет сотруднику анонимно отправлять пожелания через ящик пожеланий.",
    ),
    (
        "feedback.view_wishes",
        "Видеть пожелания сотрудников",
        "Позволяет просматривать пожелания сотрудников своих юнитов и отвечать на них.",
    ),
    (
        "feedback.view_all",
        "Видеть все пожелания компании",
        "Позволяет просматривать пожелания сотрудников всех юнитов компании.",
    ),
    (
        "feedback.edit",
        "Управлять пожеланиями",
        "Позволяет удалять пожелания сотрудников.",
    ),
]


class Command(BaseCommand):
    help = "Создаёт/обновляет коды пермишенов и обновляет системные роли"

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0
        valid_codes = set()

        for code, name, description in PERMISSIONS:
            valid_codes.add(code)
            obj, created = OrgPermission.objects.get_or_create(
                code=code,
                defaults={"name": name, "description": description},
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"  + {code}"))
            else:
                changed = False
                if obj.name != name:
                    obj.name = name
                    changed = True
                if obj.description != description:
                    obj.description = description
                    changed = True
                if changed:
                    obj.save(update_fields=["name", "description"])
                    updated_count += 1
                    self.stdout.write(self.style.WARNING(f"  ~ {code}"))

        stale = OrgPermission.objects.exclude(code__in=valid_codes)
        stale_count = stale.count()
        if stale_count:
            stale_codes = list(stale.values_list("code", flat=True))
            stale.delete()
            for sc in stale_codes:
                self.stdout.write(self.style.ERROR(f"  - {sc}"))

        all_perms = list(OrgPermission.objects.all())
        system_roles = OrgRole.objects.filter(
            code__in=("developer", "owner"), is_system=True,
        )
        for role in system_roles:
            role.permissions.set(all_perms)

        self.stdout.write(
            self.style.SUCCESS(
                f"\nГотово: создано {created_count}, обновлено {updated_count}, "
                f"удалено устаревших {stale_count}. "
                f"Системные роли обновлены ({system_roles.count()} шт.)."
            )
        )
