// Participant risk scoring weights, thresholds and indicators (REQ-P360-011,
// §11.5). Owned by the Participant 360 module. Rendered inside the Settings
// page; editable only with "settings.manage", read-only otherwise. Saving
// recalculates every participant's score at once.
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw, RotateCcw, Save } from "lucide-react";
import { MethodologyDetails } from "@/components/participant360/RiskAssessmentCard";
import { PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import {
  RISK_CATEGORIES,
  useRefreshRisk,
  useRiskMethodology,
  type RiskConfig,
  type RiskMethodology,
} from "@/lib/participant360";

const inputCls =
  "w-full h-8 px-2 rounded-lg bg-slate-50 dark:bg-slate-800 border text-xs font-mono text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40 disabled:opacity-70";
const border = (bad?: string) =>
  bad ? "border-red-400" : "border-[#DCE3E8] dark:border-slate-700";

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

/** Client-side checks mirroring the server's (it validates again). */
function localErrors(cfg: RiskConfig, m: RiskMethodology): Record<string, string> {
  const out: Record<string, string> = {};
  const cats = sum(Object.values(cfg.category_weights));
  if (cats !== 100) out.category_weights = `Category weights must add up to 100 (now ${cats}).`;
  for (const c of m.categories) {
    if (cfg.category_weights[c.key] <= 0) continue;
    const total = sum(
      m.indicators
        .filter((i) => i.category === c.key && cfg.indicators[i.key].enabled)
        .map((i) => cfg.indicators[i.key].weight),
    );
    if (total !== 100)
      out[`indicators.${c.key}`] =
        `${c.label} indicator weights must add up to 100 (now ${total}).`;
  }
  for (const i of m.indicators) {
    const s = cfg.indicators[i.key];
    if (s.good === s.bad)
      out[`indicators.${i.key}.thresholds`] = "The 0-risk and 100-risk values must differ.";
  }
  if (!(cfg.bands.medium > 0 && cfg.bands.medium < cfg.bands.high && cfg.bands.high < 100)) {
    out.bands = "Cut-offs must satisfy 0 < Medium < High < 100.";
  }
  return out;
}

export function RiskSettingsSection({ canEdit }: { canEdit: boolean }) {
  const methodology = useRiskMethodology();
  const refresh = useRefreshRisk();
  const [form, setForm] = useState<RiskConfig | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [showDefinitions, setShowDefinitions] = useState(false);

  useEffect(() => {
    if (methodology.data) setForm(structuredClone(methodology.data.config));
  }, [methodology.data]);

  const save = useMutation({
    mutationFn: (cfg: RiskConfig) =>
      api.put<RiskMethodology>("/participants/risk-methodology", cfg),
    onSuccess: (m) => {
      setErrors({});
      setNotice(
        m.recomputed
          ? `Saved — ${m.recomputed} participant score(s) recalculated.`
          : "No changes to save.",
      );
      refresh();
    },
    onError: (e) => {
      const inline = fieldErrors(e);
      setErrors(Object.keys(inline).length ? inline : { _: errorMessage(e) });
    },
  });
  const recompute = useMutation({
    mutationFn: () => api.post<{ recomputed: number }>("/participants/risk-scores/recompute"),
    onSuccess: (r) => {
      setNotice(`${r.recomputed} participant score(s) recalculated.`);
      refresh();
    },
    onError: (e) => setErrors({ _: errorMessage(e) }),
  });

  const m = methodology.data;
  const effective = useMemo(() => {
    if (!form || !m) return {} as Record<string, number>;
    return Object.fromEntries(
      m.indicators.map((i) => [
        i.key,
        form.indicators[i.key].enabled
          ? (form.category_weights[i.category] * form.indicators[i.key].weight) / 100
          : 0,
      ]),
    );
  }, [form, m]);

  if (methodology.error) {
    return (
      <SectionCard title="Participant risk scoring">
        <p className="text-xs text-red-600">{errorMessage(methodology.error)}</p>
      </SectionCard>
    );
  }
  if (!m || !form) {
    return (
      <SectionCard title="Participant risk scoring">
        <p className="text-xs text-slate-400">Loading…</p>
      </SectionCard>
    );
  }

  const update = (fn: (draft: RiskConfig) => void) => {
    setNotice(null);
    setForm((f) => {
      if (!f) return f;
      const draft = structuredClone(f);
      fn(draft);
      return draft;
    });
  };
  const num = (v: string) => (v === "" ? 0 : Number(v));

  function submit() {
    if (!form || !m) return;
    const local = localErrors(form, m);
    setErrors(local);
    if (Object.keys(local).length === 0) save.mutate(form);
  }

  function resetDefaults() {
    setErrors({});
    setNotice("SRS §11.5 defaults loaded — save to apply them.");
    setForm(structuredClone(m!.defaults));
  }

  const catTotal = sum(Object.values(form.category_weights));

  return (
    <SectionCard
      title="Participant risk scoring"
      action={
        <span className="text-[11px] text-[#526174] dark:text-slate-400">
          {m.reproduces_srs_formula
            ? "In force: SRS §11.5 weights"
            : "In force: customised weights"}
        </span>
      }
    >
      <div className="space-y-5 text-xs">
        <p className="text-[#526174] dark:text-slate-400">
          {m.summary} {m.srs_formula} {m.minimum_history} {m.recalculation}
        </p>
        {m.warning && <p className="text-[#9A5300] dark:text-amber-300">{m.warning}</p>}

        {/* Category weights */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-[#172033] dark:text-white">Category weights</h3>
            <span className={`font-mono ${catTotal === 100 ? "text-[#0E7A57]" : "text-red-600"}`}>
              total {catTotal} / 100
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {m.categories.map((c) => (
              <label key={c.key} className="block">
                <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {c.label} (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={form.category_weights[c.key]}
                  disabled={!canEdit}
                  onChange={(e) =>
                    update((d) => void (d.category_weights[c.key] = num(e.target.value)))
                  }
                  className={`${inputCls} ${border(errors.category_weights)}`}
                />
              </label>
            ))}
          </div>
          {errors.category_weights && (
            <p className="mt-1 text-[11px] text-red-600">{errors.category_weights}</p>
          )}
        </div>

        {/* Indicators per category */}
        {RISK_CATEGORIES.map((cat) => {
          const meta = m.categories.find((c) => c.key === cat)!;
          const rows = m.indicators.filter((i) => i.category === cat);
          const total = sum(
            rows
              .filter((i) => form.indicators[i.key].enabled)
              .map((i) => form.indicators[i.key].weight),
          );
          const catError = errors[`indicators.${cat}`];
          return (
            <div
              key={cat}
              className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 overflow-hidden"
            >
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                <span className="font-semibold text-[#172033] dark:text-white">
                  {meta.label} indicators
                </span>
                <span className={`font-mono ${total === 100 ? "text-[#0E7A57]" : "text-red-600"}`}>
                  total {total} / 100
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="text-[10px] uppercase tracking-wide text-[#7B8798]">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Indicator</th>
                      <th className="px-2 py-2 text-left font-semibold">On</th>
                      <th className="px-2 py-2 text-left font-semibold w-20">Weight %</th>
                      <th
                        className="px-2 py-2 text-left font-semibold w-24"
                        title="Indicator value that scores 0 risk"
                      >
                        0-risk value
                      </th>
                      <th
                        className="px-2 py-2 text-left font-semibold w-24"
                        title="Indicator value that scores 100 risk"
                      >
                        100-risk value
                      </th>
                      <th
                        className="px-3 py-2 text-right font-semibold"
                        title="Share of the composite"
                      >
                        Composite share
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF2F5] dark:divide-slate-800">
                    {rows.map((i) => {
                      const s = form.indicators[i.key];
                      const thresholdError = errors[`indicators.${i.key}.thresholds`];
                      return (
                        <tr key={i.key}>
                          <td className="px-3 py-2 align-top">
                            <div className="font-semibold text-[#172033] dark:text-slate-100">
                              {i.label}
                            </div>
                            <div className="text-[11px] text-[#7B8798]">
                              {i.unit} · {i.window}
                              {i.srs_component ? ` · §11.5 ${i.srs_component}` : ""}
                            </div>
                            {thresholdError && (
                              <div className="text-[11px] text-red-600">{thresholdError}</div>
                            )}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <input
                              type="checkbox"
                              checked={s.enabled}
                              disabled={!canEdit}
                              aria-label={`${i.label} enabled`}
                              onChange={(e) =>
                                update((d) => void (d.indicators[i.key].enabled = e.target.checked))
                              }
                              className="h-4 w-4 accent-[#168FA8]"
                            />
                          </td>
                          {(["weight", "good", "bad"] as const).map((field) => (
                            <td key={field} className="px-2 py-2 align-top">
                              <input
                                type="number"
                                step="any"
                                value={s[field]}
                                disabled={!canEdit || (field === "weight" && !s.enabled)}
                                aria-label={`${i.label} ${field}`}
                                onChange={(e) =>
                                  update(
                                    (d) => void (d.indicators[i.key][field] = num(e.target.value)),
                                  )
                                }
                                className={`${inputCls} ${border(field === "weight" ? catError : thresholdError)}`}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 align-top text-right font-mono">
                            {(effective[i.key] ?? 0).toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {catError && <p className="px-3 pb-2 text-[11px] text-red-600">{catError}</p>}
            </div>
          );
        })}

        {/* Severity points, bands, window */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h3 className="font-semibold text-[#172033] dark:text-white mb-2">
              Incident severity points
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(["Critical", "High", "Medium", "Low"] as const).map((sev) => (
                <label key={sev} className="block">
                  <span className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                    {sev}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.severity_points[sev]}
                    disabled={!canEdit}
                    onChange={(e) =>
                      update((d) => void (d.severity_points[sev] = num(e.target.value)))
                    }
                    className={`${inputCls} ${border(errors.severity_points)}`}
                  />
                </label>
              ))}
            </div>
            {errors.severity_points && (
              <p className="mt-1 text-[11px] text-red-600">{errors.severity_points}</p>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-[#172033] dark:text-white mb-2">
              Band cut-offs (composite)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(["medium", "high"] as const).map((b) => (
                <label key={b} className="block">
                  <span className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                    {b === "medium" ? "Medium from" : "High from"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={form.bands[b]}
                    disabled={!canEdit}
                    onChange={(e) => update((d) => void (d.bands[b] = num(e.target.value)))}
                    className={`${inputCls} ${border(errors.bands)}`}
                  />
                </label>
              ))}
            </div>
            {errors.bands && <p className="mt-1 text-[11px] text-red-600">{errors.bands}</p>}
          </div>
          <div>
            <h3 className="font-semibold text-[#172033] dark:text-white mb-2">Look-back window</h3>
            <label className="block">
              <span className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                Compliance and operational indicators (months)
              </span>
              <input
                type="number"
                min={1}
                max={36}
                value={form.lookback_months}
                disabled={!canEdit}
                onChange={(e) =>
                  update((d) => void (d.lookback_months = Math.round(num(e.target.value))))
                }
                className={`${inputCls} ${border(errors.lookback_months)}`}
              />
            </label>
            {errors.lookback_months && (
              <p className="mt-1 text-[11px] text-red-600">{errors.lookback_months}</p>
            )}
            <p className="mt-1 text-[11px] text-[#7B8798]">
              Technical indicators always cover the last {m.technical_window_days} days
              (REQ-P360-007).
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowDefinitions((v) => !v)}
          className="text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer"
        >
          {showDefinitions
            ? "Hide indicator definitions"
            : "Indicator definitions and data sources"}
        </button>
        {showDefinitions && (
          <div className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 p-4">
            <MethodologyDetails methodology={m} />
          </div>
        )}

        {errors._ && <p className="text-red-600">{errors._}</p>}
        {canEdit ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {notice && <span className="text-emerald-600 font-semibold">{notice}</span>}
            <SecondaryButton icon={<RotateCcw className="h-4 w-4" />} onClick={resetDefaults}>
              SRS §11.5 defaults
            </SecondaryButton>
            <SecondaryButton
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => recompute.mutate()}
            >
              {recompute.isPending ? "Recalculating…" : "Recalculate now"}
            </SecondaryButton>
            <PrimaryButton
              icon={<Save className="h-4 w-4" />}
              onClick={submit}
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : "Save risk methodology"}
            </PrimaryButton>
          </div>
        ) : (
          <p className="text-[11px] text-[#7B8798]">
            Read-only — only Technical/Admin users can change the methodology.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
