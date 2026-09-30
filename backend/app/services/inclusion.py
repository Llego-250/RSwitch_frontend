"""Financial-inclusion analytics derived from accepted submissions: who
carries the volume (institution type) and through which channels. There is
no customer-level or demographic data in RDIP, so nothing here claims to be
demographic."""

from datetime import datetime

from sqlmodel import Session, select

from app.models.enums import SubmissionResult
from app.models.participant import Participant
from app.models.submission import Submission

# Institution types that primarily serve under-banked segments.
INCLUSION_TYPES = {"Microfinance", "SACCO", "Mobile money"}
DIGITAL_CHANNELS = {"Mobile", "Web"}


def _passed(session: Session, date_from=None, date_to=None) -> list[Submission]:
    query = select(Submission).where(Submission.result == SubmissionResult.passed)
    if date_from:
        query = query.where(Submission.uploaded_at >= date_from)
    if date_to:
        query = query.where(Submission.uploaded_at <= date_to)
    return session.exec(query).all()


def by_institution_type(session: Session, date_from=None, date_to=None) -> list[dict]:
    participants = {p.id: p for p in session.exec(select(Participant)).all()}
    rows: dict[str, dict] = {}
    for p in participants.values():
        rows.setdefault(p.type or "Other", {"institution_type": p.type or "Other", "participants": 0, "transactions": 0, "volume": 0.0})
        rows[p.type or "Other"]["participants"] += 1
    for s in _passed(session, date_from, date_to):
        p = participants.get(s.participant_id)
        key = (p.type if p else None) or "Other"
        rows[key]["transactions"] += s.row_count
        rows[key]["volume"] += s.numeric_totals.get("amount", 0)
    total = sum(r["volume"] for r in rows.values()) or 1
    for r in rows.values():
        r["volume"] = round(r["volume"], 2)
        r["volume_share_pct"] = round(r["volume"] / total * 100, 1)
    return sorted(rows.values(), key=lambda r: r["volume"], reverse=True)


def summary(session: Session, months: int = 6) -> dict:
    participants = {p.id: p for p in session.exec(select(Participant)).all()}
    subs = _passed(session)
    channels: dict[str, dict[str, float]] = {}
    monthly: dict[str, dict[str, float]] = {}
    for s in subs:
        for value, b in (s.breakdowns or {}).get("channel", {}).items():
            c = channels.setdefault(value, {"channel": value, "transactions": 0, "volume": 0.0})
            c["transactions"] += b["count"]
            c["volume"] += b["amount"]
        p = participants.get(s.participant_id)
        m = monthly.setdefault(s.uploaded_at.strftime("%Y-%m"), {"month": s.uploaded_at.strftime("%Y-%m"), "total": 0.0, "inclusion": 0.0, "digital": 0.0, "tx": 0})
        amount = s.numeric_totals.get("amount", 0)
        m["total"] += amount
        m["tx"] += s.row_count
        if p and p.type in INCLUSION_TYPES:
            m["inclusion"] += amount
        for value, b in (s.breakdowns or {}).get("channel", {}).items():
            if value in DIGITAL_CHANNELS:
                m["digital"] += b["amount"]

    trend = [
        {
            "month": m["month"],
            "inclusion_share_pct": round(m["inclusion"] / m["total"] * 100, 1) if m["total"] else None,
            "digital_share_pct": round(m["digital"] / m["total"] * 100, 1) if m["total"] else None,
            "transactions": m["tx"],
        }
        for m in sorted(monthly.values(), key=lambda x: x["month"])
    ][-months:]

    total_volume = sum(s.numeric_totals.get("amount", 0) for s in subs) or 0
    ch_total = sum(c["volume"] for c in channels.values()) or 1
    channel_rows = sorted(
        ({**c, "volume": round(c["volume"], 2), "share_pct": round(c["volume"] / ch_total * 100, 1)} for c in channels.values()),
        key=lambda c: c["volume"],
        reverse=True,
    )
    types = by_institution_type(session)
    inclusion_volume = sum(r["volume"] for r in types if r["institution_type"] in INCLUSION_TYPES)
    small_tx = [s.numeric_totals.get("amount", 0) / s.row_count for s in subs if s.row_count]
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "total_transactions": sum(s.row_count for s in subs),
        "total_volume": round(total_volume, 2),
        "inclusion_institutions": sum(1 for p in participants.values() if p.type in INCLUSION_TYPES),
        "inclusion_volume_share_pct": round(inclusion_volume / total_volume * 100, 1) if total_volume else None,
        "digital_share_pct": round(sum(c["volume"] for c in channel_rows if c["channel"] in DIGITAL_CHANNELS) / ch_total * 100, 1) if channel_rows else None,
        "avg_transaction_value": round(sum(small_tx) / len(small_tx), 2) if small_tx else None,
        "by_institution_type": types,
        "by_channel": channel_rows,
        "trend": trend,
    }
