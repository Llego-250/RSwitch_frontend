import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Brain, GitBranch } from "lucide-react";

export const Route = createFileRoute("/ai")({
  component: AIPage,
});

const MODELS = [
  { id: "credit-pd",     ver: "v2.3", stage: "Production", drift: "0.02", status: "healthy" as const, owner: "RiskOps" },
  { id: "fraud-score",   ver: "v1.7", stage: "Production", drift: "0.11", status: "warning" as const, owner: "FraudOps" },
  { id: "churn-lite",    ver: "v0.4", stage: "Staging",    drift: "—",    status: "running" as const, owner: "Growth" },
  { id: "kyc-doc-class", ver: "v3.0", stage: "Production", drift: "0.04", status: "healthy" as const, owner: "ComplyOps" },
  { id: "income-est",    ver: "v0.9", stage: "Draft",      drift: "—",    status: "draft"   as const, owner: "Inclusion" },
];

function AIPage() {
  return (
    <AppShell
      title="AI Decision Support"
      breadcrumb="DECIDE › AI"
      primaryAction={<button className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm">Register model</button>}
      toolbar={
        <span className="ml-auto font-mono text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" /> registry sync 12:00
        </span>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Registered models" value="23" source="registry" updated="12:00" />
        <KpiCard label="In production"     value="9"  source="registry" updated="12:00" />
        <KpiCard label="Drift alerts (24h)" value="2" delta={{ dir: "up", text: "+1", tone: "bad" }} source="monitor" updated="11:48" />
        <KpiCard label="Avg explainability" value="0.87" source="xai-svc" updated="11:50" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border font-display font-600 text-[15px] flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" /> Model registry
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-mono uppercase text-muted-foreground bg-paper">
                <th className="text-left px-4 py-2 font-normal">Model</th>
                <th className="text-left px-4 py-2 font-normal">Ver</th>
                <th className="text-left px-4 py-2 font-normal">Stage</th>
                <th className="text-left px-4 py-2 font-normal">Drift</th>
                <th className="text-left px-4 py-2 font-normal">Owner</th>
                <th className="text-left px-4 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {MODELS.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono">{m.id}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{m.ver}</td>
                  <td className="px-4 py-3">{m.stage}</td>
                  <td className="px-4 py-3 tabular">{m.drift}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.owner}</td>
                  <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="font-display font-600 text-[15px] mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" /> Scenarios
          </div>
          <ul className="space-y-3 text-sm">
            <li className="rounded border border-border p-3">
              <div className="font-medium">Rate shock +200bps</div>
              <div className="font-mono text-[11px] text-muted-foreground mt-1">credit-pd · run 11:52 · loss Δ +$ 2.4M</div>
            </li>
            <li className="rounded border border-border p-3">
              <div className="font-medium">Unemployment +1.5%</div>
              <div className="font-mono text-[11px] text-muted-foreground mt-1">credit-pd · run 10:18 · loss Δ +$ 1.1M</div>
            </li>
            <li className="rounded border border-border p-3">
              <div className="font-medium">FX shock EUR/USD −5%</div>
              <div className="font-mono text-[11px] text-muted-foreground mt-1">queued · scheduled 14:00</div>
            </li>
          </ul>
          <div className="mt-5 pt-4 border-t border-border font-mono text-[11px] text-muted-foreground">
            FR-AI-01 · SYS-11 · BR-08
          </div>
        </div>
      </div>
    </AppShell>
  );
}
