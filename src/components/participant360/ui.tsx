// Small shared pieces for the Participant 360 sections.
import type { ReactNode } from "react";
import { BAND_STYLE, PENDING_STYLE, type RiskBand } from "@/lib/participant360";

export function Pill({
  className,
  children,
  title,
}: {
  className: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

/** A score with its band, or the REQ-P360-012 pending label. */
export function RiskBadge({
  composite,
  band,
  pendingLabel = "Score pending",
}: {
  composite: number | null | undefined;
  band: RiskBand | null | undefined;
  pendingLabel?: string;
}) {
  if (composite === null || composite === undefined || !band) {
    return <Pill className={PENDING_STYLE}>{pendingLabel}</Pill>;
  }
  return (
    <Pill className={BAND_STYLE[band]}>
      {composite.toFixed(1)} · {band}
    </Pill>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-[#526174] dark:text-slate-400 py-2">{children}</p>;
}

export function Stat({
  label,
  value,
  sub,
  title,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-[#DCE3E8] dark:border-slate-700 min-w-0"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#7B8798] block">
        {label}
      </span>
      <span className="text-lg font-bold font-mono text-[#172033] dark:text-slate-100 block">
        {value}
      </span>
      {sub && (
        <span className="text-[11px] text-[#526174] dark:text-slate-400 block mt-0.5">{sub}</span>
      )}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#7B8798]">{label}</dt>
      <dd className="text-xs text-[#172033] dark:text-slate-100 mt-0.5 break-words">{children}</dd>
    </div>
  );
}

export function LoadError({ error }: { error: unknown }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
      {error instanceof Error ? error.message : "Couldn't load this section."}
    </div>
  );
}
