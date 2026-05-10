from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.core.models import Company

from .models import DEFAULT_RULES, AMLRule, AMLSettings


@receiver(post_save, sender=Company)
def create_default_aml_config(sender, instance, created, **kwargs):
    if not created:
        return
    AMLSettings.objects.get_or_create(company=instance)
    for rule_def in DEFAULT_RULES:
        AMLRule.objects.get_or_create(
            company=instance,
            rule_code=rule_def["code"],
            defaults={
                "category": rule_def["category"],
                "name": rule_def["name"],
                "description": rule_def["description"],
                "weight": rule_def["weight"],
                "params": rule_def["params"],
            },
        )
