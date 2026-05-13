from django.core.management.base import BaseCommand

from apps.core.models import OrgPermission, OrgRole


PERMISSIONS = [
    # --- org ---
    ("org.view", "Просмотр структуры", "Просмотр юнитов, департаментов, ролей, зон"),
    ("org.manage", "Управление структурой", "CRUD юнитов, департаментов, зон"),
    ("org.roles_manage", "Управление ролями", "Создание и настройка ролей"),
    # --- team ---
    ("team.view", "Просмотр сотрудников", "Просмотр списка сотрудников"),
    ("team.manage", "Управление сотрудниками", "Добавление, редактирование, удаление сотрудников"),
    # --- textbooks ---
    ("textbooks.view", "Просмотр учебников", "Просмотр назначенных учебных материалов"),
    ("textbooks.edit", "Редактирование учебников", "Редактирование карточек учебника"),
    ("textbooks.manage_assignments", "Назначение учебников", "Назначение карточек на департаменты"),
    ("textbooks.manage_all", "Полный доступ к учебникам", "Полный доступ ко всем учебным материалам"),
    # --- quizzes ---
    ("quizzes.manage_templates", "Управление шаблонами тестов", "Управление шаблонами тестов"),
    ("quizzes.take", "Прохождение тестов", "Прохождение тестов"),
    ("quizzes.view_stats", "Статистика тестов", "Просмотр статистики по тестам"),
    # --- shop ---
    ("shop.view", "Просмотр магазина", "Просмотр магазина и покупка товаров"),
    ("shop.edit", "Управление товарами", "Управление ассортиментом магазина"),
    ("shop.manage_coins", "Начисление монет", "Начисление монет сотрудникам"),
    ("shop.manage_orders", "Управление заказами", "Обработка и управление заказами"),
    ("shop.manage_all", "Полный доступ к магазину", "Полный доступ ко всем функциям магазина"),
    # --- shop / AML ---
    ("shop.review_flagged", "Проверка подозрительных операций", "Проверка подозрительных операций (AML)"),
    ("shop.aml_settings", "Настройки AML", "Настройка правил AML"),
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
