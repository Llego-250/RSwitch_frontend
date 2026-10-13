// Governance overview: headline counts, the overdue action item dashboard
// grouped by committee (REQ-GOV-007), upcoming meetings and the signed-in
// user's own action items. Every figure is read from the API.

import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Crown } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import {
  dayKey,
  parseUtc,
  useActionItems,
  useCommittees,
  useMeetings,
  useOverdueActionItems,
} from "@/lib/governance";
import { ActionStatusControl, DueCell, OwnerCell } from "./ActionItems";
import { UpcomingMeetings } from "./Meetings";
import { ActionStatusPill, CommitteeChip, EmptyState, LoadState } from "./ui";

function Kpis() {
  const committees = useCommittees();
  const items = useActionItems();
  const meetings = useMeetings({ start: dayKey(new Date()) });
  const now = Date.now();
  const in30 = now + 30 * 86_400_000;
  const all = items.data ?? [];
  const overdue = all.filter((i) => i.status === "Overdue");
  const overdueCommittees = new Set(overdue.map((i) => i.committee)).size;
  const value = (ready: boolean, n: number) => (ready ? n : "–");
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <KpiCard
        label="Active committees"
        value={value(!!committees.data, (committees.data ?? []).filter((c) => c.is_active).length)}
        context={`${(committees.data ?? []).reduce((n, c) => n + c.members.length, 0)} registered members`}
      />
      <KpiCard
        label="Meetings in next 30 days"
        value={value(
          !!meetings.data,
          (meetings.data ?? []).filter((m) => {
            const t = parseUtc(m.scheduled_at).getTime();
            return t >= now && t <= in30;
          }).length,
        )}
        context="All committees & working groups"
      />
      <KpiCard
        label="Open action items"
        value={value(
          !!items.data,
          all.filter((i) => i.status === "Open" || i.status === "In Progress").length,
        )}
        context={`${all.filter((i) => i.status !== "Completed" && i.days_until_due >= 0 && i.days_until_due <= 7).length} due within 7 days`}
      />
      <KpiCard
        label="Overdue action items"
        value={value(!!items.data, overdue.length)}
        context={`Across ${overdueCommittees} committee${overdueCommittees === 1 ? "" : "s"} · chairs alerted`}
      />
    </div>
  );
}

function OverdueByCommittee() {
  const groups = useOverdueActionItems();
  const total = (groups.data ?? []).reduce((n, g) => n + g.count, 0);
  return (
    <SectionCard
      title={
        <>
          <AlertTriangle className="h-5 w-5 text-[#DC3154]" /> Overdue action items by committee
        </>
      }
      action={
        groups.data ? (
          <span className="text-xs text-[#526174] dark:text-slate-400">{total} overdue</span>
        ) : undefined
      }
      noPad
    >
      <LoadState loading={groups.isLoading} error={groups.error} />
      {groups.data && groups.data.length === 0 && (
        <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="No overdue action items">
          Every action item is on time or completed.
        </EmptyState>
      )}
      <div className="divide-y divide-[#DCE3E8] dark:divide-slate-800">
        {(groups.data ?? []).map((g) => (
          <div key={g.committee_id ?? g.committee} className="px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CommitteeChip name={g.committee} type={g.committee_type} />
                <span className="text-xs font-bold text-[#DC3154]">
                  {g.count} overdue · up to {g.max_days_overdue} day
                  {g.max_days_overdue === 1 ? "" : "s"} late
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] text-[#526174] dark:text-slate-400">
                <Crown className="h-3 w-3 text-[#D97706]" />
                Escalated to chair: {g.chair ? g.chair.name : "no chair assigned"}
              </span>
            </div>
            <ul className="space-y-2">
              {g.items.map((i) => (
                <li
                  key={i.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs items-start"
                >
                  <div className="sm:col-span-5 font-medium text-[#172033] dark:text-white">
                    {i.description}
                    {i.meeting_title && (
                      <div className="text-[11px] text-[#7B8798] font-normal">
                        From: {i.meeting_title}
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-3">
                    <OwnerCell owner={i.owner} />
                  </div>
                  <div className="sm:col-span-2">
                    <DueCell item={i} />
                  </div>
                  <div className="sm:col-span-2 flex justify-start sm:justify-end">
                    <ActionStatusControl item={i} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function MyActionItems({ myEmail }: { myEmail: string | undefined }) {
  const items = useActionItems();
  const mine = (items.data ?? []).filter(
    (i) => i.owner.type === "user" && i.owner.email === myEmail && i.status !== "Completed",
  );
  return (
    <SectionCard
      title={
        <>
          <ClipboardList className="h-5 w-5 text-[#168FA8]" /> Assigned to me
        </>
      }
      noPad
    >
      <LoadState loading={items.isLoading} error={items.error} />
      {items.data && mine.length === 0 && (
        <EmptyState title="Nothing assigned to you">
          No open governance action items have you as owner.
        </EmptyState>
      )}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {mine.map((i) => (
          <li key={i.id} className="px-6 py-3 text-xs space-y-1.5">
            <div className="font-medium text-[#172033] dark:text-white">{i.description}</div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ActionStatusPill status={i.status} />
                <DueCell item={i} />
              </div>
              <ActionStatusControl item={i} />
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function OverviewPanel({
  myEmail,
  onOpenMeeting,
}: {
  myEmail: string | undefined;
  onOpenMeeting: (id: number) => void;
}) {
  return (
    <>
      <Kpis />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-5">
          <OverdueByCommittee />
        </div>
        <div className="lg:col-span-5 space-y-5">
          <SectionCard
            title={
              <>
                <CalendarDays className="h-5 w-5 text-[#168FA8]" /> Upcoming meetings
              </>
            }
          >
            <UpcomingMeetings onOpen={onOpenMeeting} />
          </SectionCard>
          <MyActionItems myEmail={myEmail} />
        </div>
      </div>
    </>
  );
}
