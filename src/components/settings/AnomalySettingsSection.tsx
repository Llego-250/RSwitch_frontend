// AI alert thresholds and baselines (REQ-AI-006b, REQ-AI-010..012, §8.3). Owned by the AI module.
// Rendered inside the Settings page; editable only with "settings.manage".
import { useEffect, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { PrimaryButton, SectionCard } from "@/components/AppShell";
import { ApiError, errorMessage, type FieldError } from "@/lib/api";
import {
  SettingsValidationError,
  useAiEngine,
  useAnomalySettings,
  useSaveAnomalySettings,
  type AnomalySettings,
} from "@/lib/ai";

const inputCls =
  "w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-sm text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40 disabled:opacity-70";

type NumberKey =
  | "volume_deviation_pct"
  | "error_rate_pct"
  | "failure_rate_change_pp"
  | "auto_escalate_days"
  | "min_history_months"
  | "rolling_window_months"
  | "peer_min_peers"
  | "cadence_multiplier"
  | "trend_months";

const NUMBER_FIELDS: { key: NumberKey; label: string; hint: string; step?: number }[] = [
  {
    key: "error_rate_pct",
    label: "Validation failure rate limit (%)",
    hint: "R1: alert when a participant's failed submissions over 3 months reach this share.",
  },
  {
    key: "failure_rate_change_pp",
    label: "Failure-rate change (percentage points)",
    hint: "R2/R3: alert when the failure rate rises this much above its own or its peers' baseline.",
  },
  {
    key: "volume_deviation_pct",
    label: "Reported volume deviation (± %)",
    hint: "Alert when reported transaction value moves this far from its baseline.",
  },
  {
    key: "auto_escalate_days",
    label: "Auto-escalate after (days at Acknowledged)",
    hint: "REQ-AI-006b — default 3.",
  },
  {
    key: "min_history_months",
    label: "Minimum history (months)",
    hint: "§8.3: participants with less history get no alerts and show “Insufficient history”.",
    step: 0.5,
  },
  {
    key: "rolling_window_months",
    label: "Rolling baseline window (months)",
    hint: "R2 — never fewer than the SRS minimum of 6.",
  },
  {
    key: "peer_min_peers",
    label: "Minimum peers for a peer group",
    hint: "R3 falls back to R2/R1 when fewer same-type institutions have data.",
  },
  {
    key: "cadence_multiplier",
    label: "Overdue cadence multiplier",
    hint: "Alert when silent for this many times the expected reporting frequency.",
    step: 0.5,
  },
  { key: "trend_months", label: "Trend summary window (months)", hint: "REQ-AI-007 — default 3." },
];

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs space-y-1">
      <span className="font-semibold text-[#172033] dark:text-slate-200">{label}</span>
      {children}
      {error ? (
        <span className="block text-[11px] text-[#B4233F] dark:text-rose-300">{error}</span>
      ) : (
        hint && <span className="block text-[11px] text-[#7B8798]">{hint}</span>
      )}
    </label>
  );
}

