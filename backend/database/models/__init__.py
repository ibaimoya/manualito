"""ORM model import registry used by Alembic autogenerate."""

from importlib import import_module

MODEL_MODULES: tuple[str, ...] = ()


def import_all_models() -> None:
    """Import every ORM model module so Base.metadata is complete."""
    for module_name in MODEL_MODULES:
        import_module(f"{__name__}.{module_name}")
