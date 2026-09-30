from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.security import get_current_user
from app.db import get_session
from app.models.admin import Notification
from app.models.user import User
from app.services import notifications

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[Notification])
def my_notifications(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    notifications.generate(session)
    return session.exec(
        select(Notification)
        .where(Notification.user_id == user.id, Notification.dismissed == False)  # noqa: E712
        .order_by(Notification.created_at.desc()).limit(100)
    ).all()


@router.post("/{notification_id}/read", response_model=Notification)
def toggle_read(notification_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    n = session.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.read = not n.read
    session.add(n)
    session.commit()
    session.refresh(n)
    return n


@router.post("/read-all")
def read_all(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    for n in session.exec(select(Notification).where(Notification.user_id == user.id, Notification.read == False)).all():  # noqa: E712
        n.read = True
        session.add(n)
    session.commit()
    return {"ok": True}


@router.delete("/read")
def clear_read(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Read notifications are hidden, not deleted, so the generator's dedupe
    keys survive and they don't reappear."""
    for n in session.exec(select(Notification).where(Notification.user_id == user.id, Notification.read == True)).all():  # noqa: E712
        n.dismissed = True
        session.add(n)
    session.commit()
    return {"ok": True}
