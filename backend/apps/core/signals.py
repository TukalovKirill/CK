from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Company, OrgPermission, OrgRole


@receiver(post_save, sender=Company)
def create_system_roles(sender, instance, created, **kwargs):
    if not created:
        return

    all_perms = list(OrgPermission.objects.all())

    developer_role = OrgRole.objects.create(
        company=instance,
        code="developer",
        title="Разработчик",
        is_system=True,
        is_assignable=False,
        is_admin_role=True,
        level=0,
    )
    developer_role.permissions.set(all_perms)

    owner_role = OrgRole.objects.create(
        company=instance,
        code="owner",
        title="Владелец",
        parent_role=developer_role,
        is_system=True,
        is_assignable=False,
        is_admin_role=True,
        level=1,
    )
    owner_role.permissions.set(all_perms)
