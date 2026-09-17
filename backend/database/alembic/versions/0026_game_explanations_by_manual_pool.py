"""Comparte las explicaciones que proceden del mismo conjunto de manuales."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = "game_explanations"


def upgrade() -> None:
    op.execute(
        sa.text("""
        DELETE FROM game_explanations
        WHERE status <> 'ready'
           OR NOT (sections ?& ARRAY['summary', 'setup', 'turns', 'victory'])
    """)
    )
    op.execute(
        sa.text("""
        DELETE FROM game_explanations
        WHERE id IN (
            SELECT id FROM (
                SELECT id, row_number() OVER (
                    PARTITION BY game_id, source_fingerprint
                    ORDER BY generated_at DESC, updated_at DESC, id DESC
                ) AS position
                FROM game_explanations
            ) AS duplicates
            WHERE position > 1
        )
    """)
    )
    op.drop_index("uq_game_explanations_user_game", table_name=TABLE)
    op.drop_constraint(op.f("fk_game_explanations_user_id_users"), TABLE, type_="foreignkey")
    op.drop_column(TABLE, "user_id")
    op.create_index(
        "uq_game_explanations_game_pool", TABLE, ["game_id", "source_fingerprint"], unique=True
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM game_explanations"))
    op.drop_index("uq_game_explanations_game_pool", table_name=TABLE)
    op.add_column(TABLE, sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False))
    op.create_foreign_key(
        op.f("fk_game_explanations_user_id_users"),
        TABLE,
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("uq_game_explanations_user_game", TABLE, ["user_id", "game_id"], unique=True)
