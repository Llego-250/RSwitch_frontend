import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/governance")({
  head: () => ({ meta: [{ title: "Governance · Financial Interop" }] }),
  component: Governance,
});

const POLICIES = [
  { id: "POL-001", name: "PII masking — analyst role",   owner: "Data Office", status: "healthy" as const, last: "2d ago" },
  { id: "POL-002", name: "Cross-border transfer block",  owner: "Compliance",  status: "healthy" as const, last: "5d ago" },
  { id: "POL-003", name: "Retention · transaction logs", owner: "Risk",        status: "warning" as const, last: "12d ago" },
  { id: "POL-004", name: "Model approval gate",          owner: "ModelOps",    status: "healthy" as const, last: "1d ago" },
];

const LINEAGE = [
  "core-banking.txns ─▶ stg.txns ─▶ unified.entity ─▶ risk.pd_model · v2.3",
  "cards-api.events ─▶ stg.cards ─▶ unified.entity ─▶ fraud.score · v1.7",
  "bureau.scores    ─▶ ref.bureau ─▶ unified.entity ─▶ credit.decision",
];

function Governance() {
  return (
    <AppShell
      title="Governance"
      breadcrumb="GOVERN › POLICIES & LINEAGE"
      primaryAction={<button className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm">New policy</button>}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Active policies" value="42" source="policy-svc" updated="12:04" />
        <KpiCard label="Datasets governed" value="187" source="catalog" updated="12:00" />
        <KpiCard label="Open exceptions" value="3" delta={{ dir: "up", text: "+1", tone: "bad" }} source="audit" updated="11:55" />
        <KpiCard label="Stewards" value="14" source="iam" updated="08:00" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border font-display font-600 text-[15px]">Policies</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-mono uppercase text-muted-foreground bg-paper">
                <th className="text-left px-4 py-2 font-normal">ID</th>
                <th className="text-left px-4 py-2 font-normal">Name</th>
                <th className="text-left px-4 py-2 font-normal">Owner</th>
                <th className="text-left px-4 py-2 font-normal">Status</th>
                <th className="text-left px-4 py-2 font-normal">Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {POLICIES.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono">{p.id}</td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.owner}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{p.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="font-display font-600 text-[15px] mb-3">Data lineage</div>
          <ul className="space-y-2 font-mono text-[12px] text-muted-foreground">
            {LINEAGE.map((l) => <li key={l} className="rounded bg-paper p-2 border border-border">{l}</li>)}
          </ul>
          <div className="mt-5 pt-4 border-t border-border font-mono text-[11px] text-muted-foreground">
            FR-GOV-01 · SYS-07 · BR-02
          </div>
        </div>
      </div>
    </AppShell>
  );
}
