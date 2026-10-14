"""R3 — peer-group baseline (REQ-AI-011c): each participant against the
median of institutions of the same type over the same window."""

from statistics import median

from app.models.enums import SubmissionResult
from app.services.detectors import Finding
from app.services.detectors.context import RECENT_MONTHS, DetectionContext, ParticipantHistory, month_label
from app.services.detectors.threshold import SOURCES_VALIDATION, SOURCES_VOLUME, failure_area, volume_area


def _failure_rate(subs) -> float:
    return sum(1 for s in subs if s.result == SubmissionResult.failed) / len(subs) * 100 if subs else 0.0


def _growth(h: ParticipantHistory, now):
    """Latest vs previous reporting month's transaction value, in %."""
    vol = h.volume_months(now)
    if len(vol) < 2 or not vol[-2].volume:
        return None
    return (vol[-1].volume - vol[-2].volume) / vol[-2].volume * 100, vol[-1], vol[-2]


class PeerGroupDetector:
    name = "Peer-group baseline"
    method = "peer"
    description = (
        f"Validation failure rate over the last {RECENT_MONTHS} months and month-on-month change in reported "
        "transaction value, each against the median of institutions of the same type."
    )

    def detect(self, ctx: DetectionContext) -> list[Finding]:
        findings: list[Finding] = []
        change_limit = ctx.setting("failure_rate_change_pp")
        volume_limit = ctx.setting("volume_deviation_pct")
        for h in ctx.eligible(self.method):
            peers = ctx.peers(h)
            if not peers:
                continue
            kind = h.participant.type
            names = ", ".join(sorted(p.participant.name for p in peers))
            peer_note = f"{len(peers)} other {kind} institution{'s' if len(peers) != 1 else ''}"

            window = h.window(RECENT_MONTHS)
            failed = [s for s in window if s.result == SubmissionResult.failed]
            peer_windows = [p.window(RECENT_MONTHS, ending=h.observed_month) for p in peers]
            peer_rates = [_failure_rate(w) for w in peer_windows if w]
            if failed and peer_rates and change_limit > 0:
                rate = _failure_rate(window)
                base = median(peer_rates)
                gap = rate - base
                if gap >= change_limit:
                    findings.append(Finding(
                        participant_id=h.participant.id,
                        indicator_code="validation_failure_rate",
                        indicator=f"Submission failure rate above {kind} peers",
                        evidence_key=f"sub{max(s.id for s in failed)}",
                        baseline_value=f"{base:.1f}% (median of {peer_note})",
                        observed_value=f"{rate:.1f}% ({len(failed)} of {len(window)} submissions)",
                        deviation=f"{gap:+.1f} pp" + (f" ({gap / base * 100:+.0f}%)" if base else ""),
                        deviation_pct=round(gap / base * 100, 1) if base else None,
                        severity=ctx.severity(gap / change_limit),
                        recommended_area=failure_area(failed),
                        baseline_method_key="peer",
                        methodology=(
                            f"Failure rate over the {RECENT_MONTHS} months to {month_label(h.observed_month)} against the "
                            f"median of {peer_note} over the same window ({names}); alerts when ≥{change_limit:g} "
                            "percentage points above the peers."
                        ),
                        data_sources=[SOURCES_VALIDATION, f"Peer group: {kind} institutions ({names})",
                                      "Settings: anomaly.failure_rate_change_pp"],
                        source_submission_ids=[s.id for s in window],
                    ))

            own = _growth(h, ctx.now)
            peer_growth = [g[0] for g in (_growth(p, ctx.now) for p in peers) if g is not None]
            if own and peer_growth and volume_limit > 0:
                growth, current, previous = own
                base = median(peer_growth)
                gap = growth - base
                if abs(gap) >= volume_limit:
                    findings.append(Finding(
                        participant_id=h.participant.id,
                        indicator_code="reported_volume",
                        indicator=f"Reported transaction value trend diverges from {kind} peers",
                        evidence_key=f"vol{current.month}:{max(s.id for s in current.volume_submissions)}",
                        baseline_value=f"{base:+.0f}% month-on-month (median of {len(peer_growth)} peers)",
                        observed_value=f"{growth:+.0f}% ({month_label(previous.month)} → {month_label(current.month)})",
                        deviation=f"{gap:+.0f} pp",
                        deviation_pct=round(gap, 1),
                        severity=ctx.severity(abs(gap) / volume_limit),
                        recommended_area=volume_area(gap),
                        baseline_method_key="peer",
                        methodology=(
                            "Month-on-month change in reported transaction value against the median change of "
                            f"{peer_note} ({names}); alerts when the gap exceeds ±{volume_limit:g} percentage points."
                        ),
                        data_sources=[SOURCES_VOLUME, f"Peer group: {kind} institutions ({names})",
                                      "Settings: anomaly.volume_deviation_pct"],
                        source_submission_ids=[s.id for s in current.volume_submissions + previous.volume_submissions],
                    ))
        return findings
