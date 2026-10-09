"""preserve answered case versions across owner edits"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "94f23c105be1"
down_revision = "6e53fa7312a0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("clinical_cases", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("clinical_case_attempts", sa.Column("case_snapshot", postgresql.JSONB(), nullable=True))
    op.execute("""
        UPDATE clinical_case_attempts AS attempt SET case_snapshot = jsonb_build_object(
            'revision', c.revision, 'title', c.title, 'vignette', c.vignette,
            'age_years', c.age_years,
            'symptoms', COALESCE((SELECT jsonb_agg(s.text ORDER BY s.position) FROM clinical_case_symptoms s WHERE s.clinical_case_id = c.id), '[]'::jsonb),
            'accepted_diagnoses', jsonb_build_array(c.reference_diagnosis) || COALESCE((SELECT jsonb_agg(a.answer ORDER BY a.id) FROM clinical_case_accepted_answers a WHERE a.clinical_case_id = c.id), '[]'::jsonb)
        ) FROM clinical_cases c WHERE c.id = attempt.clinical_case_id
    """)


def downgrade():
    op.drop_column("clinical_case_attempts", "case_snapshot")
    op.drop_column("clinical_cases", "revision")
