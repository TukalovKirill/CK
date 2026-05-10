from django.apps import AppConfig


class ShopConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.shop"
    verbose_name = "Магазин СК Коин"

    def ready(self):
        import apps.shop.aml.signals  # noqa: F401
