"""Hooks the ingestion path calls so the Compliance Register stays in step
with the submissions that satisfy it (SRS §6.1, §6.4)."""

from sqlmodel import Session

from app.models.submission import Submission


def on_submission_ingested(session: Session, submission: Submission) -> None:
    """Called after a file is validated (passed or failed) and stored."""
    pass