export function AnomalySettingsSection({ canEdit }: { canEdit: boolean }) {
  const settings = useAnomalySettings();
  const engine = useAiEngine();
  const save = useSaveAnomalySettings();
  const [draft, setDraft] = useState<AnomalySettings | null>(null);
  const [detectorsText, setDetectorsText] = useState("");
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) {
      setDraft(settings.data);
      setDetectorsText(settings.data.detectors.join("\n"));
    }
  }, [settings.data]);

  if (settings.error) {
    return (
      <SectionCard title="AI alert thresholds & baselines">
        <p className="text-xs text-[#B4233F]">{errorMessage(settings.error)}</p>
      </SectionCard>
    );
  }
  if (!draft) {
    return (
      <SectionCard title="AI alert thresholds & baselines">
        <p className="text-xs text-[#526174]">Loading…</p>
      </SectionCard>
    );
  }

  const fieldError = (key: string) =>
    errors.find((e) => e.field === key || e.field.startsWith(`${key}.`))?.message;
  const methods = [
    ...(engine.data?.methods ?? []).map((m) => ({
      key: m.key,
      label: `${m.label} (${m.release})`,
    })),
    ...(engine.data?.detectors ?? [])
      .filter(
        (d) =>
          d.loaded &&
          d.method &&
          d.method !== "*" &&
          !["threshold", "rolling", "peer"].includes(d.method),
      )
      .map((d) => ({ key: d.method, label: `${d.method_label} — ${d.name}` })),
  ];
  const numberValue = (key: NumberKey) => draft[key];
  const setNumber = (key: NumberKey, value: string) =>
    setDraft({ ...draft, [key]: value === "" ? ("" as unknown as number) : Number(value) });
  const setBand = (band: "medium" | "high" | "critical", value: string) =>
    setDraft({ ...draft, severity_bands: { ...draft.severity_bands, [band]: Number(value) } });

  const submit = () => {
    setErrors([]);
    setMessage(null);
    const value: AnomalySettings = {
      ...draft,
      detectors: detectorsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    };
    save.mutate(value, {
      onSuccess: () => setMessage("Saved. The next scan uses these settings."),
      onError: (e) => {
        if (e instanceof SettingsValidationError) setErrors(e.errors);
        else if (e instanceof ApiError && e.fields.length) setErrors(e.fields);
        setMessage(errorMessage(e));
      },
    });
  };

  return (
    <SectionCard title="AI alert thresholds & baselines">
      <div className="space-y-5 text-xs">
        <p className="text-[#526174] dark:text-slate-400">
          Alert sensitivity for AI Decision Support (REQ-AI-012). Changes apply to the next
          detection run — no code change or deploy. AI outputs stay advisory (REQ-AI-002).
          {!canEdit && " View only — Technical/Admin users can change these settings."}
        </p>

        <Field
          label="Active baseline method (REQ-AI-011)"
          hint="Every alert shows the method that produced it. Participants without enough data for R2/R3 fall back automatically."
          error={fieldError("baseline_method")}
        >
          <select
            className={inputCls}
            disabled={!canEdit}
            value={draft.baseline_method}
            onChange={(e) => setDraft({ ...draft, baseline_method: e.target.value })}
          >
            {methods.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
            {!methods.some((m) => m.key === draft.baseline_method) && (
              <option value={draft.baseline_method}>{draft.baseline_method}</option>
            )}
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {NUMBER_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} error={fieldError(f.key)}>
              <input
                type="number"
                step={f.step ?? 1}
                className={inputCls}
                disabled={!canEdit}
                value={numberValue(f.key)}
                onChange={(e) => setNumber(f.key, e.target.value)}
              />
            </Field>
          ))}
        </div>

        <Field
          label="Severity bands (multiples of the trigger threshold)"
          hint="A signal just past its threshold is LOW; at these multiples it becomes MEDIUM, HIGH and CRITICAL."
          error={fieldError("severity_bands")}
        >
          <div className="grid grid-cols-3 gap-2">
            {(["medium", "high", "critical"] as const).map((band) => (
              <div key={band}>
                <span className="block text-[10px] uppercase tracking-wider text-[#7B8798] mb-0.5">
                  {band}
                </span>
                <input
                  type="number"
                  step={0.1}
                  className={inputCls}
                  disabled={!canEdit}
                  value={draft.severity_bands[band]}
                  onChange={(e) => setBand(band, e.target.value)}
                />
              </div>
            ))}
          </div>
        </Field>

        <Field
          label="Detectors (REQ-AI-010)"
          hint="One import path per line (app.services.detectors.<module>:<Detector>). Add a statistical or ML detector by dropping a module into that package and listing it here."
          error={fieldError("detectors")}
        >
          <textarea
            rows={4}
            className={`${inputCls} h-auto py-2 font-mono text-[11px]`}
            disabled={!canEdit}
            value={detectorsText}
            onChange={(e) => setDetectorsText(e.target.value)}
          />
        </Field>
        {engine.data && (
          <ul className="space-y-1 text-[11px] text-[#526174] dark:text-slate-400">
            {engine.data.detectors.map((d) => (
              <li key={d.path}>
                <span
                  className={
                    d.loaded
                      ? "text-[#0E7A57] dark:text-emerald-300"
                      : "text-[#B4233F] dark:text-rose-300"
                  }
                >
                  {d.loaded ? "Loaded" : "Not loaded"}
                </span>{" "}
                <code className="font-mono">{d.path}</code>
                {d.loaded ? ` — ${d.name} (${d.method_label})` : ` — ${d.error}`}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="flex items-center gap-3">
            <PrimaryButton
              icon={<Save className="h-4 w-4" />}
              disabled={save.isPending}
              onClick={submit}
            >
              {save.isPending ? "Saving…" : "Save AI settings"}
            </PrimaryButton>
            {message && (
              <span
                className={
                  errors.length || save.isError
                    ? "text-[#B4233F] dark:text-rose-300"
                    : "text-[#0E7A57] dark:text-emerald-300"
                }
              >
                {message}
              </span>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
