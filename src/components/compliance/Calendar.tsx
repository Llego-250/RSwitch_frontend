// Compliance calendar (REQ-COMP-004/005, §6.5 step 1): every deadline in
// the next 90 days as month grids and a list, with overdue submissions in red.
// Later due dates of recurring requirements are shown as scheduled — their
// cycle opens once the one before is approved (§11.4).

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import {
  STATUS_STYLE,
  dayKey,
  dueText,
  fmtDay,
  parseDay,
  useCalendar,
  type Deadline,
} from "@/lib/compliance";
import { linkBtnCls } from "@/components/governance/ui";
import { EmptyState, LoadState, StatusPill } from "./ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthsBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    out.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

function chipCls(d: Deadline): string {
  if (d.projected)
    return "border-dashed border-[#B8C4CE] text-[#526174] bg-white dark:bg-slate-900 dark:text-slate-300";
  return STATUS_STYLE[d.status] ?? STATUS_STYLE.Pending;
}

export function CalendarPanel({ onOpen }: { onOpen: (requirementId: number) => void }) {
  const cal = useCalendar(90);
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    for (const d of cal.data?.deadlines ?? []) {
      const key = d.due_date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return map;
  }, [cal.data]);

  if (!cal.data) return <LoadState loading={cal.isLoading} error={cal.error} />;
  const start = parseDay(cal.data.start);
  const end = parseDay(cal.data.end);
  const todayKey = dayKey(start);
  const upcoming = cal.data.deadlines.filter((d) => d.status !== "Approved");
  const listed = selected ? (byDay.get(selected) ?? []) : upcoming;

  return (
    <div className="space-y-5">
      <SectionCard
        title={
          <span className="flex items-center gap-2 text-[#DC3154]">
            <AlertTriangle className="h-4 w-4" /> Overdue ({cal.data.overdue.length})
          </span>
        }
        noPad
      >
        {cal.data.overdue.length === 0 ? (
          <EmptyState title="Nothing is overdue">
            Every past deadline has an approved submission or a file received in time.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-[#FBD5DD] dark:divide-red-900/40">
            {cal.data.overdue.map((d) => (
              <li key={d.key}>
                <button
                  onClick={() => onOpen(d.requirement_id)}
                  className="w-full text-left px-6 py-2.5 flex flex-wrap items-center gap-3 bg-[#FDECEF]/70 dark:bg-red-950/30 hover:bg-[#FDECEF] cursor-pointer"
                >
                  <span className="text-xs font-bold text-[#DC3154] w-28">
                    {fmtDay(d.due_date)}
                  </span>
                  <span className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                    {d.participant_name}
                  </span>
                  <span className="text-xs text-[#526174] dark:text-slate-300">
                    {d.requirement_name} · {d.period}
                  </span>
                  <span className="ml-auto text-[11px] font-semibold text-[#DC3154]">
                    {dueText(d.days_until_due, true)}
                  </span>
                  {d.stage !== "Pending" && (
                    <span className="text-[11px] text-[#7B8798]">latest: {d.stage}</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-[#DC3154]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {monthsBetween(start, end).map((month) => (
            <MonthGrid
              key={month.toISOString()}
              month={month}
              start={start}
              end={end}
              todayKey={todayKey}
              byDay={byDay}
              selected={selected}
              onSelect={(key) => setSelected(selected === key ? null : key)}
              onOpen={onOpen}
            />
          ))}
        </div>
        <div className="xl:col-span-4">
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[#168FA8]" />
                {selected ? fmtDay(selected) : "Next 90 days"}
              </span>
            }
            action={
              selected ? (
                <button className={linkBtnCls} onClick={() => setSelected(null)}>
                  Show all
                </button>
              ) : undefined
            }
            noPad
          >
            {listed.length === 0 ? (
              <EmptyState
                title={selected ? "No deadline that day" : "No deadlines in the next 90 days"}
              />
            ) : (
              <ul className="divide-y divide-[#EEF2F5] dark:divide-slate-800 max-h-[38rem] overflow-y-auto">
                {listed.map((d) => (
                  <li key={d.key}>
                    <button
                      onClick={() => onOpen(d.requirement_id)}
                      className="w-full text-left px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-[#526174] w-20 shrink-0">
                          {fmtDay(d.due_date)}
                        </span>
                        <span className="text-xs font-semibold text-[#172033] dark:text-slate-100 truncate">
                          {d.participant_name}
                        </span>
                        <span className="ml-auto">
                          {d.projected ? (
                            <span
                              className="text-[11px] text-[#7B8798]"
                              title="Opens once the cycle before is approved"
                            >
                              Scheduled
                            </span>
                          ) : (
                            <StatusPill status={d.status} />
                          )}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#7B8798] pl-[5.5rem]">
                        {d.requirement_name} · {d.period} · {dueText(d.days_until_due)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#526174]">
        <span className="font-semibold">Legend:</span>
        {[
          "Overdue",
          "Pending",
          "Submitted",
          "Under Review",
          "Validation Failed",
          "Pending Correction",
          "Approved",
        ].map((s) => (
          <span key={s} className={`px-2 py-0.5 rounded-md border ${STATUS_STYLE[s]}`}>
            {s}
          </span>
        ))}
        <span className="px-2 py-0.5 rounded-md border border-dashed border-[#B8C4CE]">
          Scheduled (next cycle)
        </span>
      </div>
    </div>
  );
}

function MonthGrid({
  month,
  start,
  end,
  todayKey,
  byDay,
  selected,
  onSelect,
  onOpen,
}: {
  month: Date;
  start: Date;
  end: Date;
  todayKey: string;
  byDay: Map<string, Deadline[]>;
  selected: string | null;
  onSelect: (key: string) => void;
  onOpen: (requirementId: number) => void;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from(
      { length: days },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <SectionCard
      title={month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      noPad
    >
      <div className="grid grid-cols-7 text-[10px] font-semibold uppercase text-[#7B8798] border-b border-[#EEF2F5] dark:border-slate-800">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day)
            return (
              <div
                key={i}
                className="min-h-20 border-b border-r border-[#F3F6F8] dark:border-slate-800/60"
              />
            );
          const key = dayKey(day);
          const inWindow = day >= start && day <= end;
          const items = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              onClick={() => items.length && onSelect(key)}
              className={`min-h-20 border-b border-r border-[#F3F6F8] dark:border-slate-800/60 p-1 ${
                inWindow ? "" : "opacity-40"
              } ${items.length ? "cursor-pointer" : ""} ${selected === key ? "bg-[#E7F5F8] dark:bg-cyan-950/30" : ""}`}
            >
              <div
                className={`text-[11px] font-semibold mb-0.5 ${
                  isToday
                    ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#168FA8] text-white"
                    : "text-[#526174]"
                }`}
              >
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((d) => (
                  <button
                    key={d.key}
                    title={`${d.participant_name} — ${d.requirement_name} (${d.projected ? "scheduled" : d.status})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(d.requirement_id);
                    }}
                    className={`block w-full truncate text-left text-[10px] leading-4 px-1 rounded border cursor-pointer ${chipCls(d)}`}
                  >
                    {d.participant_code} · {d.requirement_name}
                  </button>
                ))}
                {items.length > 3 && (
                  <div className="text-[10px] font-semibold text-[#168FA8] px-1">
                    +{items.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
