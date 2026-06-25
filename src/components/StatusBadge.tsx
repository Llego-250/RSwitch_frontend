import { CheckCircle2, Loader2, Clock, AlertTriangle, XCircle, Circle, Check } from "lucide-react";
import type { ReactNode } from "react";

export type Status =
  | "healthy"
  | "running"
  | "queued"
  | "warning"
  | "failed"
  | "draft"
  | "completed"
  | "active";

type Variant = {
  fg: string;
  bg: string;
  icon: ReactNode;
  label: string;
};

const MAP: Record<Status, Variant> = {
  healthy:   { fg: "#0D9488", bg: "#CCFBF1", icon: <CheckCircle2 className="h-3 w-3" />, label: "Healthy"   },
  completed: { fg: "#0D9488", bg: "#CCFBF1", icon: <Check        className="h-3 w-3" />, label: "Completed" },
  active:    { fg: "#0D9488", bg: "#CCFBF1", icon: <CheckCircle2 className="h-3 w-3" />, label: "Active"    },
  running:   { fg: "#2D6A9F", bg: "#E8F1FA", icon: <Loader2      className="h-3 w-3 animate-spin" />, label: "Running"  },
  queued:    { fg: "#D97706", bg: "#FEF3C7", icon: <Clock        className="h-3 w-3" />, label: "Queued"    },
  warning:   { fg: "#D97706", bg: "#FEF3C7", icon: <AlertTriangle className="h-3 w-3" />, label: "Warning"  },
  failed:    { fg: "#E11D48", bg: "#FFE4E6", icon: <XCircle      className="h-3 w-3" />, label: "Failed"    },
  draft:     { fg: "#6B7280", bg: "#F3F4F6", icon: <Circle       className="h-3 w-3" />, label: "Draft"     },
};

export function StatusBadge({ status, children }: { status: Status; children?: ReactNode }) {
  const s = MAP[status] ?? MAP.draft;
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium whitespace-nowrap"
      style={{
        color: s.fg,
        backgroundColor: s.bg,
        borderRadius: "4px",
        padding: "3px 8px",
        lineHeight: "1.4",
      }}
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
      className="h-2 w-2 rounded-full shrink-0 inline-block"
      style={{ backgroundColor: s.fg }}
    />
  );
}
