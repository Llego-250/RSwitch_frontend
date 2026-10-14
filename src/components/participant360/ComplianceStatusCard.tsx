// REQ-P360-005: required compliance documents and returns, their submission
// status, and upcoming or overdue deadlines — from the Compliance module
// (compliance.participant_compliance).
import { ShieldCheck } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import { STATUS_STYLE, dueText, fmtDay } from "@/lib/compliance";
import type { ParticipantComplianceStatus } from "@/lib/participant360";
import { Empty, Pill } from "./ui";

export function ComplianceStatusCard({ compliance }: { compliance: ParticipantComplianceStatus }) {
  const { summary, requirements, upcoming_deadlines: upcoming, overdue, documents } = compliance;
  const chips: [string, number][] = [
    ["Requirements", summary.requirements],
    ["Approved", summary.approved],
    ["Pending", summary.pending],
    ["In review", summary.in_review],
    ["Needs correction", summary.needs_correction],
    ["Overdue", summary.overdue],
  ];
  return (
    <SectionCard
      title={
        <>
          <ShieldCheck className="h-5 w-5 text-[#168FA8]" /> Compliance status
        </>
      }
      action={
        <a
          href="/compliance?tab=register"
          className="text-xs font-semibold text-[#168FA8] hover:underline"
        >
          Compliance register
        </a>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {chips.map(([label, n]) => (
            <span
              key={label}
              className={`px-2.5 py-1 rounded-lg text-[11px] border ${
                label === "Overdue" && n > 0
                  ? STATUS_STYLE.Overdue
                  : "bg-slate-50 dark:bg-slate-800 border-[#DCE3E8] dark:border-slate-700 text-[#526174] dark:text-slate-300"
              }`}
            >
              {label} <span className="font-mono font-bold">{n}</span>
            </span>
          ))}
        </div>

        {requirements.length === 0 ? (
          <Empty>No compliance requirement is registered for this institution.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-[#7B8798]">
                <tr>
                  <th className="py-2 pr-3 text-left font-semibold">Requirement</th>
                  <th className="py-2 pr-3 text-left font-semibold">Period</th>
                  <th className="py-2 pr-3 text-left font-semibold">Due</th>
                  <th className="py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF2F5] dark:divide-slate-800">
                {requirements.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-[#172033] dark:text-slate-100">
                        {r.requirement_name}
                      </div>
                      <div className="text-[11px] text-[#7B8798]">
                        {r.kind} · {r.frequency}
                        {r.regulatory_reference ? ` · ${r.regulatory_reference}` : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.cycle?.period ?? "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDay(r.due_date)}
                      <div className="text-[11px] text-[#7B8798]">
                        {r.submission_status === "Approved"
                          ? "met"
                          : dueText(r.days_until_due, r.submission_status === "Overdue")}
                      </div>
                    </td>
                    <td className="py-2">
                      <Pill className={STATUS_STYLE[r.submission_status] ?? STATUS_STYLE.Pending}>
                        {r.submission_status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#DC3154] mb-1.5">
              Overdue ({overdue.length})
            </h3>
            {overdue.length === 0 ? (
              <Empty>Nothing overdue.</Empty>
            ) : (
              <ul className="space-y-1 text-xs">
                {overdue.map((d) => (
                  <li key={d.key} className="flex justify-between gap-2">
                    <span>
                      {d.requirement_name} ({d.period})
                    </span>
                    <span className="text-[#DC3154] whitespace-nowrap">
                      {dueText(d.days_until_due, true)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#7B8798] mb-1.5">
              Upcoming — next 90 days ({upcoming.filter((d) => d.status !== "Overdue").length})
            </h3>
            {upcoming.filter((d) => d.status !== "Overdue").length === 0 ? (
              <Empty>No deadline in the next 90 days.</Empty>
            ) : (
              <ul className="space-y-1 text-xs">
                {upcoming
                  .filter((d) => d.status !== "Overdue")
                  .map((d) => (
                    <li key={d.key} className="flex justify-between gap-2">
                      <span>
                        {d.requirement_name} ({d.period}){d.projected ? " · projected" : ""}
                      </span>
                      <span className="text-[#526174] dark:text-slate-400 whitespace-nowrap">
                        {fmtDay(d.due_date)} · {d.status}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#7B8798] mb-1.5">
            Required documents
          </h3>
          {documents.length === 0 ? (
            <Empty>No document type is required yet.</Empty>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {documents.map((d) => (
                <li
                  key={d.doc_type_id}
                  className="p-2.5 rounded-xl border border-[#DCE3E8] dark:border-slate-700 text-xs flex items-center justify-between gap-2"
                >
                  <span className="min-w-0">
                    <span className="font-semibold text-[#172033] dark:text-slate-100 block truncate">
                      {d.doc_type}
                    </span>
                    <span className="text-[11px] text-[#7B8798]">
                      {d.expiry_date
                        ? `expires ${fmtDay(d.expiry_date)}`
                        : d.document
                          ? "no expiry"
                          : "not on file"}
                    </span>
                  </span>
                  <Pill className={STATUS_STYLE[d.expiry_status] ?? STATUS_STYLE.Pending}>
                    {d.expiry_status}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
