"""Hooks the ingestion path calls so the Compliance Register stays in step
with the submissions that satisfy it (SRS §6.1, §6.4, §6.5 step 3)."""

from sqlmodel import Session

from app.models.submission import Submission


def on_submission_ingested(session: Session, submission: Submission) -> None:
    """Called after a file is validated (passed or failed) and stored — a
    manual upload, a corrected re-upload, a reprocessed file or an automated
    pull. A submission linked to a requirement joins that requirement's
    cycle, which moves to Submitted or Validation Failed (see
    app.services.compliance for the full lifecycle)."""
    from app.services.compliance import link_submission

    link_submission(session, submission)
