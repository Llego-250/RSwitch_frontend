import { ArrowUp, ArrowDown, Info } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  delta?: { dir: "up" | "down"; text: string; tone?: "good" | "bad" | "neutral" };
  source: string;
  freshness?: "live" | "stale";
  updated: string;
  version?: string;
  masked?: boolean;
};

export function KpiCard({ label, value, delta, source, freshness = "live", updated, version, masked }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <Info className="h-3.5 w-3.5 opacity-50" />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="font-display text-[30px] font-600 leading-none tabular text-foreground">
          {masked ? <span className="font-mono text-muted-foreground">••••</span> : value}
        </div>
        {delta && (
          <span
            className={`inline-flex items-center gap-0.5 font-mono text-xs ${
              delta.tone === "bad" ? "text-fail" : delta.tone === "good" ? "text-ok" : "text-muted-foreground"
            }`}
          >
            {delta.dir === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {delta.text}
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-0.5 font-mono text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              freshness === "live" ? "bg-signal" : "bg-warn"
            }`}
            aria-hidden
          />
          <span>{freshness} · {source}</span>
        </div>
        <span>updated {updated}{version ? ` · ${version}` : ""}</span>
      </div>
    </div>
  );
}
