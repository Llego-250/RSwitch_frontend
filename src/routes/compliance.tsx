import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { FileCheck2, Download } from "lucide-react";

export const Route = createFileRoute("/compliance")({
  component: Compliance,
});

const OBLIGATIONS = [
  { id: "REG-BCBS-239", name: "Risk data aggregation",  due: "Q3-26", status: "healthy" as const, coverage: "94%" },
  { id: "REG-AML-5",    name: "Suspicious activity",    due: "monthly", status: "running" as const, coverage: "100%" },
  { id: "REG-GDPR",     name: "Right to erasure SLA",   due: "ongoing", status: "warning" as const, coverage: "88%" },
  { id: "REG-PSD2",     name: "Strong customer auth",   due: "ongoing", status: "healthy" as const, coverage: "99%" },
  { id: "REG-MIFID-2",  name: "Best execution",         due: "Q4-26", status: "queued" as const, coverage: "—" },
];

function Compliance() {
  return (
    <AppShell
      title="Compliance"
      breadcrumb="GOVERN › COMPLIANCE"
      primaryAction={
        <button className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm inline-flex items-center gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export evidence pack
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Obligations tracked" value="38" source="reg-registry" updated="12:00" />
        <KpiCard label="Controls passing"    value="96%" delta={{ dir: "up", text: "+0.4 pp", tone: "good" }} source="control-svc" updated="12:01" />
        <KpiCard label="Open findings"       value="7"  delta={{ dir: "down", text: "−2", tone: "good" }} source="audit" updated="11:55" />
        <KpiCard label="Next filing"         value="14d" source="calendar" updated="08:00" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border font-display font-600 text-[15px] flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-muted-foreground" /> Regulatory obligations
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-mono uppercase text-muted-foreground bg-paper">
                <th className="text-left px-4 py-2 font-normal">Reg</th>
                <th className="text-left px-4 py-2 font-normal">Obligation</th>
                <th className="text-left px-4 py-2 font-normal">Due</th>
                <th className="text-left px-4 py-2 font-normal">Coverage</th>
                <th className="text-left px-4 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {OBLIGATIONS.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono">{o.id}</td>
                  <td className="px-4 py-3">{o.name}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{o.due}</td>
                  <td className="px-4 py-3 tabular">{o.coverage}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="font-display font-600 text-[15px] mb-3">Upcoming filings</div>
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between"><span>BCBS-239 quarterly</span><span className="font-mono text-[11px] text-muted-foreground">in 14d</span></li>
            <li className="flex justify-between"><span>AML SAR batch</span><span className="font-mono text-[11px] text-muted-foreground">in 3d</span></li>
            <li className="flex justify-between"><span>GDPR DPIA review</span><span className="font-mono text-[11px] text-muted-foreground">in 21d</span></li>
          </ul>
          <div className="mt-5 pt-4 border-t border-border font-mono text-[11px] text-muted-foreground">
            FR-CMP-01 · SYS-08 · BR-04 · NFR-AUD-01
          </div>
        </div>
      </div>
    </AppShell>
  );
}
