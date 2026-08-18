import { CheckCircle2, Loader2, Clock, AlertTriangle, XCircle, Circle, Check, Pause } from "lucide-react";
import type { ReactNode } from "react";

export type Status =
  | "healthy"
  | "running"
  | "queued"
  | "warning"
  | "failed"
  | "draft"
  | "completed"
  | "active"
  | "paused";

type StatusStyle = {
  cls: string;
  dotCls: string;
  icon: ReactNode;
  label: string;
};

const MAP: Record<Status, StatusStyle> = {
  healthy:   { cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 shadow-xs shadow-emerald-500/10", dotCls: "bg-emerald-500", icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Healthy" },
  completed: { cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 shadow-xs shadow-emerald-500/10", dotCls: "bg-emerald-500", icon: <Check className="h-3.5 w-3.5" />, label: "Completed" },
  active:    { cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 shadow-xs shadow-emerald-500/10", dotCls: "bg-emerald-500", icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Active" },
  running:   { cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 shadow-xs shadow-sky-500/10", dotCls: "bg-sky-500 animate-pulse", icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />, label: "Running" },
  queued:    { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 shadow-xs shadow-amber-500/10", dotCls: "bg-amber-500", icon: <Clock className="h-3.5 w-3.5" />, label: "Queued" },
  warning:   { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 shadow-xs shadow-amber-500/10", dotCls: "bg-amber-500 animate-bounce", icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Warning" },
  failed:    { cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 shadow-xs shadow-rose-500/10", dotCls: "bg-rose-500", icon: <XCircle className="h-3.5 w-3.5" />, label: "Failed" },
  draft:     { cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30 shadow-xs shadow-slate-500/10", dotCls: "bg-slate-400", icon: <Circle className="h-3.5 w-3.5" />, label: "Draft" },
  paused:    { cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30 shadow-xs shadow-slate-500/10", dotCls: "bg-slate-400", icon: <Pause className="h-3.5 w-3.5" />, label: "Paused" },
};

export function StatusBadge({ status, children }: { status: Status; children?: ReactNode }) {
  const s = MAP[status] ?? MAP.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-bold px-3 py-1 rounded-full border whitespace-nowrap transition-all duration-200 hover:scale-105 select-none ${s.cls}`}
    >
      {s.icon}
      <span>{children ?? s.label}</span>
    </span>
  );
}

/* Dot-only variant for compact usage */
export function StatusDot({ status }: { status: Status }) {
  const s = MAP[status] ?? MAP.draft;
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full shrink-0 inline-block border border-white/40 shadow-xs ${s.dotCls}`}
    />
  );
}
