import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  FilterChip,
  SectionCard,
} from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Play,
  Pause,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Plus,
  Activity,
  Search,
} from "lucide-react";

export const Route = createFileRoute("/pipelines")({
  component: Pipelines,
});

type JobStatus = "completed" | "running" | "failed" | "queued";

interface Job {
  id: string;
  name: string;
  source: string;
  status: JobStatus;
  progress: number;
  start: string;
  duration: string;
  records: string;
  errors: number;
}

const JOBS: Job[] = [
  {
    id: "j1",
    name: "core-banking-ingest",
    source: "Core Banking",
    status: "completed",
    progress: 100,
    start: "12:00:00",
    duration: "3m 12s",
    records: "128,400",
    errors: 0,
  },
  {
    id: "j2",
    name: "mobile-money-sync",
    source: "Mobile Money",
    status: "running",
    progress: 67,
    start: "12:08:00",
    duration: "2m 14s",
    records: "56,210",
    errors: 0,
  },
  {
    id: "j3",
    name: "credit-bureau-pull",
    source: "Credit Bureau",
    status: "completed",
    progress: 100,
    start: "11:45:00",
    duration: "8m 01s",
    records: "45,890",
    errors: 0,
  },
  {
    id: "j4",
    name: "erp-nightly-ingest",
    source: "ERP",
    status: "failed",
    progress: 23,
    start: "09:30:00",
    duration: "1m 44s",
    records: "2,100",
    errors: 3,
  },
  {
    id: "j5",
    name: "payment-gw-stream",
    source: "Payment GW",
    status: "running",
    progress: 45,
    start: "12:09:00",
    duration: "1m 02s",
    records: "12,300",
    errors: 0,
  },
  {
    id: "j6",
    name: "fraud-score-update",
    source: "Fraud ML",
    status: "queued",
    progress: 0,
    start: "—",
    duration: "—",
    records: "—",
    errors: 0,
  },
  {
    id: "j7",
    name: "regulatory-feed",
    source: "Regulatory",
    status: "completed",
    progress: 100,
    start: "11:00:00",
    duration: "12m 30s",
    records: "890",
    errors: 0,
  },
  {
    id: "j8",
    name: "inclusion-analytics",
    source: "Analytics",
    status: "completed",
    progress: 100,
    start: "10:30:00",
    duration: "5m 20s",
    records: "22,400",
    errors: 0,
  },
];

