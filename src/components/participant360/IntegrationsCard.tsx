// REQ-P360-003: current health of each connected data source, and
// REQ-P360-007: technical performance over the last 30 days.
import { Activity, Plug } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import {
  INTEGRATION_BADGE,
  INTEGRATION_STATUS_HELP,
  formatDateTime,
  timeAgo,
} from "@/lib/integrations";
import {
  fmtMinutes,
  type ParticipantProfile,
  type TechnicalPerformance,
} from "@/lib/participant360";
import { Empty, Stat } from "./ui";

export function IntegrationsCard({
  integrations,
}: {
  integrations: ParticipantProfile["integrations"];
}) {
  return (
    <SectionCard
      title={
        <>
          <Plug className="h-5 w-5 text-[#168FA8]" /> Integration status
        </>
      }
    >
      {integrations.length === 0 ? (
        <Empty>No data source is configured for this institution yet.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {integrations.map((i) => (
            <li
              key={i.id}
              className="p-3 rounded-xl border border-[#DCE3E8] dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs space-y-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#172033] dark:text-slate-100">
                  {i.source_name}
                </span>
                <span title={INTEGRATION_STATUS_HELP[i.status]}>
                  <StatusBadge status={INTEGRATION_BADGE[i.status]}>{i.status}</StatusBadge>
                </span>
              </div>
              <div className="text-[11px] text-[#526174] dark:text-slate-400">
                {i.integration_mode}
                {i.schedule_cron ? ` · expected ${i.schedule_cron}` : ""}
                {i.paused ? " · paused by an administrator" : ""}
              </div>
              {i.note && (
                <div className="text-[11px] text-[#526174] dark:text-slate-400">{i.note}</div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                <span title={formatDateTime(i.last_sync_at)}>
                  <span className="text-[#7B8798]">Last transfer</span>
                  <br />
                  {timeAgo(i.last_sync_at)}
                </span>
                <span title={formatDateTime(i.last_success_at)}>
                  <span className="text-[#7B8798]">Last success</span>
                  <br />
                  {timeAgo(i.last_success_at)}
                </span>
                <span>
                  <span className="text-[#7B8798]">Records / errors</span>
                  <br />
                  <span className="font-mono">
                    {i.last_sync_records.toLocaleString()} / {i.last_sync_errors}
                  </span>
                </span>
                <span title="Share of the last 30 days this source was not Failed">
                  <span className="text-[#7B8798]">Uptime (30 d)</span>
                  <br />
                  <span className="font-mono">
                    {i.uptime_pct_30d === null ? "—" : `${i.uptime_pct_30d}%`}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function TechnicalPerformanceCard({ perf }: { perf: TechnicalPerformance }) {
  const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
  return (
    <SectionCard
      title={
        <>
          <Activity className="h-5 w-5 text-[#168FA8]" /> Technical performance
        </>
      }
    >
      <p className="text-[11px] text-[#7B8798] mb-3">
        Last {perf.window_days} days ({formatDateTime(perf.window_start)} –{" "}
        {formatDateTime(perf.window_end)})
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Uptime"
          value={pct(perf.uptime_pct)}
          title={perf.definitions.uptime_pct}
          sub={
            perf.uptime_pct === null
              ? "No data source status known"
              : `${perf.failed_hours} h Failed of ${perf.observed_hours} h`
          }
        />
        <Stat
          label="Pipeline failure rate"
          value={pct(perf.pipeline_failure_rate_pct)}
          title={perf.definitions.pipeline_failure_rate_pct}
          sub={
            perf.jobs_finished
              ? `${perf.jobs_failed} of ${perf.jobs_finished} jobs failed`
              : "No job finished"
          }
        />
        <Stat
          label="Validation failure rate"
          value={pct(perf.submission_failure_rate_pct)}
          title={perf.definitions.submission_failure_rate_pct}
          sub={
            perf.submissions_received
              ? `${perf.submissions_failed_validation} of ${perf.submissions_received} transfers rejected`
              : "Nothing received"
          }
        />
        <Stat
          label="Avg submission latency"
          value={fmtMinutes(perf.avg_submission_latency_minutes)}
          title={perf.definitions.avg_submission_latency_minutes}
          sub={
            perf.latency_samples
              ? `over ${perf.latency_samples} loaded transfer(s)`
              : "No transfer loaded"
          }
        />
      </div>
      <dl className="mt-3 space-y-1 text-[11px] text-[#526174] dark:text-slate-400">
        <div>
          <dt className="inline font-semibold">Uptime: </dt>
          <dd className="inline">{perf.definitions.uptime_pct}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Latency: </dt>
          <dd className="inline">{perf.definitions.avg_submission_latency_minutes}</dd>
        </div>
      </dl>
    </SectionCard>
  );
}
