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

  const topGlowColor = isGood
    ? "from-emerald-500/80 via-emerald-400/40 to-transparent"
    : isBad
    ? "from-rose-500/80 via-rose-400/40 to-transparent"
    : "from-[#56B4D3]/80 via-[#56B4D3]/40 to-transparent";

  return (
    <div
      onClick={onClick}
      className={`relative rounded-2xl p-5 flex flex-col justify-between overflow-hidden bg-white dark:bg-slate-900 border-2 border-slate-300/80 dark:border-slate-700/80 shadow-sm hover:shadow-xl hover:shadow-slate-500/10 dark:hover:shadow-black/40 transition-all duration-300 select-none group ${
        onClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"
      }`}
    >
      {/* Top subtle accent gradient glow line */}
      <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${topGlowColor} opacity-90 group-hover:opacity-100 transition-opacity`} />

      {/* Top row: label + trend */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-black tracking-widest uppercase text-slate-700 dark:text-slate-200 font-mono">
          {label}
        </span>
        {delta ? (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-black font-mono px-2.5 py-0.5 rounded-full border shadow-2xs transition-transform duration-200 group-hover:scale-105 ${
              isGood
                ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40"
                : isBad
                ? "bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-500/40"
                : "bg-slate-500/20 text-slate-800 dark:text-slate-200 border-slate-500/40"
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
          <div className="h-6 w-6 rounded-full bg-slate-200/80 dark:bg-slate-700 flex items-center justify-center">
            <Info className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
          </div>
        )}
      </div>

      {/* Middle: value */}
      <div className="my-3.5 flex items-baseline gap-1.5">
        <div className="font-mono font-black text-3xl lg:text-3.5xl tracking-tight text-slate-900 dark:text-white leading-none group-hover:text-[#267A99] dark:group-hover:text-[#56B4D3] transition-colors">
          {masked ? "••••••" : value}
        </div>
      </div>

      {/* Bottom: context / source / freshness */}
      <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate pt-2 border-t border-slate-200 dark:border-slate-800">
        <span
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
            freshness === "live"
              ? "bg-emerald-500 animate-pulse shadow-xs shadow-emerald-500/80"
              : "bg-amber-500"
          }`}
        />
        <span className="truncate font-bold text-slate-600 dark:text-slate-300">
          {context ?? (source ? `${freshness} · ${source}` : freshness)}
          {updated && ` · ${updated}`}
        </span>
      </div>
    </div>
  );
}