const LOG_LINES: Record<string, { time: string; level: "INFO" | "WARN" | "ERROR"; msg: string }[]> = {
  j1: [
    { time: "12:00:02", level: "INFO",  msg: "Connection established to core-banking source (ISO 20022)" },
    { time: "12:01:18", level: "INFO",  msg: "Schema validation passed — 128,400 records ingested" },
    { time: "12:02:44", level: "INFO",  msg: "Canonical transform applied, checksum verified" },
    { time: "12:03:12", level: "INFO",  msg: "Job completed successfully, lineage recorded" },
  ],
  j2: [
    { time: "12:08:01", level: "INFO",  msg: "Stream opened: mobile-money-sync / partition 0-3" },
    { time: "12:09:05", level: "INFO",  msg: "Processing batch 3 of 5 — 56,210 records received" },
    { time: "12:09:44", level: "WARN",  msg: "Latency spike on partition 2 (p99: 420ms > threshold 300ms)" },
    { time: "12:10:14", level: "INFO",  msg: "Throughput nominal, continuing stream…" },
  ],
  j3: [
    { time: "11:45:00", level: "INFO",  msg: "Initiated pull from credit-bureau endpoint v3" },
    { time: "11:48:32", level: "INFO",  msg: "Rate limit: 500 req/min enforced, batching enabled" },
    { time: "11:52:11", level: "INFO",  msg: "45,890 records received, deduplication complete" },
    { time: "11:53:01", level: "INFO",  msg: "Job completed — 0 validation errors" },
  ],
  j4: [
    { time: "09:30:00", level: "INFO",  msg: "ERP nightly ingest started via SFTP connector" },
    { time: "09:30:22", level: "ERROR", msg: "Schema mismatch: field 'currency_code' — expected ISO 4217, got 'UGX-legacy'" },
    { time: "09:31:01", level: "ERROR", msg: "Row validation failed on 3 records — halting batch" },
    { time: "09:31:44", level: "ERROR", msg: "Job aborted at 23% — manual review required" },
  ],
  j5: [
    { time: "12:09:00", level: "INFO",  msg: "Payment gateway stream connected (TLS 1.3)" },
    { time: "12:09:31", level: "INFO",  msg: "Processing 12,300 events — avg latency 18ms" },
    { time: "12:10:02", level: "INFO",  msg: "Fraud scoring enrichment applied to batch 2" },
    { time: "12:10:02", level: "INFO",  msg: "Awaiting batch 3…" },
  ],
  j6: [
    { time: "—",        level: "INFO",  msg: "Job queued, waiting for fraud-score-update slot" },
    { time: "—",        level: "INFO",  msg: "Estimated start: 12:15:00 (dependency: payment-gw-stream)" },
    { time: "—",        level: "INFO",  msg: "ML model v2.4.1 staged and ready" },
    { time: "—",        level: "INFO",  msg: "Queue position: 1 of 1" },
  ],
  j7: [
    { time: "11:00:00", level: "INFO",  msg: "Regulatory feed ingestion started — FSA endpoint" },
    { time: "11:06:10", level: "INFO",  msg: "890 regulatory records normalised to canonical schema" },
    { time: "11:11:20", level: "INFO",  msg: "Compliance mapping applied: PCIDSS v4, Basel III" },
    { time: "11:12:30", level: "INFO",  msg: "Feed complete — report forwarded to compliance module" },
  ],
  j8: [
    { time: "10:30:00", level: "INFO",  msg: "Inclusion analytics pipeline initiated" },
    { time: "10:32:40", level: "INFO",  msg: "22,400 customer segments processed, scoring v1.8" },
    { time: "10:34:50", level: "INFO",  msg: "Geospatial enrichment complete — 97.3% match rate" },
    { time: "10:35:20", level: "INFO",  msg: "Results written to analytics store, dashboard refreshed" },
  ],
};

function progressBarColor(status: JobStatus): string {
  if (status === "completed") return "var(--ok)";
  if (status === "running")   return "var(--primary-500)";
  if (status === "failed")    return "var(--fail)";
  return "var(--neutral-300, #D1D5DB)";
}

function logLevelColor(level: "INFO" | "WARN" | "ERROR"): string {
  if (level === "ERROR") return "var(--fail)";
  if (level === "WARN")  return "var(--warn)";
  return "var(--neutral-500)";
}

