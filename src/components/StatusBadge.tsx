import { Check, Loader2, Clock, AlertTriangle, XCircle, Circle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

export type Status = "healthy" | "running" | "queued" | "warning" | "failed" | "draft" | "completed";

const MAP: Record<Status, { fg: string; bg: string; icon: ReactNode; label: string }> = {
  healthy:   { fg: "text-ok",      bg: "bg-ok-bg",      icon: <CheckCircle2 className="h-3 w-3" />, label: "healthy" },
  completed: { fg: "text-ok",      bg: "bg-ok-bg",      icon: <Check className="h-3 w-3" />,        label: "done" },
  running:   { fg: "text-info",    bg: "bg-info-bg",    icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "running" },
  queued:    { fg: "text-warn",    bg: "bg-warn-bg",    icon: <Clock className="h-3 w-3" />,        label: "queued" },
  warning:   { fg: "text-warn",    bg: "bg-warn-bg",    icon: <AlertTriangle className="h-3 w-3" />, label: "warning" },
  failed:    { fg: "text-fail",    bg: "bg-fail-bg",    icon: <XCircle className="h-3 w-3" />,      label: "failed" },
  draft:     { fg: "text-neutral", bg: "bg-neutral-bg", icon: <Circle className="h-3 w-3" />,       label: "draft" },
};

export function StatusBadge({ status, children }: { status: Status; children?: ReactNode }) {
  const s = MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium ${s.fg} ${s.bg}`}
    >
      {s.icon}
      <span>{children ?? s.label}</span>
    </span>
  );
}
