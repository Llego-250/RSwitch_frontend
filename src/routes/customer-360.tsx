import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { Search, Shield, User2, Link2 } from "lucide-react";

export const Route = createFileRoute("/customer-360")({
  component: Customer360,
});

const ACCOUNTS = [
  { id: "ACC-88421", type: "Checking",  bal: "$ 12,480.22",  status: "healthy" as const, source: "core-banking" },
  { id: "ACC-88422", type: "Savings",   bal: "$ 48,103.10",  status: "healthy" as const, source: "core-banking" },
  { id: "LN-22019",  type: "Mortgage",  bal: "$ 312,450.00", status: "warning" as const, source: "loans-svc" },
  { id: "CC-90112",  type: "Credit",    bal: "$ 1,203.84",   status: "healthy" as const, source: "cards-api" },
];

const RELATIONS = [
  { name: "Acme Holdings",   role: "Employer",   since: "2019" },
  { name: "J. Doe (spouse)", role: "Joint owner",since: "2021" },
  { name: "Doe Family Trust",role: "Beneficiary",since: "2022" },
];

function Customer360() {
  const { role } = useRole();
  const masked = role === "analyst" || role === "regulator";
  const pii = (v: string) => (masked ? "•••• " + v.slice(-4) : v);

  return (
    <AppShell
      title="Customer 360"
      breadcrumb="UNIFY › CUSTOMER 360"
      toolbar={
        <>
          <div className="flex items-center gap-2 rounded-md border border-border bg-paper px-2 py-1 text-sm">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input className="bg-transparent outline-none w-64" placeholder="Search customer, account, tax-id…" />
          </div>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> consent: marketing ✓ · analytics ✓ · 3p-share ✗
          </span>
        </>
      }
    >
      <div className="rounded-lg border border-border bg-card p-5 mb-4 flex items-center gap-5">
        <div className="h-14 w-14 rounded-full bg-brand/10 grid place-items-center text-brand">
          <User2 className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <div className="font-display font-600 text-xl">{pii("Jane Doe")}</div>
          <div className="font-mono text-[11px] text-muted-foreground mt-1">
            CUST-44021 · {pii("jane.doe@example.com")} · {pii("+1 415 555 0142")} · KYC verified · risk: low
          </div>
        </div>
        <div className="flex gap-2">
          <button className="h-9 px-4 rounded-md border border-border bg-paper text-sm">Open case</button>
          <button className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm">View consent log</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Lifetime value" value={masked ? "••••" : "$ 184k"} source="ledger" updated="12:04" />
        <KpiCard label="Products held"  value="4" source="unified-view" updated="12:04" />
        <KpiCard label="Risk band"      value="Low" source="risk-svc" updated="12:00" version="v2.3" />
        <KpiCard label="Open cases"     value="1" source="case-svc" updated="11:58" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border font-display font-600 text-[15px]">Accounts & products</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-mono uppercase text-muted-foreground bg-paper">
                <th className="text-left px-4 py-2 font-normal">ID</th>
                <th className="text-left px-4 py-2 font-normal">Type</th>
                <th className="text-left px-4 py-2 font-normal">Balance</th>
                <th className="text-left px-4 py-2 font-normal">Status</th>
                <th className="text-left px-4 py-2 font-normal">Source</th>
              </tr>
            </thead>
            <tbody>
              {ACCOUNTS.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono">{a.id}</td>
                  <td className="px-4 py-3">{a.type}</td>
                  <td className="px-4 py-3 tabular">{masked ? "••••" : a.bal}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{a.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="font-display font-600 text-[15px] mb-3 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" /> Relationships
          </div>
          <ul className="space-y-3">
            {RELATIONS.map((r) => (
              <li key={r.name} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{pii(r.name)}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{r.role} · since {r.since}</div>
                </div>
                <button className="text-[11px] font-mono text-brand">view →</button>
              </li>
            ))}
          </ul>
          <div className="mt-5 pt-4 border-t border-border font-mono text-[11px] text-muted-foreground">
            FR-CUST-01 · BR-02 · NFR-PRIV-01
          </div>
        </div>
      </div>
    </AppShell>
  );
}
