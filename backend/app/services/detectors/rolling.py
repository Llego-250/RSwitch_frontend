"""R2 — rolling historical baseline (REQ-AI-011b): each participant against
its own last N (≥ 6) reporting months. The engine only routes participants
here when they have at least six months of prior history."""

from statistics import mean, pstdev

from app.services.detectors import Finding
from app.services.detectors.context import ROLLING_MIN_MONTHS, DetectionContext, month_label
from app.services.detectors.threshold import SOURCES_VALIDATION, SOURCES_VOLUME, failure_area, volume_area


class RollingBaselineDetector:
    name = "Rolling historical baseline"
    method = "rolling"
    description = (
        "Latest reporting month against the participant's own previous months (window from Settings, minimum "
        f"{ROLLING_MIN_MONTHS}): failure-rate change in percentage points and reported transaction value deviation."
    )

    def detect(self, ctx: DetectionContext) -> list[Finding]:
        findings: list[Finding] = []
        window = max(ROLLING_MIN_MONTHS, int(ctx.setting("rolling_window_months")))
        change_limit = ctx.setting("failure_rate_change_pp")
        volume_limit = ctx.setting("volume_deviation_pct")
        for h in ctx.eligible(self.method):
            prior = h.prior_months(window)
            if len(prior) < ROLLING_MIN_MONTHS:
                continue  # defensive: the engine already enforces this
            current = h.months[h.observed_month]
            span = f"{month_label(prior[0].month)}–{month_label(prior[-1].month)}"

            base_total = sum(m.total for m in prior)
            base_failed = sum(len(m.failed) for m in prior)
            baseline = base_failed / base_total * 100 if base_total else 0.0
            observed = current.failure_rate or 0.0
            change = observed - baseline
            if current.failed and change_limit > 0 and change >= change_limit:
                rel = f" ({change / baseline * 100:+.0f}%)" if baseline else ""
                findings.append(Finding(
                    participant_id=h.participant.id,
                    indicator_code="validation_failure_rate",
                    indicator="Unexplained change in submission failure rate",
                    evidence_key=f"sub{max(s.id for s in current.failed)}",
                    baseline_value=f"{baseline:.1f}% ({base_failed} of {base_total} submissions, {span})",
                    observed_value=f"{observed:.1f}% ({len(current.failed)} of {current.total}, {month_label(current.month)})",
                    deviation=f"{change:+.1f} pp{rel}",
                    deviation_pct=round(change / baseline * 100, 1) if baseline else None,
                    severity=ctx.severity(change / change_limit),
                    recommended_area=failure_area(current.failed),
                    baseline_method_key="rolling",
                    methodology=(
                        f"Failure rate in {month_label(current.month)} against this participant's own rate over its previous "
                        f"{len(prior)} reporting months ({span}); alerts when it rises by ≥{change_limit:g} percentage points."
                    ),
                    data_sources=[SOURCES_VALIDATION, f"Participant's own submission history ({len(prior)} months)",
                                  "Settings: anomaly.failure_rate_change_pp"],
                    source_submission_ids=current.ids + [i for m in prior for i in m.ids],
                ))

            # Volume uses completed reporting months only (see volume_months).
            vol = h.volume_months(ctx.now)
            vol_prior = vol[:-1][-window:]
            if len(vol_prior) >= ROLLING_MIN_MONTHS and volume_limit > 0:
                cur = vol[-1]
                vspan = f"{month_label(vol_prior[0].month)}–{month_label(vol_prior[-1].month)}"
                values = [m.volume for m in vol_prior]
                base = mean(values)
                if base:
                    dev = (cur.volume - base) / base * 100
                    if abs(dev) >= volume_limit:
                        sd = pstdev(values)
                        z = f"; {abs(cur.volume - base) / sd:.1f} standard deviations from the mean" if sd else ""
                        findings.append(Finding(
                            participant_id=h.participant.id,
                            indicator_code="reported_volume",
                            indicator=f"Reported transaction value {'spike' if dev > 0 else 'drop'} vs own baseline",
                            evidence_key=f"vol{cur.month}:{max(s.id for s in cur.volume_submissions)}",
                            baseline_value=f"{base:,.0f} (mean of {len(vol_prior)} months, {vspan})",
                            observed_value=f"{cur.volume:,.0f} ({month_label(cur.month)})",
                            deviation=f"{dev:+.0f}%",
                            deviation_pct=round(dev, 1),
                            severity=ctx.severity(abs(dev) / volume_limit),
                            recommended_area=volume_area(dev),
                            baseline_method_key="rolling",
                            methodology=(
                                f"Reported transaction value in {month_label(cur.month)} against the mean of the participant's "
                                f"previous {len(vol_prior)} reporting months{z}; alerts beyond ±{volume_limit:g}%."
                            ),
                            data_sources=[SOURCES_VOLUME, f"Participant's own submission history ({len(vol_prior)} months)",
                                          "Settings: anomaly.volume_deviation_pct"],
                            source_submission_ids=[s.id for s in cur.volume_submissions]
                            + [s.id for m in vol_prior for s in m.volume_submissions],
                        ))
        return findings
