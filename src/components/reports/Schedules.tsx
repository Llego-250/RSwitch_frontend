// REQ-RPT-005 recurring reports: the signed-in user's own schedules (each is
// emailed to whoever set it up, §13) with their next delivery, and cancel
// (§19.6 DELETE /reports/schedules/{id}).
import { useState } from "react";
import { CalendarClock, Plus, XCircle } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import { EmptyState, LoadState, SmallButton, tdCls, thCls } from "@/components/compliance/ui";
import { FormError } from "@/components/governance/ui";
import { errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/governance";
import { useCancelSchedule, useReportSchedules } from "@/lib/reports";

export function Schedules({ canSchedule, onNew }: { canSchedule: boolean; onNew: () => void }) {
  const schedules = useReportSchedules();
  const cancel = useCancelSchedule();
  const [error, setError] = useState<string | null>(null);

  async function stop(id: number, name: string) {
    if (
      !window.confirm(
        `Cancel the schedule "${name}"? Reports already generated stay in the history.`,
      )
    )
      return;
    setError(null);
    try {
      await cancel.mutateAsync(id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <SectionCard
      noPad
      title="My scheduled reports"
      action={
        canSchedule ? (
          <SmallButton tone="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={onNew}>
            New schedule
          </SmallButton>
        ) : (
          <span className="text-[11px] text-[#7B8798]">
            Scheduling is for Compliance and Business users (SRS §12.1)
          </span>
        )
      }
    >
      {error && (
        <div className="p-4">
          <FormError message={error} />
        </div>
      )}
      <LoadState loading={schedules.isLoading} error={schedules.error} />
      {schedules.data && schedules.data.length === 0 && (
        <EmptyState icon={<CalendarClock className="h-8 w-8" />} title="No recurring reports">
          {canSchedule
            ? "Schedule a report daily, weekly or monthly; each run is emailed to you with the file attached."
            : "Your role can view reports but not schedule them."}
        </EmptyState>
      )}
      {schedules.data && schedules.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-[#DCE3E8] dark:border-slate-800">
              <tr>
                {[
                  "Schedule",
                  "Report",
                  "Frequency",
                  "Filters",
                  "Next delivery",
                  "Last run",
                  "",
                ].map((h) => (
                  <th key={h} className={thCls}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {schedules.data.map((s) => (
                <tr key={s.id}>
                  <td className={tdCls}>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-[10.5px] text-[#7B8798] uppercase">{s.format}</div>
                  </td>
                  <td className={tdCls}>{s.report_name}</td>
                  <td className={tdCls}>{s.frequency}</td>
                  <td className={`${tdCls} text-[#526174] dark:text-slate-400 max-w-64`}>
                    {s.filters_text.length ? s.filters_text.join(" · ") : "None"}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {s.next_run_at ? fmtDateTime(s.next_run_at) : "—"}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {s.last_run_at ? fmtDateTime(s.last_run_at) : "Not yet run"}
                  </td>
                  <td className={tdCls}>
                    <SmallButton
                      tone="danger"
                      icon={<XCircle className="h-3.5 w-3.5" />}
                      onClick={() => stop(s.id, s.name)}
                    >
                      Cancel
                    </SmallButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
