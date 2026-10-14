// REQ-P360-008: pending items assigned to RSwitch or to the institution.
import { ListChecks } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import { STATUS_STYLE, dueText, fmtDay } from "@/lib/compliance";
import type { OutstandingAction, OutstandingActions } from "@/lib/participant360";
import { Empty, Pill } from "./ui";

const KIND_LABEL: Record<OutstandingAction["kind"], string> = {
  compliance_submission: "Compliance",
  compliance_review: "Review",
  document: "Document",
  incident: "Incident",
  remediation: "Remediation",
  governance: "Governance",
  ai_alert: "AI alert",
};

function ActionList({ items, empty }: { items: OutstandingAction[]; empty: string }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li
          key={`${a.kind}-${a.ref}-${a.title}`}
          className={`p-2.5 rounded-xl border text-xs ${
            a.overdue ? "border-[#DC3154]/40 bg-[#FDECEF]/40 dark:bg-red-950/20" : "border-[#DCE3E8] dark:border-slate-700"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <a href={a.link} className="font-semibold text-[#172033] dark:text-slate-100 hover:underline">
              {a.title}
            </a>
            <Pill className={STATUS_STYLE[a.status] ?? STATUS_STYLE.Pending}>{a.status}</Pill>
          </div>
          <div className="text-[11px] text-[#7B8798] mt-0.5">
            {KIND_LABEL[a.kind]} · {a.ref} · {a.owner}
            {a.due_date && (
              <span className={a.overdue ? "text-[#DC3154] font-semibold" : ""}>
                {" "}
                · due {fmtDay(a.due_date)} ({dueText(a.days_until_due ?? 0, a.overdue)})
              </span>
            )}
            {a.detail ? ` · ${a.detail}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OutstandingActionsCard({ actions }: { actions: OutstandingActions }) {
  const rswitch = actions.items.filter((a) => a.assigned_to === "RSwitch");
  const institution = actions.items.filter((a) => a.assigned_to === "Institution");
  return (
    <SectionCard
      title={
        <>
          <ListChecks className="h-5 w-5 text-[#168FA8]" /> Outstanding actions
        </>
      }
      action={
        <span className="text-xs text-[#526174] dark:text-slate-400">
          {actions.total} pending{actions.counts.overdue ? ` · ${actions.counts.overdue} overdue` : ""}
        </span>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#7B8798] mb-2">
            Assigned to RSwitch ({rswitch.length})
          </h3>
          <ActionList items={rswitch} empty="Nothing pending on RSwitch's side." />
        </div>
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#7B8798] mb-2">
            Assigned to the institution ({institution.length})
          </h3>
          <ActionList items={institution} empty="Nothing pending on the institution's side." />
        </div>
      </div>
    </SectionCard>
  );
}
