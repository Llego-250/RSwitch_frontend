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
  healthy:   { cls: "bg-[#E8F7F1] text-[#16A979] border-[#16A979]/30", dotCls: "bg-[#16A979]", icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Healthy" },
  completed: { cls: "bg-[#E8F7F1] text-[#16A979] border-[#16A979]/30", dotCls: "bg-[#16A979]", icon: <Check className="h-3.5 w-3.5" />, label: "Completed" },
  active:    { cls: "bg-[#E8F7F1] text-[#16A979] border-[#16A979]/30", dotCls: "bg-[#16A979]", icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Active" },
  running:   { cls: "bg-[#E7F5F8] text-[#168FA8] border-[#168FA8]/30", dotCls: "bg-[#168FA8] animate-pulse", icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-[#168FA8]" />, label: "Running" },
  queued:    { cls: "bg-[#FFF3DF] text-[#D97706] border-[#D97706]/30", dotCls: "bg-[#D97706]", icon: <Clock className="h-3.5 w-3.5" />, label: "Queued" },
  warning:   { cls: "bg-[#FFF3DF] text-[#D97706] border-[#D97706]/30", dotCls: "bg-[#D97706]", icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Warning" },
  failed:    { cls: "bg-[#FDECEF] text-[#DC3154] border-[#DC3154]/30", dotCls: "bg-[#DC3154]", icon: <XCircle className="h-3.5 w-3.5" />, label: "Failed" },
  draft:     { cls: "bg-slate-100 text-[#526174] border-slate-300", dotCls: "bg-[#7B8798]", icon: <Circle className="h-3.5 w-3.5" />, label: "Draft" },
  paused:    { cls: "bg-slate-100 text-[#526174] border-slate-300", dotCls: "bg-[#7B8798]", icon: <Pause className="h-3.5 w-3.5" />, label: "Paused" },
};

export function StatusBadge({ status, children }: { status: Status; children?: ReactNode }) {
  const s = MAP[status] ?? MAP.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-sans text-xs font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap transition-all select-none ${s.cls}`}
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
      className={`h-2.5 w-2.5 rounded-full shrink-0 inline-block border border-white/40 ${s.dotCls}`}
    />
  );
}
