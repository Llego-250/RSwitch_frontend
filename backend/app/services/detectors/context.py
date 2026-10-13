"""What every detector receives: each participant's monthly submission
statistics, the baseline method resolved for it (REQ-AI-011 fallbacks), its
same-type peers and the configured thresholds. Built once per scan from real
Submission rows — aggregate metadata only, never file contents."""

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from dateutil.relativedelta import relativedelta
from sqlmodel import Session, select

from app.models.enums import SubmissionResult
from app.models.participant import Participant
from app.models.submission import Submission
from app.services.detectors import METHODS, method_label

# REQ-AI-011(b): a rolling baseline needs at least six months of history.
ROLLING_MIN_MONTHS = 6
# Window for rate indicators (failure rate) and for peer comparison.
RECENT_MONTHS = 3
DAYS_PER_MONTH = 30.44


def month_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m")


def months_ending(key: str, count: int) -> list[str]:
    """`count` calendar month keys ending at (and including) `key`."""
    end = datetime.strptime(key, "%Y-%m")
    return [month_key(end - relativedelta(months=i)) for i in range(count - 1, -1, -1)]


def month_label(key: str) -> str:
    return datetime.strptime(key, "%Y-%m").strftime("%b %Y")


@dataclass
class MonthStats:
    month: str
    submissions: list[Submission] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.submissions)

    @property
    def failed(self) -> list[Submission]:
        return [s for s in self.submissions if s.result == SubmissionResult.failed]

    @property
    def failure_rate(self) -> Optional[float]:
        return len(self.failed) / self.total * 100 if self.total else None

    @property
    def volume_submissions(self) -> list[Submission]:
        # Transaction-level files carry an "amount" column; aggregate returns
        # (e.g. inclusion returns) don't and are left out of volume.
        return [s for s in self.submissions if s.result == SubmissionResult.passed and "amount" in (s.numeric_totals or {})]

    @property
    def volume(self) -> Optional[float]:
        subs = self.volume_submissions
        return sum(float(s.numeric_totals["amount"]) for s in subs) if subs else None

    @property
    def ids(self) -> list[int]:
        return [s.id for s in self.submissions]


@dataclass
class ParticipantHistory:
    participant: Participant
    submissions: list[Submission]  # oldest first
    months: dict[str, MonthStats]
    history_months: float
    suppressed: bool
    suppressed_reason: str = ""
    method: str = ""
    fallback_reason: str = ""

    @property
    def month_keys(self) -> list[str]:
        return sorted(self.months)

    @property
    def observed_month(self) -> Optional[str]:
        return self.month_keys[-1] if self.months else None

    @property
    def last_submission(self) -> Optional[Submission]:
        return self.submissions[-1] if self.submissions else None

    def prior_months(self, limit: Optional[int] = None) -> list[MonthStats]:
        """Months with data before the observed month (most recent last)."""
        keys = self.month_keys[:-1]
        if limit:
            keys = keys[-limit:]
        return [self.months[k] for k in keys]

    def window(self, months: int = RECENT_MONTHS, ending: Optional[str] = None) -> list[Submission]:
        end = ending or self.observed_month
        if not end:
            return []
        keys = set(months_ending(end, months))
        return [s for s in self.submissions if month_key(s.uploaded_at) in keys]

    def volume_months(self, now: Optional[datetime] = None) -> list[MonthStats]:
        """Months with reported transaction value. A participant that
        reports more often than monthly hasn't finished the current month,
        so that month is left out — a month in progress is not a drop."""
        current = month_key(now or datetime.utcnow())
        partial = (self.participant.expected_frequency_days or 30) < 28
        return [self.months[k] for k in self.month_keys
                if self.months[k].volume is not None and not (partial and k == current)]


def error_column(entry) -> str:
    """Column named by a validation error ({row, column, rule, description};
    older rows used "field")."""
    return (entry.get("column") or entry.get("field") or "") if isinstance(entry, dict) else ""


def top_error_field(subs: list[Submission]) -> Optional[tuple[str, int]]:
    """Most frequent failing field across the given submissions' validation
    errors — makes 'recommended investigation area' specific."""
    counts = Counter(error_column(e) for s in subs for e in (s.errors or []) if error_column(e))
    return counts.most_common(1)[0] if counts else None


