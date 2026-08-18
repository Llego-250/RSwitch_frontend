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

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-5 flex flex-col justify-between bg-white dark:bg-slate-900 border border-[#DCE3E8] dark:border-slate-800 shadow-2xs hover:shadow-md transition-all duration-200 select-none group ${
        onClick ? "cursor-pointer hover:-translate-y-0.5" : "cursor-default"
      }`}
    >
      {/* Top row: label + trend */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-[#526174] dark:text-slate-300 font-sans leading-tight">
          {label}
        </span>
        {delta ? (
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
              isGood
                ? "bg-[#E8F7F1] text-[#16A979] border-[#16A979]/30"
                : isBad
                ? "bg-[#FDECEF] text-[#DC3154] border-[#DC3154]/30"
                : "bg-slate-100 text-[#526174] border-slate-300"
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
          <div className="h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Info className="h-3.5 w-3.5 text-[#7B8798]" />
          </div>
        )}
      </div>

      {/* Middle: metric value (Inter 700, size 34px, Deep Navy) */}
      <div className="my-3 flex items-baseline gap-1.5">
        <div className="font-sans font-bold text-[34px] tracking-tight text-[#172033] dark:text-white leading-none">
          {masked ? "••••••" : value}
        </div>
      </div>

      {/* Bottom: subtext (Inter 400-500, size 12px, Slate) */}
      <div className="flex items-center gap-2 font-sans text-xs text-[#526174] dark:text-slate-400 truncate pt-2 border-t border-slate-100 dark:border-slate-800">
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${
            freshness === "live"
              ? "bg-[#16A979]"
              : "bg-[#D97706]"
          }`}
        />
        <span className="truncate font-medium text-[#526174] dark:text-slate-300">
          {context ?? (source ? `${freshness} · ${source}` : freshness)}
          {updated && ` · ${updated}`}
        </span>
      </div>
    </div>
  );
}
