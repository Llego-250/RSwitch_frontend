import secrets

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.core.permissions import require_admin, require_staff
from app.core.security import hash_api_key
from app.db import get_session
from app.models.admin import ApiKey
from app.models.user import User
from app.services import audit
from app.services.settings_store import all_settings, put_setting

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def read_settings(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    return all_settings(session)


@router.put("/{key}")
def write_setting(
    key: str,
    request: Request,
    value: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    if key == "risk_weights" and sum(float(v) for v in value.values()) != 100:
        raise HTTPException(status_code=422, detail="Risk weights must add up to 100")
    try:
        saved = put_setting(session, key, value)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown setting")
    audit.record(session, "SETTINGS_UPDATE", key, admin, request)
    return saved


def _key_out(k: ApiKey, owner: str = "") -> dict:
    return {
        "id": k.id,
        "name": k.name,
        "masked": f"{k.prefix}••••••••",
        "owner": owner,
        "created_at": k.created_at,
        "last_used_at": k.last_used_at,
        "is_active": k.is_active,
    }


@router.get("/api-keys")
def list_keys(session: Session = Depends(get_session), _: User = Depends(require_admin)):
    owners = {u.id: u.email for u in session.exec(select(User)).all()}
    return [_key_out(k, owners.get(k.user_id, "")) for k in session.exec(select(ApiKey).order_by(ApiKey.created_at)).all()]


@router.post("/api-keys")
def create_key(
    request: Request,
    name: str = Body(..., embed=True),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """The key authenticates as its creator via the X-API-Key header. The
    plaintext is returned only here."""
    if not name.strip():
        raise HTTPException(status_code=422, detail="Name the key")
    plaintext = "rdip_" + secrets.token_urlsafe(32)
    key = ApiKey(name=name.strip(), prefix=plaintext[:10], key_hash=hash_api_key(plaintext), user_id=admin.id)
    session.add(key)
    session.commit()
    session.refresh(key)
    audit.record(session, "API_KEY_CREATE", key.name, admin, request)
    return {**_key_out(key, admin.email), "key": plaintext}


@router.delete("/api-keys/{key_id}")
def revoke_key(key_id: int, request: Request, session: Session = Depends(get_session), admin: User = Depends(require_admin)):
    key = session.get(ApiKey, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    key.is_active = False
    session.add(key)
    session.commit()
    audit.record(session, "API_KEY_REVOKE", key.name, admin, request, status="WARNING")
    return _key_out(key)
