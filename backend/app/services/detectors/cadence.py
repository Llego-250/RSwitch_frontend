"""Reporting cadence: a participant that has gone silent for longer than
its expected frequency allows. The baseline is the participant's own
configured cadence, so this runs whatever baseline method is active."""

from app.services.detectors import Finding
from app.services.detectors.context import DetectionContext


class CadenceDetector:
    name = "Reporting cadence"
    method = "*"
    description = (
        "Days since the participant's last submission against its expected reporting frequency × the configured "
        "multiplier (Participant record + Settings)."
    )

    def detect(self, ctx: DetectionContext) -> list[Finding]:
        findings: list[Finding] = []
        multiplier = ctx.setting("cadence_multiplier")
        for h in ctx.eligible(self.method):
            last = h.last_submission
            expected = max(1, h.participant.expected_frequency_days or 30)
            limit = expected * multiplier
            age = (ctx.now - last.uploaded_at).days
            if multiplier <= 0 or age <= limit:
                continue
            findings.append(Finding(
                participant_id=h.participant.id,
                indicator_code="submission_cadence",
                indicator="Submission overdue against expected cadence",
                # New evidence only once they submit again and then go silent.
                evidence_key=f"last{last.id}",
                baseline_value=f"every {expected} day{'s' if expected != 1 else ''} (alert after {limit:g})",
                observed_value=f"{age} days since last file ({last.uploaded_at:%d %b %Y})",
                deviation=f"+{age - expected} days ({(age - expected) / expected * 100:+.0f}%)",
                deviation_pct=round((age - expected) / expected * 100, 1),
                severity=ctx.severity(age / limit),
                recommended_area="Contact the participant's operations team and check the integration status and pipeline logs.",
                baseline_method_key="threshold",
                baseline_method="R1 — Configured threshold (expected cadence)",
                methodology=(
                    f"Days since the last submission compared with the participant's expected reporting frequency "
                    f"({expected} days) × the configured multiplier ({multiplier:g})."
                ),
                data_sources=["Submission history (upload dates)", "Participant record: expected_frequency_days",
                              "Settings: anomaly.cadence_multiplier"],
                source_submission_ids=[last.id],
            ))
        return findings
