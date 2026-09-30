"""Advisory anomaly detection and participant risk scoring.

Everything here is derived from real rows (submissions, integrations,
documents, issues) against thresholds admins configure in settings — no
model weights, no fabricated numbers. Detection is idempotent: each alert
has a dedupe key (participant + indicator + period), so re-running it only
adds alerts for new signals."""

from datetime import datetime
from statistics import mean

from dateutil.relativedelta import relativedelta

from sqlmodel import Session, select

from app.models.alert import AnomalyAlert
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.enums import IntegrationStatus, IssueSeverity, IssueStatus, SubmissionResult
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.submission import Submission
from app.services.compliance import document_status
from app.services.settings_store import get_setting

BASELINE_MONTHS = 6


def _severity(deviation_pct: float) -> str:
    d = abs(deviation_pct)
    if d >= 200:
        return "CRITICAL"
    if d >= 100:
        return "HIGH"
    if d >= 50:
        return "MEDIUM"
    return "LOW"


def _month(dt: datetime) -> str:
    return dt.strftime("%Y-%m")


def detect(session: Session) -> int:
    cfg = get_setting(session, "anomaly")
    volume_threshold = float(cfg["volume_deviation_pct"])
    error_threshold = float(cfg["error_rate_pct"])
    existing = set(session.exec(select(AnomalyAlert.dedupe_key)).all())
    created = 0

    def add(participant: Participant, key: str, **fields) -> None:
        nonlocal created
        if key in existing:
            return
        existing.add(key)
        session.add(AnomalyAlert(participant_id=participant.id, dedupe_key=key, **fields))
        created += 1

    for participant in session.exec(select(Participant)).all():
        subs = session.exec(
            select(Submission).where(Submission.participant_id == participant.id).order_by(Submission.uploaded_at)
        ).all()
        if not subs:
            continue

        # 1. Volume deviation: latest passed month vs mean of previous months.
        volume_by_month: dict[str, float] = {}
        for s in subs:
            if s.result == SubmissionResult.passed:
                volume_by_month[_month(s.uploaded_at)] = volume_by_month.get(_month(s.uploaded_at), 0) + s.numeric_totals.get("amount", 0)
        months = sorted(volume_by_month)
        if len(months) >= 3:
            latest = months[-1]
            baseline = mean(volume_by_month[m] for m in months[-1 - BASELINE_MONTHS : -1])
            if baseline > 0:
                dev = (volume_by_month[latest] - baseline) / baseline * 100
                if abs(dev) >= volume_threshold:
                    add(
                        participant,
                        f"volume:{participant.id}:{latest}",
                        indicator=f"Reported volume {'spike' if dev > 0 else 'drop'} ({latest})",
                        baseline_value=f"{baseline:,.0f}",
                        observed_value=f"{volume_by_month[latest]:,.0f}",
                        deviation=f"{dev:+.0f}%",
                        recommended_area="Confirm the period's transaction extract is complete and not duplicated",
                        severity=_severity(dev),
                        baseline_method=f"Rolling {min(BASELINE_MONTHS, len(months) - 1)}-month mean",
                    )

        # 2. Submission failure rate over the baseline window.
        window_start = datetime.utcnow() - relativedelta(months=BASELINE_MONTHS)
        window = [s for s in subs if s.uploaded_at >= window_start]
        if len(window) >= 2:
            failed = sum(1 for s in window if s.result == SubmissionResult.failed)
            rate = failed / len(window) * 100
            if rate >= error_threshold and failed:
                last_failed = max(s.uploaded_at for s in window if s.result == SubmissionResult.failed)
                add(
                    participant,
                    f"errors:{participant.id}:{_month(last_failed)}",
                    indicator="Elevated submission validation failure rate",
                    baseline_value=f"≤{error_threshold:.0f}%",
                    observed_value=f"{rate:.0f}% ({failed}/{len(window)})",
                    deviation=f"+{rate - error_threshold:.0f}pp",
                    recommended_area="Participant's file export: review the validation errors on failed submissions",
                    severity="HIGH" if rate >= 2 * error_threshold else "MEDIUM",
                    baseline_method=f"Configured threshold over last {BASELINE_MONTHS} months",
                )

        # 3. Overdue reporting against the expected cadence.
        last = max(s.uploaded_at for s in subs)
        age = (datetime.utcnow() - last).days
        if age > participant.expected_frequency_days * 2:
            add(
                participant,
                f"overdue:{participant.id}:{_month(last)}",
                indicator="Submission overdue against expected cadence",
                baseline_value=f"every {participant.expected_frequency_days}d",
                observed_value=f"{age}d since last file",
                deviation=f"+{age - participant.expected_frequency_days}d",
                recommended_area="Contact participant operations; check integration status",
                severity="HIGH" if age > participant.expected_frequency_days * 4 else "MEDIUM",
                baseline_method="Participant expected reporting frequency",
            )

    session.commit()
    return created