class DetectionContext:
    def __init__(self, session: Session, config: dict, active_method: str, now: Optional[datetime] = None):
        self.session = session
        self.config = config
        self.active_method = active_method
        self.now = now or datetime.utcnow()
        self.histories: dict[int, ParticipantHistory] = {}

    # -- thresholds ---------------------------------------------------------

    def setting(self, key: str) -> float:
        return float(self.config[key])

    def severity(self, ratio: float) -> str:
        """`ratio` = how many times past its trigger the signal is (≥ 1)."""
        bands = self.config["severity_bands"]
        if ratio >= bands["critical"]:
            return "CRITICAL"
        if ratio >= bands["high"]:
            return "HIGH"
        if ratio >= bands["medium"]:
            return "MEDIUM"
        return "LOW"

    # -- participants -------------------------------------------------------

    def eligible(self, method: str) -> list[ParticipantHistory]:
        """Participants a detector of `method` should look at: never the ones
        with insufficient history (§8.3)."""
        return [
            h for h in self.histories.values()
            if not h.suppressed and h.observed_month and (method == "*" or h.method == method)
        ]

    def peers(self, h: ParticipantHistory) -> list[ParticipantHistory]:
        """Other institutions of the same type with data in the same window."""
        if not h.participant.type or not h.observed_month:
            return []
        window = set(months_ending(h.observed_month, RECENT_MONTHS))
        return [
            o for o in self.histories.values()
            if o.participant.id != h.participant.id
            and o.participant.type == h.participant.type
            and any(k in window for k in o.months)
        ]


def build_context(session: Session, config: dict, method_override: Optional[str] = None,
                  now: Optional[datetime] = None) -> DetectionContext:
    active = method_override or config["baseline_method"]
    ctx = DetectionContext(session, config, active, now)
    min_history = float(config["min_history_months"])
    subs_by_participant: dict[int, list[Submission]] = {}
    for s in session.exec(select(Submission).order_by(Submission.uploaded_at, Submission.id)).all():
        subs_by_participant.setdefault(s.participant_id, []).append(s)

    for p in session.exec(select(Participant)).all():
        subs = subs_by_participant.get(p.id, [])
        months: dict[str, MonthStats] = {}
        for s in subs:
            months.setdefault(month_key(s.uploaded_at), MonthStats(month_key(s.uploaded_at))).submissions.append(s)
        history = (ctx.now - subs[0].uploaded_at).days / DAYS_PER_MONTH if subs else 0.0
        suppressed = history < min_history
        reason = ""
        if suppressed:
            reason = (
                f"Insufficient history — {history:.1f} months of submissions; AI alerts need at least "
                f"{min_history:g} months (SRS §8.3)."
                if subs else "Insufficient history — no submissions received yet (SRS §8.3)."
            )
        ctx.histories[p.id] = ParticipantHistory(p, subs, months, round(history, 1), suppressed, reason)

    for h in ctx.histories.values():
        h.method, h.fallback_reason = _resolve_method(ctx, h)
    return ctx


def _resolve_method(ctx: DetectionContext, h: ParticipantHistory) -> tuple[str, str]:
    """REQ-AI-011: use the active method when this participant's data
    supports it, otherwise fall back (R3 → R2 → R1) and say why."""
    active = ctx.active_method
    if active not in METHODS:
        return active, ""  # a plugin method decides for itself
    reasons: list[str] = []
    if active == "peer":
        peers = ctx.peers(h)
        needed = int(ctx.config["peer_min_peers"])
        if len(peers) >= needed:
            return "peer", ""
        reasons.append(
            f"{method_label('peer')} needs ≥{needed} other {h.participant.type or 'same-type'} institutions with data "
            f"in the same {RECENT_MONTHS}-month window; found {len(peers)}."
        )
    if active in ("peer", "rolling"):
        prior = len(h.prior_months())
        if prior >= ROLLING_MIN_MONTHS:
            return "rolling", " ".join(reasons + [f"Using {method_label('rolling')}."]) if reasons else ""
        reasons.append(
            f"{method_label('rolling')} needs ≥{ROLLING_MIN_MONTHS} months of prior submission history; "
            f"this participant has {prior}."
        )
    if reasons:
        reasons.append(f"Using {method_label('threshold')}.")
    return "threshold", " ".join(reasons)
