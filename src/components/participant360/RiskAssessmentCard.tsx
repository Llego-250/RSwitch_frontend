// REQ-P360-009..012: the participant risk assessment — three categories, the
// composite, every input that went into it and (for authorized users) the
// methodology. Under 3 months of submission history only the pending notice
// is shown, never a score.
import { useState } from "react";
import { Gauge, Info } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import { fmtDateTime, fmtDay } from "@/lib/compliance";
import {
  BAND_STYLE,
  INSUFFICIENT_MESSAGE,
  RISK_CATEGORIES,
  fmtValue,
  type ParticipantRisk,
  type RiskCategoryScore,
  type RiskMethodology,
} from "@/lib/participant360";
import { Empty, Pill } from "./ui";

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[11px] text-[#7B8798]">—</span>;
  const tone = score >= 66 ? "bg-[#DC3154]" : score >= 33 ? "bg-[#D97706]" : "bg-[#16A979]";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${Math.max(2, score)}%` }} />
      </div>
      <span className="font-mono text-[11px] text-[#172033] dark:text-slate-100 w-9 text-right">
        {score.toFixed(0)}
      </span>
    </div>
  );
}

function CategoryBlock({ category }: { category: RiskCategoryScore }) {
  return (
    <div className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-sm text-[#172033] dark:text-white">{category.label}</div>
        <div className="flex items-center gap-3 text-[11px] text-[#526174] dark:text-slate-400">
          <span>
            weight {category.weight}%
            {category.measured && category.applied_weight !== category.weight
              ? ` (applied ${category.applied_weight}%)`
              : ""}
          </span>
          <span className="font-mono font-bold text-sm text-[#172033] dark:text-white">
            {category.score === null ? "not measurable" : `${category.score.toFixed(1)} / 100`}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-[#7B8798]">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Indicator</th>
              <th className="px-3 py-2 text-left font-semibold">Measured</th>
              <th className="px-3 py-2 text-left font-semibold">Risk</th>
              <th
                className="px-3 py-2 text-right font-semibold"
                title="Share of the composite this run"
              >
                Share
              </th>
              <th className="px-4 py-2 text-right font-semibold" title="Composite points added">
                Points
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF2F5] dark:divide-slate-800">
            {Object.entries(category.indicators).map(([key, ind]) => (
              <tr key={key} className={ind.enabled ? "" : "opacity-60"}>
                <td className="px-4 py-2 align-top">
                  <div className="font-semibold text-[#172033] dark:text-slate-100">
                    {ind.label}
                  </div>
                  <div className="text-[11px] text-[#526174] dark:text-slate-400">{ind.detail}</div>
                  {!ind.enabled && (
                    <div className="text-[10px] text-[#7B8798]">Disabled in Settings</div>
                  )}
                  {ind.enabled && ind.weight === 0 && (
                    <div className="text-[10px] text-[#7B8798]">Measured, not weighted (0%)</div>
                  )}
                  {ind.enabled && ind.weight > 0 && !ind.measured && (
                    <div className="text-[10px] text-[#7B8798]">
                      Not measurable — weight redistributed
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top font-mono whitespace-nowrap">
                  {fmtValue(ind.value, ind.unit)}
                </td>
                <td className="px-3 py-2 align-top">
                  <ScoreBar score={ind.score} />
                </td>
                <td className="px-3 py-2 align-top text-right font-mono">
                  {ind.applied_weight.toFixed(1)}%
                </td>
                <td className="px-4 py-2 align-top text-right font-mono">
                  {ind.contribution.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MethodologyDetails({ methodology }: { methodology: RiskMethodology }) {
  const byCategory = methodology.categories.map((c) => ({
    ...c,
    indicators: methodology.indicators.filter((i) => i.category === c.key),
  }));
  return (
    <div className="space-y-4 text-xs text-[#526174] dark:text-slate-400">
      {methodology.warning && (
        <p className="text-[#9A5300] dark:text-amber-300">{methodology.warning}</p>
      )}
      <p>{methodology.summary}</p>
      <p>
        <span className="font-semibold text-[#172033] dark:text-slate-200">
          SRS {methodology.srs_formula}
        </span>{" "}
        {methodology.reproduces_srs_formula
          ? "The weights in force reproduce it exactly."
          : "The weights in force have been changed from it in Settings."}
      </p>
      {byCategory.map((c) => (
        <div key={c.key} className="space-y-1.5">
          <div className="font-semibold text-[#172033] dark:text-slate-200">
            {c.label} — {c.weight}% · {c.description}
          </div>
          <ul className="space-y-1.5 pl-3 border-l-2 border-[#DCE3E8] dark:border-slate-700">
            {c.indicators.map((i) => (
              <li key={i.key}>
                <span className="font-semibold text-[#172033] dark:text-slate-200">{i.label}</span>
                {i.srs_component && <span> (§11.5 {i.srs_component})</span>} —{" "}
                {i.enabled
                  ? `${i.weight}% of the category, ${i.effective_weight}% of the composite`
                  : "disabled"}
                . {i.definition} <span className="italic">Scale: {i.scale}.</span> Source:{" "}
                {i.data_source}; {i.window}.
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p>
        Severity points:{" "}
        {Object.entries(methodology.severity_points)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")}
        . Bands: Low {methodology.bands.Low}; Medium {methodology.bands.Medium}; High{" "}
        {methodology.bands.High}.
      </p>
      <p>{methodology.minimum_history}</p>
      <p>{methodology.recalculation}</p>
      <p>Data sources: {methodology.data_sources.join("; ")}.</p>
      <p>
        {methodology.scope} {methodology.advisory}
      </p>
    </div>
  );
}

export function RiskAssessmentCard({ risk }: { risk: ParticipantRisk | null }) {
  const [showMethod, setShowMethod] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  if (!risk) return null;
  const scored = risk.status === "scored" && risk.composite !== null && risk.band !== null;
  const history = risk.history.slice(0, 12);

  return (
    <SectionCard
      title={
        <>
          <Gauge className="h-5 w-5 text-[#168FA8]" /> Risk assessment
        </>
      }
      action={
        risk.methodology ? (
          <button
            onClick={() => setShowMethod((v) => !v)}
            className="text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer inline-flex items-center gap-1"
          >
            <Info className="h-3.5 w-3.5" /> {showMethod ? "Hide methodology" : "Methodology"}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {scored ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#7B8798]">
                Composite risk score (0 lowest – 100 highest)
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-3xl font-bold font-mono text-[#172033] dark:text-white">
                  {risk.composite!.toFixed(1)}
                </span>
                <Pill className={BAND_STYLE[risk.band!]}>{risk.band} risk</Pill>
                {risk.change !== null && (
                  <span className="text-[11px] text-[#526174] dark:text-slate-400">
                    {risk.change > 0 ? "▲" : risk.change < 0 ? "▼" : "■"}{" "}
                    {Math.abs(risk.change).toFixed(1)} since the previous run
                  </span>
                )}
              </div>
              {risk.top_factor_label && (
                <p className="text-[11px] text-[#526174] dark:text-slate-400 mt-1">
                  Largest contributor: {risk.top_factor_label.toLowerCase()}.
                </p>
              )}
            </div>
            <p className="text-[11px] text-[#7B8798] text-right">
              Calculated {fmtDateTime(risk.computed_at)} ({risk.trigger.toLowerCase()})
              <br />
              {risk.months_of_history.toFixed(1)} months of submission history
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
            <div className="font-semibold text-sm text-[#172033] dark:text-white">
              {risk.message ?? INSUFFICIENT_MESSAGE}
            </div>
            <p className="text-xs text-[#526174] dark:text-slate-400 mt-1">
              {risk.first_submission_at
                ? `${risk.months_of_history.toFixed(1)} of the 3 months of submission history needed (first submission ${fmtDay(
                    risk.first_submission_at,
                  )}). A score is available from ${risk.eligible_from ? fmtDay(risk.eligible_from) : "then"}, after the next nightly recalculation.`
                : "No submissions received yet; the 3 months are counted from the first submission (REQ-P360-012)."}
            </p>
          </div>
        )}

        {scored && (
          <div className="space-y-3">
            {RISK_CATEGORIES.map((key) =>
              risk.categories[key] ? (
                <CategoryBlock key={key} category={risk.categories[key]!} />
              ) : null,
            )}
          </div>
        )}

        {history.length > 1 && (
          <div>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer"
            >
              {showHistory ? "Hide score history" : `Score history (${risk.history.length} runs)`}
            </button>
            {showHistory && (
              <table className="w-full text-xs mt-2">
                <thead className="text-[10px] uppercase tracking-wide text-[#7B8798]">
                  <tr>
                    <th className="py-1.5 text-left font-semibold">Run</th>
                    <th className="py-1.5 text-left font-semibold">Trigger</th>
                    <th className="py-1.5 text-right font-semibold">Compliance</th>
                    <th className="py-1.5 text-right font-semibold">Operational</th>
                    <th className="py-1.5 text-right font-semibold">Technical</th>
                    <th className="py-1.5 text-right font-semibold">Composite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F5] dark:divide-slate-800 font-mono">
                  {history.map((h) => (
                    <tr key={`${h.computed_at}-${h.trigger}`}>
                      <td className="py-1.5 font-sans">{fmtDateTime(h.computed_at)}</td>
                      <td className="py-1.5 font-sans text-[#526174] dark:text-slate-400">
                        {h.trigger}
                      </td>
                      <td className="py-1.5 text-right">{h.compliance?.toFixed(1) ?? "—"}</td>
                      <td className="py-1.5 text-right">{h.operational?.toFixed(1) ?? "—"}</td>
                      <td className="py-1.5 text-right">{h.technical?.toFixed(1) ?? "—"}</td>
                      <td className="py-1.5 text-right font-bold">
                        {h.composite === null ? "pending" : `${h.composite.toFixed(1)} ${h.band}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {showMethod && risk.methodology && (
          <div className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 p-4">
            <MethodologyDetails methodology={risk.methodology} />
          </div>
        )}
        {!risk.methodology && <Empty>The scoring methodology is shown to authorized users.</Empty>}
      </div>
    </SectionCard>
  );
}
