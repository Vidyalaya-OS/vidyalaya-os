from django.apps import AppConfig
from django.db.models.signals import post_migrate


class CoreConfig(AppConfig):
    """Things every part of the app shares: the public app settings the web
    app reads (catalog.py) and the demo data (demo.py)."""

    name = "apps.core"

    def ready(self):
        from .demo import autoload

        post_migrate.connect(autoload, sender=self)
