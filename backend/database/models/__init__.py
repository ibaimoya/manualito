"""Registry de modelos ORM usado por Alembic autogenerate."""

from importlib import import_module

MODEL_MODULES: tuple[str, ...] = (
    "user",
    "asset",
    "auth",
    "audit",
)


def import_all_models() -> None:
    """Importa todos los modelos para completar Base.metadata."""
    for module_name in MODEL_MODULES:
        import_module(f"{__name__}.{module_name}")
