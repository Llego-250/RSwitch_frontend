import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/inclusion")({
  component: Inclusion,
});

const COHORTS = [
  { id: "thin-file",      name: "Thin-file applicants",  size: "12,401", approval: "38%", fairness: "0.92" },
  { id: "gig-income",     name: "Gig-economy income",    size: " 8,902", approval: "44%", fairness: "0.95" },
  { id: "first-gen",      name: "First-generation banking", size: " 3,210", approval: "51%", fairness: "0.97" },
  { id: "rural-sme",      name: "Rural SME borrowers",   size: " 1,884", approval: "62%", fairness: "0.94" },
];

function Inclusion() {
  return (
    <AppShell
      title="Financial Inclusion"
      breadcrumb="DECIDE › INCLUSION"
      primaryAction={<button className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm">New cohort</button>}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Underserved reached" value="26,397" delta={{ dir: "up", text: "+4.2%", tone: "good" }} source="cohort-svc" updated="12:00" />
        <KpiCard label="Approval lift"       value="+11 pp" source="ab-test" updated="11:30" version="exp-44" />
        <KpiCard label="Fairness score"      value="0.94"  source="xai-svc" updated="11:50" />
        <KpiCard label="Default rate (90d)"  value="2.1%"  source="ledger" updated="08:00" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-border font-display font-600 text-[15px] flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" /> Target cohorts
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-mono uppercase text-muted-foreground bg-paper">
              <th className="text-left px-4 py-2 font-normal">Cohort</th>
              <th className="text-left px-4 py-2 font-normal">Population</th>
              <th className="text-left px-4 py-2 font-normal">Approval</th>
              <th className="text-left px-4 py-2 font-normal">Fairness</th>
              <th className="text-right px-4 py-2 font-normal">Action</th>
            </tr>
          </thead>
          <tbody>
            {COHORTS.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3 tabular font-mono">{c.size}</td>
                <td className="px-4 py-3 tabular">{c.approval}</td>
                <td className="px-4 py-3 tabular">{c.fairness}</td>
                <td className="px-4 py-3 text-right text-[11px] font-mono text-brand">design product →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-display font-600 text-[15px] mb-2">Alternative data sources</div>
        <p className="text-sm text-muted-foreground">
          Mobile-money history, utility payments, telco metadata, and savings-circle records — used with consent to expand
          eligibility while preserving fairness thresholds.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["mobile-money","utility-bills","telco-meta","savings-circle","gig-platforms"].map((t) => (
            <span key={t} className="font-mono text-[11px] rounded-md bg-paper border border-border px-2 py-0.5">{t}</span>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-border font-mono text-[11px] text-muted-foreground">
          FR-INC-01 · BR-09 · NFR-FAIR-01
        </div>
      </div>
    </AppShell>
  );
}
