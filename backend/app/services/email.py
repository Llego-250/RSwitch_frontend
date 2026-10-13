"""Outbound email (SRS §16: RDIP sends, never ingests). Every message is
written to EmailOutbox first; it then goes out over SMTP when smtp_host is
configured, otherwise it stays as "Logged" so development and demos work
without a mail server."""

import logging
import smtplib
from email.message import EmailMessage
from typing import Optional

from sqlmodel import Session, select

from app.config import settings
from app.db import engine
from app.models.admin import EmailOutbox

log = logging.getLogger("rdip.email")


def already_sent(to: str, dedupe_key: str) -> bool:
    if not dedupe_key:
        return False
    with Session(engine) as session:
        return session.exec(
            select(EmailOutbox.id).where(EmailOutbox.to_address == to, EmailOutbox.dedupe_key == dedupe_key)
        ).first() is not None


def send(
    to: str,
    subject: str,
    body: str,
    *,
    event: str = "",
    dedupe_key: str = "",
    attachments: Optional[list[tuple[str, bytes, str]]] = None,
) -> Optional[EmailOutbox]:
    """Send one email. attachments: (filename, content, mime type). Returns
    None when this (recipient, dedupe_key) pair was already sent."""
    if not to or already_sent(to, dedupe_key):
        return None
    attachments = attachments or []
    row = EmailOutbox(
        to_address=to,
        subject=subject,
        body=body,
        event=event,
        dedupe_key=dedupe_key,
        attachments=[name for name, _, _ in attachments],
    )
    if settings.smtp_host:
        try:
            _deliver(to, subject, body, attachments)
            row.status = "Sent"
        except (OSError, smtplib.SMTPException) as exc:
            row.status = "Failed"
            row.error = str(exc)[:500]
            log.warning("Email to %s failed: %s", to, exc)
    else:
        log.info("Email logged (no SMTP configured) to=%s subject=%s", to, subject)
    with Session(engine) as session:
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


def _deliver(to: str, subject: str, body: str, attachments: list[tuple[str, bytes, str]]) -> None:
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    for filename, content, mime in attachments:
        maintype, _, subtype = (mime or "application/octet-stream").partition("/")
        message.add_attachment(content, maintype=maintype, subtype=subtype or "octet-stream", filename=filename)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
