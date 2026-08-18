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
  icon: ReactNode;
  label: string;
};

const MAP: Record<Status, StatusStyle> = {
  healthy:   { cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", icon: <CheckCircle2 className="h-3 w-3" />, label: "Healthy" },
  completed: { cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", icon: <Check className="h-3 w-3" />, label: "Completed" },
  active:    { cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", icon: <CheckCircle2 className="h-3 w-3" />, label: "Active" },
  running:   { cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20", icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Running" },
  queued:    { cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20", icon: <Clock className="h-3 w-3" />, label: "Queued" },
  warning:   { cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20", icon: <AlertTriangle className="h-3 w-3" />, label: "Warning" },
  failed:    { cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20", icon: <XCircle className="h-3 w-3" />, label: "Failed" },
  draft:     { cls: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20", icon: <Circle className="h-3 w-3" />, label: "Draft" },
  paused:    { cls: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20", icon: <Pause className="h-3 w-3" />, label: "Paused" },
};

export function StatusBadge({ status, children }: { status: Status; children?: ReactNode }) {
  const s = MAP[status] ?? MAP.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap transition-all ${s.cls}`}
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
      className={`h-2 w-2 rounded-full shrink-0 inline-block border ${s.cls}`}
    />
  );
}