function Pipelines() {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [dateRange, setDateRange] = useState("Today");

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const filteredJobs = JOBS.filter((j) => {
    const matchesSearch =
      searchQuery.trim() === "" ||
      j.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.source.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || j.status === statusFilter.toLowerCase();
    const matchesSource =
      sourceFilter === "All" || j.source === sourceFilter;
    return matchesSearch && matchesStatus && matchesSource;
  });

  return (
    <AppShell
      title="Pipeline Monitor"
      breadcrumb="CONNECT › PIPELINES"
      scope="all-sources"
      primaryAction={
        <PrimaryButton icon={<Plus className="h-4 w-4" />}>
          Create Pipeline
        </PrimaryButton>
      }
      toolbar={
        <>
          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
              style={{ color: "var(--neutral-400)" }}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs or sources…"
              className="h-8 pl-8 pr-3 rounded-lg text-[13px] w-52 focus:outline-none focus:ring-1"
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--paper)",
                color: "var(--neutral-900)",
                focusRingColor: "var(--primary-500)",
              }}
            />
          </div>

          {/* Status filter */}
          <FilterChip
            label="Status"
            value={statusFilter}
            onClick={() => {
              const options = ["All", "Running", "Completed", "Failed", "Queued"];
              const idx = options.indexOf(statusFilter);
              setStatusFilter(options[(idx + 1) % options.length]);
            }}
          />

          {/* Date range */}
          <FilterChip
            label="Range"
            value={dateRange}
            onClick={() => {
              const options = ["Today", "Last 7d", "Last 30d"];
              const idx = options.indexOf(dateRange);
              setDateRange(options[(idx + 1) % options.length]);
            }}
          />

          {/* Source filter */}
          <FilterChip
            label="Source"
            value={sourceFilter}
            onClick={() => {
              const sources = ["All", ...Array.from(new Set(JOBS.map((j) => j.source)))];
              const idx = sources.indexOf(sourceFilter);
              setSourceFilter(sources[(idx + 1) % sources.length]);
            }}
          />

          <div className="ml-auto flex items-center gap-2">
            <SecondaryButton icon={<RefreshCw className="h-3.5 w-3.5" />}>
              Refresh
            </SecondaryButton>
            <SecondaryButton icon={<Activity className="h-3.5 w-3.5" />}>
              Live
            </SecondaryButton>
          </div>
        </>
      }
    >
      {/* ── Row 1: Summary KPIs ── */}
      <div
        className="grid gap-4 mb-5"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        <KpiCard
          label="Total Jobs (24h)"
          value="47"
          freshness="live"
          context="all pipelines · today"
        />
        <KpiCard
          label="Running"
          value="3"
          delta={{ dir: "up", text: "+1", tone: "neutral" }}
          freshness="live"
          context="active right now"
        />
        <KpiCard
          label="Failed (24h)"
          value="2"
          delta={{ dir: "up", text: "+2", tone: "bad" }}
          freshness="live"
          context="require attention"
        />
        <KpiCard
          label="Completed (24h)"
          value="42"
          delta={{ dir: "up", text: "+5", tone: "good" }}
          freshness="live"
          context="since midnight"
        />
      </div>

      {/* ── Row 2: Pipeline Jobs table ── */}
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            Pipeline Jobs
            <span
              className="font-mono text-[11px] font-normal px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--neutral-100)",
                color: "var(--neutral-500)",
              }}
            >
              {filteredJobs.length} of {JOBS.length}
            </span>
          </span>
        }
        action={
          <SecondaryButton icon={<Play className="h-3.5 w-3.5" />}>
            Run All
          </SecondaryButton>
        }
        noPad
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead
              style={{
                backgroundColor: "var(--neutral-100)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <tr>
                {/* expand toggle col */}
                <th className="w-10 px-3 py-3" />
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Job Name
                </th>
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Source
                </th>
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Status
                </th>
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide min-w-30"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Progress
                </th>
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Start Time
                </th>
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Duration
                </th>
                <th
                  className="text-right px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Records
                </th>
                <th
                  className="text-right px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Errors
                </th>
                <th
                  className="text-right px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job, i) => {
                const isExpanded = expandedRows.has(job.id);
                const isFailed = job.status === "failed";
                const barColor = progressBarColor(job.status);
                const logs = LOG_LINES[job.id] ?? [];

                return (
                  <>
                    <tr
                      key={job.id}
                      onClick={() => toggleRow(job.id)}
                      style={{
                        borderBottom: isExpanded
                          ? "none"
                          : "1px solid var(--border)",
                        backgroundColor:
                          isFailed
                            ? "rgba(225,29,72,0.03)"
                            : isExpanded
                            ? "var(--primary-50)"
                            : i % 2 === 0
                            ? "transparent"
                            : "var(--neutral-50)",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        if (!isFailed)
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            "var(--primary-50)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded) {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            isFailed
                              ? "rgba(225,29,72,0.03)"
                              : i % 2 === 0
                              ? "transparent"
                              : "var(--neutral-50)";
                        }
                      }}
                    >
                      {/* Expand chevron */}
                      <td className="px-3 py-3 text-center">
                        {isExpanded ? (
                          <ChevronDown
                            className="h-3.5 w-3.5 mx-auto"
                            style={{ color: "var(--primary-500)" }}
                          />
                        ) : (
                          <ChevronRight
                            className="h-3.5 w-3.5 mx-auto"
                            style={{ color: "var(--neutral-400)" }}
                          />
                        )}
                      </td>

                      {/* Job name */}
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-[13px]"
                          style={{ color: "var(--neutral-900)" }}
                        >
                          {job.name}
                        </span>
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--neutral-100)",
                            color: "var(--neutral-700)",
                          }}
                        >
                          {job.source}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <StatusBadge status={job.status} />
                      </td>

                      {/* Progress bar */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex-1 h-1.5 rounded-full overflow-hidden"
                            style={{ backgroundColor: "var(--neutral-200)", minWidth: "60px" }}
                          >
                            <div
                              style={{
                                width: `${job.progress}%`,
                                height: "100%",
                                backgroundColor: barColor,
                                borderRadius: "9999px",
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>
                          <span
                            className="font-mono text-[11px] tabular-nums w-8 text-right"
                            style={{ color: "var(--neutral-500)" }}
                          >
                            {job.progress}%
                          </span>
                        </div>
                      </td>

                      {/* Start time */}
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-[13px] tabular-nums"
                          style={{ color: "var(--neutral-700)" }}
                        >
                          {job.start}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-[13px] tabular-nums"
                          style={{ color: "var(--neutral-500)" }}
                        >
                          {job.duration}
                        </span>
                      </td>

                      {/* Records */}
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-mono text-[13px] tabular-nums"
                          style={{ color: "var(--neutral-700)" }}
                        >
                          {job.records}
                        </span>
                      </td>

                      {/* Errors */}
                      <td className="px-4 py-3 text-right">
                        {job.errors > 0 ? (
                          <span
                            className="font-mono text-[13px] font-semibold tabular-nums"
                            style={{ color: "var(--fail)" }}
                          >
                            {job.errors}
                          </span>
                        ) : (
                          <span
                            className="font-mono text-[13px] tabular-nums"
                            style={{ color: "var(--neutral-400)" }}
                          >
                            —
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-2">
                          {isFailed ? (
                            <button
                              className="h-7 px-3 rounded text-[12px] font-semibold transition-colors"
                              style={{
                                backgroundColor: "var(--fail-bg)",
                                color: "var(--fail)",
                                border: "1px solid rgba(225,29,72,0.2)",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--fail)";
                                (e.currentTarget as HTMLElement).style.color = "#fff";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--fail-bg)";
                                (e.currentTarget as HTMLElement).style.color =
                                  "var(--fail)";
                              }}
                            >
                              Reprocess
                            </button>
                          ) : job.status === "running" ? (
                            <button
                              className="h-7 w-7 rounded grid place-items-center transition-colors"
                              aria-label="Pause job"
                              style={{
                                backgroundColor: "var(--neutral-100)",
                                color: "var(--neutral-700)",
                                border: "1px solid var(--border)",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--neutral-200)";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--neutral-100)";
                              }}
                            >
                              <Pause className="h-3.5 w-3.5" />
                            </button>
                          ) : job.status === "queued" ? (
                            <button
                              className="h-7 w-7 rounded grid place-items-center transition-colors"
                              aria-label="Run job"
                              style={{
                                backgroundColor: "var(--primary-50)",
                                color: "var(--primary-500)",
                                border: "1px solid var(--primary-100)",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--primary-100)";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--primary-50)";
                              }}
                            >
                              <Play className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              className="h-7 px-3 rounded text-[12px] font-medium transition-colors"
                              style={{
                                backgroundColor: "var(--neutral-100)",
                                color: "var(--neutral-700)",
                                border: "1px solid var(--border)",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--neutral-200)";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--neutral-100)";
                              }}
                            >
                              Logs
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded log panel */}
                    {isExpanded && (
                      <tr
                        key={`${job.id}-logs`}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td
                          colSpan={10}
                          style={{ padding: 0 }}
                        >
                          <div
                            style={{
                              backgroundColor: "var(--neutral-900)",
                              borderTop: "1px solid rgba(255,255,255,0.06)",
                              padding: "12px 16px 14px 48px",
                            }}
                          >
                            <div
                              className="font-mono text-[11px] uppercase tracking-widest mb-2"
                              style={{ color: "rgba(255,255,255,0.3)" }}
                            >
                              {job.name} · execution log
                            </div>
                            <div className="space-y-1">
                              {logs.map((line, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-3 font-mono text-[12px]"
                                >
                                  <span
                                    className="shrink-0 tabular-nums"
                                    style={{ color: "rgba(255,255,255,0.3)", minWidth: "58px" }}
                                  >
                                    {line.time}
                                  </span>
                                  <span
                                    className="shrink-0 font-semibold w-10"
                                    style={{ color: logLevelColor(line.level) }}
                                  >
                                    {line.level}
                                  </span>
                                  <span style={{ color: "rgba(255,255,255,0.75)" }}>
                                    {line.msg}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}

              {filteredJobs.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-10 text-center"
                    style={{ color: "var(--neutral-400)" }}
                  >
                    <span className="font-mono text-[13px]">
                      No jobs match the current filters.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
