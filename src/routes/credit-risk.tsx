import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";

export const Route = createFileRoute("/credit-risk")({
  component: CreditRisk,
});

const BORROWERS = [
  { id: "B-1043", score: 712, band: "good" as const, pd: "1.2%", confidence: 0.91 },
  { id: "B-1044", score: 548, band: "watch" as const, pd: "6.8%", confidence: 0.84 },
  { id: "B-1045", score: 491, band: "high" as const, pd: "11.4%", confidence: 0.83 },
  { id: "B-1046", score: 705, band: "good" as const, pd: "1.4%", confidence: 0.88 },
  { id: "B-1047", score: 612, band: "watch" as const, pd: "3.9%", confidence: 0.79 },
  { id: "B-1048", score: 458, band: "high" as const, pd: "14.1%", confidence: 0.81 },
  { id: "B-1049", score: 689, band: "good" as const, pd: "1.8%", confidence: 0.86 },
];

const BAND_TONE = {
  good:  { tone: "ok",   label: "good" },
  watch: { tone: "warn", label: "watch" },
  high:  { tone: "fail", label: "high risk" },
};

function CreditRisk() {
  const { role } = useRole();
  const masked = role === "regulator" || role === "analyst";
  const [sel, setSel] = useState("B-1045");
  const borrower = BORROWERS.find((b) => b.id === sel)!;

  return (
    <AppShell
      title="Credit Risk · Portfolio"
      breadcrumb="DECIDE › CREDIT RISK"
      toolbar={
        <>
          <span className="font-mono text-[11px] rounded-md bg-paper border border-border px-2 py-0.5">scope: my portfolio ▾</span>
          <span className="font-mono text-[11px] rounded-md bg-paper border border-border px-2 py-0.5">segment: SME ▾</span>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" /> live · 12:04 · model v2.3
          </span>
        </>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-display font-600 text-[15px] mb-3">PD distribution</h3>
          <PdHistogram />
          <div className="flex justify-between mt-2 text-[11px] font-mono text-muted-foreground">
            <span>low risk</span><span>high risk</span>
          </div>
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">Click a band to filter borrowers.</p>
        </div>

        <div className="xl:col-span-2 rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-mono uppercase text-muted-foreground bg-paper">
                <th className="text-left px-4 py-2 font-normal">ID</th>
                <th className="text-left px-4 py-2 font-normal">Score</th>
                <th className="text-left px-4 py-2 font-normal">Band</th>
                <th className="text-left px-4 py-2 font-normal">PD</th>
                <th className="text-right px-4 py-2 font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {BORROWERS.map((b) => {
                const meta = BAND_TONE[b.band];
                return (
                  <tr
                    key={b.id}
                    onClick={() => setSel(b.id)}
                    className={`border-t border-border cursor-pointer hover:bg-paper ${sel === b.id ? "bg-paper" : ""}`}
                  >
                    <td className="px-4 py-3 font-mono">{masked && role === "analyst" ? "••••" : b.id}</td>
                    <td className="px-4 py-3 tabular font-medium">{b.score}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11px] bg-${meta.tone}-bg text-${meta.tone}`}>
                        ● {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular">{b.pd}</td>
                    <td className="px-4 py-3 text-right text-xs text-info">open ›</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-5 max-w-3xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-[11px] text-muted-foreground">BORROWER · DETAIL</div>
            <h3 className="font-display font-600 text-[18px]">
              {masked && role === "analyst" ? "••••" : borrower.id}
            </h3>
            <div className="mt-1 text-sm">
              score <span className="font-display text-[22px] tabular font-600">{borrower.score}</span> ·
              band <span className="text-fail font-medium">{BAND_TONE[borrower.band].label}</span>
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-muted-foreground">
            <div>model v2.3</div>
            <div>scored 12:01</div>
            <div>confidence {borrower.confidence.toFixed(2)}</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-xs font-mono uppercase text-muted-foreground mb-2">Top factors (explainability · SYS-11)</h4>
          <ul className="space-y-2">
            <Factor name="Debt-to-income ratio" tone="fail" weight={0.34} />
            <Factor name="Thin credit file" tone="warn" weight={0.21} />
            <Factor name="Recent arrears" tone="fail" weight={0.28} />
            <Factor name="Stable employment" tone="ok" weight={0.12} />
          </ul>
          <p className="mt-4 font-mono text-[11px] text-muted-foreground">
            BR-06 · FR-RISK-01 · NFR-PRIV-01 — values masked per consent/sensitivity for restricted roles.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function Factor({ name, tone, weight }: { name: string; tone: "ok" | "warn" | "fail"; weight: number }) {
  return (
    <li className="grid grid-cols-[1fr_auto] gap-3 items-center">
      <div className="min-w-0">
        <div className="text-sm">{name}</div>
        <div className="mt-1 h-1.5 rounded-full bg-paper overflow-hidden">
          <div className={`h-full bg-${tone}`} style={{ width: `${weight * 100}%` }} />
        </div>
      </div>
      <span className={`font-mono text-[11px] text-${tone}`}>+{tone === "ok" ? "stabilizes" : tone === "warn" ? "med" : "high"}</span>
    </li>
  );
}

function PdHistogram() {
  const bars = [3, 6, 12, 18, 22, 19, 14, 9, 5, 3];
  const max = Math.max(...bars);
  return (
    <div className="flex items-end gap-1 h-32">
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-brand/70 hover:bg-brand cursor-pointer transition-colors"
          style={{ height: `${(b / max) * 100}%` }}
          title={`${b} borrowers`}
        />
      ))}
    </div>
  );
}
