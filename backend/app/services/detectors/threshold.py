"""R1 — configurable predefined thresholds (REQ-AI-011a, REQ-AI-012)."""

from app.models.enums import SubmissionResult
from app.services.detectors import Finding
from app.services.detectors.context import RECENT_MONTHS, DetectionContext, month_label, top_error_field

SOURCES_VALIDATION = "Submission validation results (files uploaded on the participant's behalf)"
SOURCES_VOLUME = "Passed transaction-level submissions (sum of the 'amount' column)"


def failure_area(subs) -> str:
    top = top_error_field(subs)
    if top:
        return (f"Participant's file export — most failed checks were on field '{top[0]}' ({top[1]} errors); "
                "confirm the column format with the participant and the ingestion template.")
    return "Participant's file export — review the validation error reports of the failed submissions."


def volume_area(dev: float) -> str:
    if dev > 0:
        return "Confirm the period's transaction extract is complete and not duplicated (re-sent or overlapping batches)."
    return "Confirm the extract covers the full period — look for missing batches or integration downtime."


class ThresholdDetector:
    name = "Configured thresholds"
    method = "threshold"
    description = (
        f"Validation failure rate over the last {RECENT_MONTHS} months against the configured limit, and reported "
        "transaction value against the previous reporting month against the configured ± deviation."
    )

    def detect(self, ctx: DetectionContext) -> list[Finding]:
        findings: list[Finding] = []
        limit = ctx.setting("error_rate_pct")
        volume_limit = ctx.setting("volume_deviation_pct")
        for h in ctx.eligible(self.method):
            pid = h.participant.id

            window = h.window(RECENT_MONTHS)
            failed = [s for s in window if s.result == SubmissionResult.failed]
            if window and failed and limit > 0:
                rate = len(failed) / len(window) * 100
                if rate >= limit:
                    findings.append(Finding(
                        participant_id=pid,
                        indicator_code="validation_failure_rate",
                        indicator="Spike in submission validation failures",
                        evidence_key=f"sub{max(s.id for s in failed)}",
                        baseline_value=f"≤ {limit:g}% (configured limit)",
                        observed_value=f"{rate:.1f}% ({len(failed)} of {len(window)} submissions failed)",
                        deviation=f"{rate - limit:+.1f} pp ({(rate - limit) / limit * 100:+.0f}%)",
                        deviation_pct=round((rate - limit) / limit * 100, 1),
                        severity=ctx.severity(rate / limit),
                        recommended_area=failure_area(failed),
                        baseline_method_key="threshold",
                        methodology=(
                            f"Share of this participant's submissions that failed validation over the last {RECENT_MONTHS} "
                            f"months up to {month_label(h.observed_month)}, compared with the configured limit of {limit:g}% "
                            "(Settings → AI thresholds)."
                        ),
                        data_sources=[SOURCES_VALIDATION, "Settings: anomaly.error_rate_pct"],
                        source_submission_ids=[s.id for s in failed] + [s.id for s in window if s.result != SubmissionResult.failed],
                    ))

            vol = h.volume_months()
            if len(vol) >= 2 and volume_limit > 0:
                current, previous = vol[-1], vol[-2]
                if current.month == h.observed_month and previous.volume:
                    dev = (current.volume - previous.volume) / previous.volume * 100
                    if abs(dev) >= volume_limit:
                        findings.append(Finding(
                            participant_id=pid,
                            indicator_code="reported_volume",
                            indicator=f"Reported transaction value {'spike' if dev > 0 else 'drop'} ({month_label(current.month)})",
                            evidence_key=f"vol{current.month}:{max(s.id for s in current.volume_submissions)}",
                            baseline_value=f"{previous.volume:,.0f} ({month_label(previous.month)})",
                            observed_value=f"{current.volume:,.0f} ({month_label(current.month)})",
                            deviation=f"{dev:+.0f}%",
                            deviation_pct=round(dev, 1),
                            severity=ctx.severity(abs(dev) / volume_limit),
                            recommended_area=volume_area(dev),
                            baseline_method_key="threshold",
                            methodology=(
                                f"Total reported transaction value in {month_label(current.month)} compared with the previous "
                                f"reporting month ({month_label(previous.month)}); alerts beyond the configured ±{volume_limit:g}%."
                            ),
                            data_sources=[SOURCES_VOLUME, "Settings: anomaly.volume_deviation_pct"],
                            source_submission_ids=[s.id for s in current.volume_submissions + previous.volume_submissions],
                        ))
        return findings
