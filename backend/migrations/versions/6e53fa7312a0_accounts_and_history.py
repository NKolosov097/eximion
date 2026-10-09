"""accounts, ownership and learner notes"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "6e53fa7312a0"
down_revision = "4975e664eeb0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users", sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("username", sa.String(32), nullable=False, unique=True), sa.Column("password_hash", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("user_sessions", sa.Column("token_hash", sa.String(64), primary_key=True), sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])
    op.create_table("auth_throttles", sa.Column("key", sa.String(64), primary_key=True), sa.Column("count", sa.Integer(), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_auth_throttles_expires_at", "auth_throttles", ["expires_at"])
    op.add_column("clinical_cases", sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True))
    op.create_index("ix_clinical_cases_owner_id", "clinical_cases", ["owner_id"])
    op.add_column("clinical_cases", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("clinical_case_attempts", sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True))
    op.create_index("ix_clinical_case_attempts_user_id", "clinical_case_attempts", ["user_id"])
    op.add_column("clinical_case_attempts", sa.Column("alternative_diagnoses", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("clinical_case_attempts", sa.Column("reasoning", sa.Text(), nullable=False, server_default=""))


def downgrade():
    for name in ("reasoning", "alternative_diagnoses", "user_id"):
        op.drop_column("clinical_case_attempts", name)
    op.drop_column("clinical_cases", "archived_at")
    op.drop_column("clinical_cases", "owner_id")
    op.drop_table("auth_throttles")
    op.drop_table("user_sessions")
    op.drop_table("users")
