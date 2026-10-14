// The frame every dashboard widget sits in: title, the §15 description, and
// the widget's own period and scope pickers (REQ-DASH-010) — changing them
// refetches only with the new settings, the page never navigates away.
import type { ReactNode } from "react";
import { ArrowUpRight, CalendarRange, Loader2 } from "lucide-react";
import { useOpenLink, type OptionSet, type Widget } from "@/lib/dashboard";

const pickerCls =
  "h-7 pl-2 pr-6 rounded-lg bg-slate-50 dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[11px] font-semibold text-[#526174] dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40 cursor-pointer";

function Picker({
  label,
  option,
  onChange,
}: {
  label: string;
  option: OptionSet;
  onChange: (value: string | number) => void;
}) {
  if (option.overridden) {
    return (
      <span
        title="The dashboard date range applies to this widget"
        className="inline-flex items-center gap-1 h-7 px-2 rounded-lg bg-[#E7F5F8] text-[#0F6F83] text-[11px] font-semibold dark:bg-cyan-950/40 dark:text-cyan-300"
      >
        <CalendarRange className="h-3 w-3" />
        Date range
      </span>
    );
  }
  return (
    <select
      aria-label={label}
      value={String(option.value)}
      onChange={(e) => {
        const choice = option.choices.find((c) => String(c.value) === e.target.value);
        if (choice) onChange(choice.value);
      }}
      className={pickerCls}
    >
      {option.choices.map((c) => (
        <option key={String(c.value)} value={String(c.value)}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

export function WidgetCard({
  widget,
  onSetting,
  busy,
  children,
  className = "",
}: {
  widget: Widget;
  onSetting: (name: "period" | "scope", value: string | number) => void;
  busy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const open = useOpenLink();
  return (
    <section
      aria-labelledby={`w-${widget.key}`}
      className={`rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE3E8] dark:border-slate-800 shadow-2xs flex flex-col min-w-0 ${className}`}
    >
      <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0">
          <h3
            id={`w-${widget.key}`}
            className="font-bold text-[15px] text-[#172033] dark:text-white flex items-center gap-2"
          >
            {widget.title}
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#168FA8]" />}
          </h3>
          <p className="text-[11px] text-[#7B8798] mt-0.5 leading-snug">{widget.description}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {widget.period && (
            <Picker
              label={`${widget.title} period`}
              option={widget.period}
              onChange={(v) => onSetting("period", v)}
            />
          )}
          {widget.scope && (
            <Picker
              label={`${widget.title} scope`}
              option={widget.scope}
              onChange={(v) => onSetting("scope", v)}
            />
          )}
          {widget.link && (
            <button
              onClick={() => open(widget.link)}
              aria-label={`Open ${widget.title}`}
              title="Open the module"
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-[#168FA8] hover:bg-[#E7F5F8] dark:hover:bg-cyan-950/40 cursor-pointer"
            >
              <ArrowUpRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>
      <div className="px-5 py-4 flex-1 min-w-0">{children}</div>
      {widget.note && (
        <p className="px-5 pb-3 text-[10.5px] text-[#7B8798] leading-snug">{widget.note}</p>
      )}
    </section>
  );
}

/** Big number with its caption (a stat tile, not a chart). */
export function Stat({
  value,
  label,
  tone = "default",
}: {
  value: ReactNode;
  label: ReactNode;
  tone?: "default" | "bad" | "warn" | "good";
}) {
  const color = {
    default: "text-[#172033] dark:text-white",
    bad: "text-[#DC3154]",
    warn: "text-[#B45309] dark:text-amber-300",
    good: "text-[#12825E] dark:text-emerald-300",
  }[tone];
  return (
    <div className="min-w-0">
      <div className={`font-bold text-[30px] leading-none tracking-tight tabular-nums ${color}`}>
        {value}
      </div>
      <div className="text-[11px] font-medium text-[#526174] dark:text-slate-400 mt-1.5">
        {label}
      </div>
    </div>
  );
}

export interface Segment {
  label: string;
  value: number;
  className: string; // fill colour
}

/** A 100% bar with each segment labelled in the legend below — counts are
 * always shown as text, never by colour alone. */
export function SegmentBar({ segments, empty }: { segments: Segment[]; empty: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return <p className="text-xs text-[#7B8798] py-2">{empty}</p>;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.label}
              title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
              className={`h-full first:rounded-l-full last:rounded-r-full ${s.className}`}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs min-w-0">
            <span className={`h-2.5 w-2.5 rounded-sm shrink-0 ${s.className}`} aria-hidden />
            <span className="text-[#526174] dark:text-slate-300 truncate">{s.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-[#172033] dark:text-white">
              {s.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-[#7B8798] py-3">{children}</p>;
}

export function Caption({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-[#7B8798] mt-3">{children}</p>;
}
