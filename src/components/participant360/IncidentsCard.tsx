// REQ-P360-006: open and resolved incidents of this institution.
import { useState } from "react";
import { Siren } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import { SEVERITY_STYLE, STATUS_STYLE, fmtDate, type Incident } from "@/lib/compliance";
import { Empty, Pill } from "./ui";

function IncidentRow({ incident }: { incident: Incident }) {
  const actions = incident.action_counts;
  return (
    <li className="p-3 rounded-xl border border-[#DCE3E8] dark:border-slate-700 text-xs space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono font-bold text-[#526174] dark:text-slate-300">{incident.ref}</span>
        <span className="flex gap-1.5">
          <Pill className={SEVERITY_STYLE[incident.severity]}>{incident.severity}</Pill>
          <Pill className={STATUS_STYLE[incident.status] ?? STATUS_STYLE.Pending}>{incident.status}</Pill>
        </span>
      </div>
      <div className="text-[#172033] dark:text-slate-100">{incident.description}</div>
      <div className="text-[11px] text-[#7B8798]">
        {incident.incident_date ? `Occurred ${incident.incident_date} · ` : ""}raised {fmtDate(incident.raised_at)} · owner{" "}
        {incident.owner?.name ?? (incident.assignee || "unassigned")}
        {actions.total > 0 &&
          ` · ${actions.completed}/${actions.total} remediation action(s) done${actions.overdue ? `, ${actions.overdue} overdue` : ""}`}
        {incident.resolved_at ? ` · resolved ${fmtDate(incident.resolved_at)}` : ""}
      </div>
      {incident.resolution_summary && (
        <div className="text-[11px] text-[#526174] dark:text-slate-400">Resolution: {incident.resolution_summary}</div>
      )}
    </li>
  );
}

export function IncidentsCard({ incidents }: { incidents: { open: Incident[]; resolved: Incident[] } }) {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const rows = incidents[tab];
  return (
    <SectionCard
      title={
        <>
          <Siren className="h-5 w-5 text-[#168FA8]" /> Incidents
        </>
      }
      action={
        <div className="flex rounded-lg border border-[#DCE3E8] dark:border-slate-700 overflow-hidden text-[11px] font-semibold">
          {(["open", "resolved"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 cursor-pointer ${
                tab === t ? "bg-[#168FA8] text-white" : "text-[#526174] dark:text-slate-300"
              }`}
            >
              {t === "open" ? "Open" : "Resolved / closed"} ({incidents[t].length})
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <Empty>{tab === "open" ? "No open incident." : "No resolved or closed incident."}</Empty>
      ) : (
        <ul className="space-y-2 max-h-[420px] overflow-y-auto">
          {rows.map((i) => (
            <IncidentRow key={i.id} incident={i} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