def auto_escalate(session: Session) -> int:
    days = int(get_setting(session, "anomaly")["auto_escalate_days"])
    count = 0
    for alert in session.exec(select(AnomalyAlert).where(AnomalyAlert.status == "Acknowledged")).all():
        if (datetime.utcnow() - alert.status_changed_at).days >= days:
            alert.status = "Escalated"
            alert.status_changed_at = datetime.utcnow()
            alert.notes = [
                *alert.notes,
                {"date": datetime.utcnow().isoformat(), "user": "System", "text": f"Auto-escalated after {days} days at Acknowledged."},
            ]
            session.add(alert)
            count += 1
    session.commit()
    return count


def risk_scores(session: Session) -> list[dict]:
    """0–100 per participant (higher = riskier), weighted per settings."""
    weights = get_setting(session, "risk_weights")
    total_weight = sum(weights.values()) or 1
    doc_types = session.exec(select(RequiredDocumentType)).all()
    integrations = {i.participant_id: i for i in session.exec(select(Integration)).all()}
    docs = session.exec(select(ComplianceDocument)).all()
    issues = session.exec(select(Issue)).all()
    subs = session.exec(select(Submission)).all()

    integration_risk = {
        IntegrationStatus.connected: 0,
        IntegrationStatus.maintenance: 25,
        IntegrationStatus.degraded: 60,
        IntegrationStatus.disconnected: 100,
    }
    severity_points = {IssueSeverity.critical: 50, IssueSeverity.high: 30, IssueSeverity.medium: 15, IssueSeverity.low: 5}

    rows = []
    for p in session.exec(select(Participant)).all():
        integ = integrations.get(p.id)
        c_integration = integration_risk.get(integ.status, 0) if integ else 100

        my_docs = {d.doc_type_id: d for d in docs if d.participant_id == p.id}
        bad = 0.0
        for t in doc_types:
            d = my_docs.get(t.id)
            st = "Missing" if d is None else document_status(d).value
            bad += {"Missing": 1, "Expired": 1, "Expiring Soon": 0.4}.get(st, 0)
        c_compliance = bad / len(doc_types) * 100 if doc_types else 0

        open_issues = [i for i in issues if i.participant_id == p.id and i.status in (IssueStatus.open, IssueStatus.in_progress)]
        c_incidents = min(100, sum(severity_points[i.severity] for i in open_issues))

        my_subs = [s for s in subs if s.participant_id == p.id]
        if my_subs:
            age = (datetime.utcnow() - max(s.uploaded_at for s in my_subs)).days
            c_overdue = max(0.0, min(100.0, (age - p.expected_frequency_days) / p.expected_frequency_days * 100))
        else:
            c_overdue = 100.0

        score = (
            c_integration * weights["integration"]
            + c_compliance * weights["compliance"]
            + c_incidents * weights["incidents"]
            + c_overdue * weights["overdue"]
        ) / total_weight
        components = {"integration": c_integration, "compliance": c_compliance, "incidents": c_incidents, "overdue": c_overdue}
        top = max(components, key=components.get)
        rows.append(
            {
                "participant_id": p.id,
                "participant_name": p.name,
                "participant_type": p.type,
                "score": round(score, 1),
                "components": {k: round(v, 1) for k, v in components.items()},
                "top_factor": top if components[top] > 0 else None,
                "history_months": round((datetime.utcnow() - p.created_at).days / 30, 1),
            }
        )
    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows
