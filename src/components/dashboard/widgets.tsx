// One view per dashboard widget (SRS §15.1–15.3, REQ-DASH-004/005/008). Each
// renders exactly what the API computed — counts, lists and labels — with
// explicit empty states; nothing here derives or invents a figure.
import type { ReactNode } from "react";
import { AlertTriangle, Clock, Download, FileText } from "lucide-react";
import { StatusBadge, type Status } from "@/components/StatusBadge";
import { SeverityPill, StatusPill } from "@/components/compliance/ui";
import type { Severity } from "@/lib/compliance";
import { fmtDateTime, fmtDay } from "@/lib/governance";
import { formatMetric } from "@/lib/inclusion";
import { downloadRun, type ReportRun } from "@/lib/reports";
import {
  fmtDuration,
  timeAgo,
  useOpenLink,
  type ActionItemsData,
  type ActivityData,
  type AlertsData,
  type CountList,
  type DeadlineItem,
  type FailedIntegrationsData,
  type FreshnessData,
  type HealthData,
  type InclusionSnapshotData,
  type MappingsData,
  type OverdueItem,
  type PipelineRunsData,
  type PipelinesData,
  type RateData,
  type RiskData,
  type SeverityCounts,
  type SystemHealthData,
} from "@/lib/dashboard";
import { Caption, Empty, SegmentBar, Stat } from "./WidgetCard";

const rowCls =
  "flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 text-xs";
const linkRowCls = `${rowCls} w-full text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg px-1 -mx-1`;

const STATUS_FOR: Record<string, Status> = {
  Healthy: "healthy",
  Warning: "warning",
  Failed: "failed",
  Running: "running",
  Queued: "queued",
  Paused: "paused",
  Completed: "completed",
  Pending: "draft",
  "Not Configured": "draft",
};

function Badge({ status }: { status: string }) {
  return <StatusBadge status={STATUS_FOR[status] ?? "draft"}>{status}</StatusBadge>;
}

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---- §15.1 Compliance ----------------------------------------------------------------

export function OverdueSubmissions({ data }: { data: CountList<OverdueItem> }) {
  return (
    <div>
      <Stat
        value={data.count}
        label={`cycles past their due date · ${data.period_label}`}
        tone={data.count ? "bad" : "good"}
      />
      {data.items.length > 0 ? (
        <ul className="mt-3">
          {data.items.map((i, n) => (
            <li key={n} className={rowCls}>
              <span className="flex-1 min-w-0">
                <span className="font-semibold text-[#172033] dark:text-slate-100">
                  {i.participant_name}
                </span>
                <span className="block text-[#526174] dark:text-slate-400 truncate">
                  {i.requirement_name} · {i.period}
                </span>
              </span>
              <span className="text-[#DC3154] font-semibold whitespace-nowrap">
                {plural(i.days_overdue, "day")} overdue
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No submission is overdue.</Empty>
      )}
    </div>
  );
}

export function UpcomingDeadlines({ data }: { data: CountList<DeadlineItem> }) {
  const shown = data.items.slice(0, 8);
  return (
    <div>
      <Stat value={data.count} label={`deadlines still to be met · ${data.period_label}`} />
      {shown.length ? (
        <ul className="mt-3">
          {shown.map((d) => (
            <li key={d.key} className={rowCls}>
              <span className="w-16 shrink-0 font-semibold text-[#172033] dark:text-slate-100 tabular-nums">
                {fmtDay(d.due_date).replace(/,? \d{4}$/, "")}
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-semibold text-[#172033] dark:text-slate-100 block truncate">
                  {d.participant_name}
                </span>
                <span className="block text-[#526174] dark:text-slate-400 truncate">
                  {d.requirement_name} · {d.period}
                  {d.projected && " · projected"}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1 shrink-0">
                <StatusPill status={d.status} />
                <span className="text-[10.5px] text-[#7B8798]">
                  {d.days_until_due === 0
                    ? "due today"
                    : d.days_until_due > 0
                      ? `in ${plural(d.days_until_due, "day")}`
                      : `${-d.days_until_due}d ago`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No compliance deadline falls in this period.</Empty>
      )}
      {data.count > shown.length && (
        <Caption>{data.count - shown.length} more in the compliance calendar.</Caption>
      )}
    </div>
  );
}

export function OpenIncidents({ data }: { data: SeverityCounts }) {
  return (
    <div>
      <Stat
        value={data.total}
        label={`unresolved incidents · ${data.period_label}`}
        tone={data.Critical ? "bad" : "default"}
      />
      <div className="mt-4 grid grid-cols-4 gap-2">
        {(["Critical", "High", "Medium", "Low"] as Severity[]).map((s) => (
          <div
            key={s}
            className="rounded-xl border border-[#DCE3E8] dark:border-slate-800 p-2.5 text-center"
          >
            <div className="text-xl font-bold tabular-nums text-[#172033] dark:text-white">
              {data[s]}
            </div>
            <div className="mt-1">
              <SeverityPill severity={s} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComplianceRate({ data }: { data: RateData }) {
  return (
    <div>
      <Stat
        value={pct(data.rate_pct)}
        label={
          data.total
            ? `${data.on_time} of ${plural(data.total, "deadline")} met on time`
            : "No deadline fell due in this period"
        }
        tone={
          data.rate_pct === null
            ? "default"
            : data.rate_pct >= 90
              ? "good"
              : data.rate_pct >= 70
                ? "warn"
                : "bad"
        }
      />
      <Caption>
        {data.period_label}: deadlines due in the window whose submission was approved and arrived
        by the due date.
      </Caption>
    </div>
  );
}

export function OverdueActionItems({ data }: { data: ActionItemsData }) {
  const open = useOpenLink();
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Stat value={data.total} label="overdue in total" tone={data.total ? "bad" : "good"} />
        <Stat value={data.governance} label="governance" />
        <Stat value={data.incident_remediation} label="incident remediation" />
      </div>
      {data.items.length > 0 ? (
        <ul className="mt-3">
          {data.items.map((i, n) => (
            <li key={n}>
              <button className={linkRowCls} onClick={() => open(i.link)}>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[#172033] dark:text-slate-100 truncate">
                    {i.description}
                  </span>
                  <span className="block text-[#526174] dark:text-slate-400">
                    {i.kind} · {i.owner || "No owner"}
                  </span>
                </span>
                <span className="text-[#DC3154] font-semibold whitespace-nowrap">
                  {i.days_overdue}d overdue
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No action item is past its due date.</Empty>
      )}
    </div>
  );
}

export function RecentActivity({ data }: { data: ActivityData }) {
  const open = useOpenLink();
  if (!data.items.length)
    return (
      <Empty>
        No {data.source === "compliance" ? "compliance events" : "relevant activity"} in this period
        ({data.period_label}).
      </Empty>
    );
  return (
    <ol>
      {data.items.map((e, n) => (
        <li key={n}>
          <button className={linkRowCls} onClick={() => open(e.link)} disabled={!e.link}>
            <span className="w-20 shrink-0 text-[#7B8798] tabular-nums" title={fmtDateTime(e.at)}>
              {timeAgo(e.at)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-[#172033] dark:text-slate-100 truncate">
                {e.title}
              </span>
              <span className="block text-[#526174] dark:text-slate-400 truncate">
                {[e.participant_name, e.actor, e.detail].filter(Boolean).join(" · ")}
              </span>
            </span>
            {e.status === "FAILED" || e.status === "WARNING" ? (
              <span className="text-[10.5px] font-semibold text-[#B45309]">
                {e.status.toLowerCase()}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ol>
  );
}

// ---- §15.2 Business -------------------------------------------------------------------------

export function IntegrationHealth({ data }: { data: HealthData }) {
  const others = Object.entries(data.by_status).filter(
    ([k, v]) => v > 0 && !["Healthy", "Warning", "Failed"].includes(k),
  );
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Stat value={data.healthy} label="Healthy" tone="good" />
        <Stat value={data.warning} label="Warning" tone={data.warning ? "warn" : "default"} />
        <Stat value={data.failed} label="Failed" tone={data.failed ? "bad" : "default"} />
      </div>
      <div className="mt-4">
        <SegmentBar
          empty="No data source is registered for the selected participants."
          segments={[
            { label: "Healthy", value: data.healthy, className: "bg-[#16A979]" },
            { label: "Warning", value: data.warning, className: "bg-[#D97706]" },
            { label: "Failed", value: data.failed, className: "bg-[#DC3154]" },
            ...others.map(([k, v]) => ({ label: k, value: v, className: "bg-slate-400" })),
          ]}
        />
      </div>
      <Caption>{plural(data.total, "data source")} across the selected participants.</Caption>
    </div>
  );
}

export function AiAlerts({ data }: { data: AlertsData }) {
  const open = useOpenLink();
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          value={data.unacknowledged}
          label={`awaiting acknowledgement · ${data.period_label}`}
          tone={data.unacknowledged ? "warn" : "good"}
        />
        <Stat value={data.escalated} label="escalated" tone={data.escalated ? "bad" : "default"} />
      </div>
      {data.items.length > 0 ? (
        <ul className="mt-3">
          {data.items.map((a) => (
            <li key={a.id}>
              <button className={linkRowCls} onClick={() => open(a.link)}>
                <SeverityPill
                  severity={(a.severity.charAt(0) + a.severity.slice(1).toLowerCase()) as Severity}
                />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[#172033] dark:text-slate-100 truncate">
                    {a.indicator}
                  </span>
                  <span className="block text-[#526174] dark:text-slate-400">
                    {a.ref} · {a.participant_name} · {timeAgo(a.created_at)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No AI alert is waiting for acknowledgement.</Empty>
      )}
    </div>
  );
}

export function InclusionSnapshot({ data }: { data: InclusionSnapshotData }) {
  const metrics = data.metrics;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-semibold text-[#172033] dark:text-slate-100">
          {data.period_label}
        </span>
        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF3DF] text-[#B45309] border border-[#D97706]/30">
          {data.indicative_label}
        </span>
      </div>
      {metrics.length ? (
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m) => (
            <div
              key={m.key}
              className="rounded-xl border border-[#DCE3E8] dark:border-slate-800 p-2.5 min-w-0"
              title={m.data_source}
            >
              <div className="text-[10.5px] text-[#526174] dark:text-slate-400 truncate">
                {m.label}
              </div>
              <div className="text-sm font-bold tabular-nums text-[#172033] dark:text-white mt-0.5">
                {m.available ? (
                  formatMetric(m.value, m.unit, true)
                ) : (
                  <span className="text-[11px] font-medium text-[#7B8798]">{m.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>No inclusion return has been received yet.</Empty>
      )}
      <Caption>
        {data.coverage.institutions_reporting} of {data.coverage.institutions_registered}{" "}
        institutions reporting
        {data.coverage.last_updated ? ` · updated ${timeAgo(data.coverage.last_updated)}` : ""}.
      </Caption>
    </div>
  );
}

export function RiskOverview({ data }: { data: RiskData }) {
  const open = useOpenLink();
  const d = data.distribution;
  return (
    <div>
      <SegmentBar
        empty="No participant matches the filters."
        segments={[
          { label: "Low", value: d.Low ?? 0, className: "bg-[#16A979]" },
          { label: "Medium", value: d.Medium ?? 0, className: "bg-[#D97706]" },
          { label: "High", value: d.High ?? 0, className: "bg-[#DC3154]" },
          {
            label: "Insufficient data",
            value: d["Insufficient data"] ?? 0,
            className: "bg-slate-300 dark:bg-slate-600",
          },
        ]}
      />
      {data.riskiest.length > 0 && (
        <div className="mt-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[#7B8798] mb-1">
            Highest scores
          </div>
          <ul>
            {data.riskiest.map((r) => (
              <li key={r.participant_id}>
                <button className={linkRowCls} onClick={() => open(r.link)}>
                  <span className="flex-1 font-semibold text-[#172033] dark:text-slate-100 truncate">
                    {r.participant_name}
                  </span>
                  <span className="tabular-nums font-semibold">{r.score.toFixed(1)}</span>
                  <span className="text-[#526174] dark:text-slate-400 w-16 text-right">
                    {r.band}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Caption>
        Scores 0–100, higher is riskier. Under 3 months of history: insufficient data.
      </Caption>
    </div>
  );
}

export function RecentReports({ data }: { data: { period_label: string; items: ReportRun[] } }) {
  if (!data.items.length)
    return <Empty>No report you can view has been generated in this period.</Empty>;
  return (
    <ul>
      {data.items.map((r) => (
        <li key={r.id} className={rowCls}>
          <FileText className="h-4 w-4 text-[#168FA8] shrink-0 mt-0.5" />
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-[#172033] dark:text-slate-100 truncate">
              {r.name}
            </span>
            <span className="block text-[#526174] dark:text-slate-400">
              {r.name !== r.report_name && `${r.report_name} · `}
              {r.generated_by} · {timeAgo(r.generated_at)}
            </span>
          </span>
          {r.status === "Completed" ? (
            <button
              onClick={() => downloadRun(r)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              {r.format.toUpperCase()}
            </button>
          ) : (
            <span className="text-[11px] text-[#7B8798]">{r.status}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ComplianceOverview({ data }: { data: RateData }) {
  const statuses = Object.entries(data.current_status ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <ComplianceRate data={data} />
      {statuses.length > 0 && (
        <div className="mt-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[#7B8798] mb-1.5">
            Current obligations by status
          </div>
          <div className="flex flex-wrap gap-1.5">
            {statuses.map(([s, n]) => (
              <span key={s} className="inline-flex items-center gap-1">
                <StatusPill status={s} />
                <span className="text-xs font-semibold tabular-nums">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- §15.3 Technical / Admin ---------------------------------------------------------------

export function ActivePipelines({ data }: { data: PipelinesData }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Stat value={data.running} label="running now" />
      <Stat value={data.queued} label="queued" tone={data.queued ? "warn" : "default"} />
      <Stat
        value={data.failed}
        label={`failed · ${data.period_label.toLowerCase()}`}
        tone={data.failed ? "bad" : "good"}
      />
      <Stat value={data.completed} label={`completed · ${data.period_label.toLowerCase()}`} />
    </div>
  );
}

export function FailedIntegrations({ data }: { data: FailedIntegrationsData }) {
  const open = useOpenLink();
  if (!data.items.length) return <Empty>No integration is in Failed state.</Empty>;
  return (
    <ul>
      {data.items.map((i) => (
        <li key={i.integration_id}>
          <button className={linkRowCls} onClick={() => open(i.link)}>
            <AlertTriangle className="h-4 w-4 text-[#DC3154] shrink-0 mt-0.5" />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-[#172033] dark:text-slate-100 truncate">
                {i.participant_name} · {i.source_name}
              </span>
              <span className="block text-[#526174] dark:text-slate-400 line-clamp-2">
                {i.note || "No reason recorded."}
              </span>
              <span className="block text-[#7B8798]">
                Failed since {timeAgo(i.since)} · last success {timeAgo(i.last_success_at)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DataFreshness({ data }: { data: FreshnessData }) {
  if (!data.items.length)
    return <Empty>No data source is registered for the selected participants.</Empty>;
  const shown = data.items.slice(0, 8);
  return (
    <div>
      <ul>
        {shown.map((i) => (
          <li key={i.integration_id} className={rowCls}>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-[#172033] dark:text-slate-100 truncate">
                {i.source_name}
              </span>
              <span className="block text-[#526174] dark:text-slate-400 truncate">
                {i.participant_name}
              </span>
            </span>
            <span className="text-right shrink-0">
              <span
                className="block tabular-nums"
                title={i.last_sync_at ? fmtDateTime(i.last_sync_at) : "Never synced"}
              >
                {timeAgo(i.last_sync_at)}
              </span>
              {i.stale && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#B45309]">
                  <Clock className="h-3 w-3" />
                  stale (expected every {i.expected_days}d)
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Caption>
        {plural(data.count, "data source")}, {data.stale} without a sync within the participant's
        expected frequency.
        {data.count > shown.length && " Stalest shown first."}
      </Caption>
    </div>
  );
}

export function SystemHealth({ data }: { data: SystemHealthData }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Stat
          value={fmtDuration(data.uptime_seconds)}
          label={`uptime since ${fmtDateTime(data.started_at)}`}
        />
        <Stat
          value={data.error_rate_pct === null ? "—" : `${data.error_rate_pct}%`}
          label={`5xx errors · ${data.errors_5xx} of ${data.requests} requests (${data.period_label})`}
          tone={data.errors_5xx ? "bad" : "good"}
        />
        <Stat
          value={data.queue_depth}
          label={`pipeline jobs queued · ${data.running_jobs} running`}
          tone={data.queue_depth ? "warn" : "default"}
        />
      </div>
      <Caption>Report generation queue: {data.report_queue}.</Caption>
    </div>
  );
}

export function PendingMappings({ data }: { data: MappingsData }) {
  const open = useOpenLink();
  return (
    <div>
      <Stat
        value={data.count}
        label="mappings in Draft (never published)"
        tone={data.count ? "warn" : "good"}
      />
      {data.items.length > 0 ? (
        <ul className="mt-3">
          {data.items.map((m) => (
            <li key={m.id}>
              <button className={linkRowCls} onClick={() => open(m.link)}>
                <span className="font-mono text-[11px] font-semibold text-[#168FA8] w-16 shrink-0">
                  {m.code}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[#172033] dark:text-slate-100 truncate">
                    {m.name}
                  </span>
                  <span className="block text-[#526174] dark:text-slate-400 truncate">
                    {m.source_system || "—"} · by {m.created_by || "—"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Every mapping has a published version.</Empty>
      )}
    </div>
  );
}

export function RecentPipelineRuns({ data }: { data: PipelineRunsData }) {
  if (!data.items.length) return <Empty>No pipeline job in this period.</Empty>;
  return (
    <ul>
      {data.items.map((j) => (
        <li key={j.id} className={rowCls}>
          <span className="font-mono text-[11px] text-[#7B8798] w-14 shrink-0">JOB-{j.id}</span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-[#172033] dark:text-slate-100 truncate">
              {j.participant_name} · {j.source_name ?? j.trigger}
            </span>
            <span className="block text-[#526174] dark:text-slate-400">
              {j.trigger} · {timeAgo(j.queued_at)} · {j.records_processed.toLocaleString()} records
              {j.error_count ? ` · ${plural(j.error_count, "error")}` : ""}
            </span>
          </span>
          <Badge status={j.status} />
        </li>
      ))}
    </ul>
  );
}
