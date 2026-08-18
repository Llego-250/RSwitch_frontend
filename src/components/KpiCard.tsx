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
  const isGood = delta?.tone === "good";
  const isBad  = delta?.tone === "bad";

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-5 flex flex-col justify-between bg-white/95 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:shadow-md transition-all duration-200 select-none ${
        onClick ? "cursor-pointer hover:-translate-y-0.5" : "cursor-default"
      }`}
    >
      {/* Top row: label + trend */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {delta ? (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border ${
              isGood
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : isBad
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
            }`}
          >
            {delta.dir === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta.text}
          </span>
        ) : (
          <Info className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
        )}
      </div>

      {/* Middle: value */}
      <div className="my-3 flex items-baseline gap-1.5">
        <div className="font-mono font-extrabold text-2xl lg:text-3xl tracking-tight text-slate-900 dark:text-white leading-none">
          {masked ? "••••••" : value}
        </div>
      </div>

      {/* Bottom: context / source / freshness */}
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400 dark:text-slate-500 truncate">
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            freshness === "live"
              ? "bg-emerald-500 animate-pulse"
              : "bg-amber-500"
          }`}
        />
        <span className="truncate">
          {context ?? (source ? `${freshness} · ${source}` : freshness)}
          {updated && ` · ${updated}`}
        </span>
      </div>
    </div>
  );
}
