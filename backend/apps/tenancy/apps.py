from django.apps import AppConfig
from django.db.models.signals import post_migrate


class TenancyConfig(AppConfig):
    name = "apps.tenancy"
    verbose_name = "Schools"

    def ready(self):
        from .rls import apply_rls

        post_migrate.connect(apply_rls, dispatch_uid="tenancy.apply_rls")
