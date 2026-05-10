from django.db import migrations


PERMISSIONS = [
    ("shop.view", "Магазин: просмотр и покупка"),
    ("shop.edit", "Магазин: управление товарами"),
    ("shop.manage_coins", "Магазин: начисление коинов"),
    ("shop.manage_orders", "Магазин: управление заказами"),
    ("shop.manage_all", "Магазин: полный доступ"),
]


def create_permissions(apps, schema_editor):
    OrgPermission = apps.get_model("core", "OrgPermission")
    for code, name in PERMISSIONS:
        OrgPermission.objects.get_or_create(code=code, defaults={"name": name})


def remove_permissions(apps, schema_editor):
    OrgPermission = apps.get_model("core", "OrgPermission")
    codes = [code for code, _ in PERMISSIONS]
    OrgPermission.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0001_initial"),
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_permissions, remove_permissions),
    ]
