"""Scheduled compliance checks (reminders, overdue/escalation). run() is called on
every scheduler tick and must be idempotent (dedupe keys)."""

from sqlmodel import Session


def run(session: Session) -> None:
    pass
