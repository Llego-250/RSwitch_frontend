import { TrendingUp, TrendingDown, Info } from "lucide-react";
import type { ReactNode } from "react";

type Delta = {
  dir: "up" | "down";
  text: string;
  tone?: "good" | "bad" | "neutral";
};

type Props = {
  label: string;
  value: ReactNode;
  delta?: Delta;
  context?: string;
  source?: string;
  freshness?: "live" | "stale" | "delayed";
  updated?: string;
  masked?: boolean;
  onClick?: () => void;
};

const FRESHNESS_COLOR: Record<string, string> = {
  live:    "#0D9488",
  stale:   "#D97706",
  delayed: "#D97706",
};

export function KpiCard({
  label,
  value,
  delta,
  context,
  source,
  freshness = "live",
  updated,
  masked,
  onClick,
}: Props) {
  const dotColor = FRESHNESS_COLOR[freshness] ?? "#0D9488";

  const deltaColor =
    delta?.tone === "good"
      ? "#0D9488"
      : delta?.tone === "bad"
      ? "#E11D48"
      : "#6B7280";

  return (
    <div
      className="rounded-lg p-5 flex flex-col gap-0 transition-shadow cursor-default select-none"
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
      }}
      onClick={onClick}
      onMouseEnter={e => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.boxShadow =
            "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)";
          (e.currentTarget as HTMLElement).style.cursor = "pointer";
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {/* Top row: label + trend */}
      <div className="flex items-center justify-between">
        <span
          className="text-[12px] font-medium tracking-wide"
          style={{ color: "var(--neutral-500)" }}
        >
          {label}
        </span>
        {delta ? (
          <span
            className="inline-flex items-center gap-0.5 text-[11px] font-medium font-mono"
            style={{ color: deltaColor }}
          >
            {delta.dir === "up" ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {delta.text}
          </span>
        ) : (
          <Info className="h-3.5 w-3.5" style={{ color: "var(--neutral-400)" }} />
        )}
      </div>

      {/* Middle: value */}
      <div className="mt-3 flex items-baseline gap-1.5">
        <div
          className="font-mono tabular leading-none"
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: masked ? "var(--neutral-400)" : "var(--neutral-900)",
            letterSpacing: "-0.02em",
          }}
        >
          {masked ? "••••••" : value}
        </div>
      </div>

      {/* Bottom: context / source / freshness */}
      <div className="mt-3 flex items-center gap-1.5 font-mono text-[11px]"
        style={{ color: "var(--neutral-400)" }}>
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <span className="truncate">
          {context ?? (source ? `${freshness} · ${source}` : freshness)}
          {updated && ` · ${updated}`}
        </span>
      </div>
    </div>
  );
}
