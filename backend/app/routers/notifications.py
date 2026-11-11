"""In-app notifications (SRS §5.12): the bell (REQ-NOTIF-001), 90-day
history (REQ-NOTIF-004) and read state (REQ-NOTIF-005). Notifications are
created by services.notify.dispatch; nothing here generates them, so the
bell's polling stays a cheap read."""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.permissions import require_cap
from app.db import get_session
from app.models.admin import Notification
from app.models.user import User
from app.services import notify

router = APIRouter(prefix="/notifications", tags=["Notifications"])

HISTORY_DAYS = 90
require_view = require_cap("notifications.view")


def _out(n: Notification) -> dict:
    spec = notify.EVENTS.get(n.event)
    return {
        "id": n.id,
        "event": n.event,
        "event_label": spec.label if spec else "",
        "title": n.title,
        "message": n.message,
        "severity": n.severity,
        "link": n.link,
        "created_at": n.created_at,
        "read": n.read,
        "dismissed": n.dismissed,
    }


def _mine(session: Session, user: User, notification_id: int) -> Notification:
    n = session.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return n


@router.get("")
def bell(session: Session = Depends(get_session), user: User = Depends(require_view)):
    """The bell: the latest notices not cleared from it, within 90 days."""
    since = datetime.utcnow() - timedelta(days=HISTORY_DAYS)
    rows = session.exec(
        select(Notification)
        .where(Notification.user_id == user.id, Notification.dismissed == False, Notification.created_at >= since)  # noqa: E712
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(100)
    ).all()
    return [_out(n) for n in rows]


@router.get("/history")
def history(
    status: str = Query("all", pattern="^(all|read|unread)$"),
    severity: Optional[str] = Query(None, pattern="^(alert|warning|info)$"),
    event: Optional[str] = None,
    q: Optional[str] = None,
    days: int = Query(HISTORY_DAYS, ge=1, le=HISTORY_DAYS),
    limit: int = Query(500, ge=1, le=1000),
    session: Session = Depends(get_session),
    user: User = Depends(require_view),
):
    """REQ-NOTIF-004: everything from the last 90 days, read or unread,
    including notices already cleared from the bell."""
    since = datetime.utcnow() - timedelta(days=days)
    query = select(Notification).where(Notification.user_id == user.id, Notification.created_at >= since)
    if status != "all":
        query = query.where(Notification.read == (status == "read"))
    if severity:
        query = query.where(Notification.severity == severity)
    if event:
        query = query.where(Notification.event == event)
    if q:
        like = f"%{q}%"
        query = query.where(Notification.title.ilike(like) | Notification.message.ilike(like))
    rows = session.exec(query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)).all()
    return [_out(n) for n in rows]


@router.get("/unread-count")
def unread_count(session: Session = Depends(get_session), user: User = Depends(require_view)):
    since = datetime.utcnow() - timedelta(days=HISTORY_DAYS)
    count = session.exec(
        select(func.count()).select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read == False, Notification.created_at >= since)  # noqa: E712
    ).one()
    return {"unread": int(count)}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, session: Session = Depends(get_session), user: User = Depends(require_view)):
    n = _mine(session, user, notification_id)
    if not n.read:
        n.read = True
        session.add(n)
        session.commit()
        session.refresh(n)
    return _out(n)


@router.post("/{notification_id}/unread")
def mark_unread(notification_id: int, session: Session = Depends(get_session), user: User = Depends(require_view)):
    n = _mine(session, user, notification_id)
    if n.read:
        n.read = False
        session.add(n)
        session.commit()
        session.refresh(n)
    return _out(n)


@router.post("/read-all")
def read_all(session: Session = Depends(get_session), user: User = Depends(require_view)):
    rows = session.exec(select(Notification).where(Notification.user_id == user.id, Notification.read == False)).all()  # noqa: E712
    for n in rows:
        n.read = True
        session.add(n)
    session.commit()
    return {"ok": True, "updated": len(rows)}


@router.delete("/read")
def clear_read(session: Session = Depends(get_session), user: User = Depends(require_view)):
    """Clears read notices from the bell. They stay in the history (and
    keep their dedupe keys, so they don't reappear)."""
    rows = session.exec(select(Notification).where(Notification.user_id == user.id, Notification.read == True,  # noqa: E712
                                                   Notification.dismissed == False)).all()  # noqa: E712
    for n in rows:
        n.dismissed = True
        session.add(n)
    session.commit()
    return {"ok": True, "updated": len(rows)}
