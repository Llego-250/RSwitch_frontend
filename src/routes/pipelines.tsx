import { createFileRoute } from "@tanstack/react-router"
import { useState, useMemo } from "react"
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "@/components/AppShell"
import { KpiCard } from "@/components/KpiCard"
import { StatusBadge } from "@/components/StatusBadge"
import {
  Play,
  Pause,
  Plus,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Activity,
  AlertTriangle,
  Search,
  X,
} from "lucide-react"

export const Route = createFileRoute("/pipelines")({
  component: PipelineMonitor,
})

const JOBS = [
  {
    id: "j1",
    name: "core-banking-ingest",
    source: "Core Banking",
    status: "completed" as const,
    progress: 100,
    start: "12:00:00",
    duration: "3m 12s",
    records: "128,400",
    errors: 0,
    logs: [
      "12:00:00 Job started",
      "12:00:05 Connecting to source",
      "12:01:20 Processing records...",
      "12:03:12 Completed: 128,400 records",
    ],
  },
  {
    id: "j2",
    name: "mobile-money-sync",
    source: "Mobile Money",
    status: "running" as const,
    progress: 67,
    start: "12:08:00",
    duration: "2m 14s",
    records: "56,210",
    errors: 0,
    logs: [
      "12:08:00 Job started",
      "12:08:03 Source connected",
      "12:09:30 Processing 56,210 records (67%)...",
    ],
  },
  {
    id: "j3",
    name: "credit-bureau-pull",
    source: "Credit Bureau",
    status: "completed" as const,
    progress: 100,
    start: "11:45:00",
    duration: "8m 01s",
    records: "45,890",
    errors: 0,
    logs: [
      "11:45:00 Job started",
      "11:45:10 Auth OK",
      "11:53:01 Completed: 45,890 records",
    ],
  },
  {
    id: "j4",
    name: "erp-nightly-ingest",
    source: "ERP",
    status: "failed" as const,
    progress: 23,
    start: "09:30:00",
    duration: "1m 44s",
    records: "2,100",
    errors: 3,
    logs: [
      "09:30:00 Job started",
      "09:30:45 Warning: slow response",
      "09:31:12 ERROR: Connection timeout",
      "09:31:44 Job failed after 3 errors",
    ],
  },
  {
    id: "j5",
    name: "payment-gw-stream",
    source: "Payment GW",
    status: "running" as const,
    progress: 45,
    start: "12:09:00",
    duration: "1m 02s",
    records: "12,300",
    errors: 0,
    logs: [
      "12:09:00 Job started",
      "12:09:30 Stream active (45%)",
    ],
  },
  {
    id: "j6",
    name: "fraud-score-update",
    source: "Fraud ML",
    status: "queued" as const,
    progress: 0,
    start: "—",
    duration: "—",
    records: "—",
    errors: 0,
    logs: ["Waiting in queue..."],
  },
  {
    id: "j7",
    name: "regulatory-feed",
    source: "Regulatory",
    status: "completed" as const,
    progress: 100,
    start: "11:00:00",
    duration: "12m 30s",
    records: "890",
    errors: 0,
    logs: [
      "11:00:00 Job started",
      "11:12:30 Completed: 890 records",
    ],
  },
  {
    id: "j8",
    name: "inclusion-analytics",
    source: "Analytics",
    status: "completed" as const,
    progress: 100,
    start: "10:30:00",
    duration: "5m 20s",
    records: "22,400",
    errors: 0,
    logs: [
      "10:30:00 Job started",
      "10:35:20 Completed: 22,400 records",
    ],
  },
]

type StatusFilter = "all" | "running" | "completed" | "failed" | "queued"
const STATUS_FILTERS: StatusFilter[] = ["all", "running", "completed", "failed", "queued"]

const PROGRESS_COLOR: Record<string, string> = {
  completed: "var(--ok)",
  running: "var(--primary-500)",
  failed: "var(--fail)",
  queued: "var(--neutral-200)",
}

export default function PipelineMonitor() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reprocessing, setReprocessing] = useState<Set<string>>(new Set())
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newPipeline, setNewPipeline] = useState({
    name: "",
    source: "",
    schedule: "Real-time",
    timeout: "30",
  })

  const filtered = useMemo(() => {
    return JOBS.filter((j) => {
      const matchSearch =
        search.trim() === "" ||
        j.name.toLowerCase().includes(search.toLowerCase()) ||
        j.source.toLowerCase().includes(search.toLowerCase())
      const matchStatus = statusFilter === "all" || j.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [search, statusFilter])

  const runningCount = JOBS.filter((j) => j.status === "running").length
  const failedCount = JOBS.filter((j) => j.status === "failed").length
  const completedCount = JOBS.filter((j) => j.status === "completed").length

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  function handleReprocess(id: string) {
    setReprocessing((prev) => new Set(prev).add(id))
    setTimeout(() => {
      setReprocessing((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 2000)
  }

  return (
    <AppShell
      title="Pipeline Monitor"
      breadcrumb="CONNECT › PIPELINES"
      primaryAction={
        <PrimaryButton
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setShowCreateModal(true)}
        >
          Create Pipeline
        </PrimaryButton>
      }
      toolbar={
        <>
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
              style={{ color: "var(--neutral-400)" }}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pipelines…"
              className="w-full h-8 pl-8 pr-3 rounded-lg text-[13px] border focus:outline-none transition-colors"
              style={{
                backgroundColor: "var(--neutral-50)",
                borderColor: "var(--border)",
                color: "var(--neutral-900)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--primary-500)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((s) => {
              const active = statusFilter === s
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="h-8 px-3 rounded-lg text-[12px] font-medium transition-colors capitalize"
                  style={{
                    backgroundColor: active ? "var(--primary-500)" : "var(--card)",
                    color: active ? "#fff" : "var(--neutral-700)",
                    border: active
                      ? "1px solid var(--primary-500)"
                      : "1px solid var(--border)",
                  }}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              )
            })}
          </div>

          {/* Clear search */}
          {search.trim() !== "" && (
            <button
              onClick={() => setSearch("")}
              className="h-8 px-3 rounded-lg text-[13px] inline-flex items-center gap-1.5 transition-colors"
              style={{ color: "var(--neutral-500)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.color = "var(--neutral-900)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.color = "var(--neutral-500)")
              }
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </>
      }
    >
      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Total Jobs (24h)"
          value="47"
          context="last 24 hours"
          freshness="live"
        />
        <KpiCard
          label="Running"
          value={String(runningCount)}
          delta={{ dir: "up", text: "+1", tone: "neutral" }}
          freshness="live"
        />
        <KpiCard
          label="Failed (24h)"
          value={String(failedCount)}
          delta={{ dir: "up", text: "+2", tone: "bad" }}
          freshness="live"
        />
        <KpiCard
          label="Completed"
          value={String(completedCount)}
          delta={{ dir: "up", text: "+5", tone: "good" }}
          freshness="live"
        />
      </div>

      {/* ── Pipeline jobs table ── */}
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4" style={{ color: "var(--primary-500)" }} />
            Pipeline Jobs
          </span>
        }
        action={
          <SecondaryButton
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => {}}
          >
            Refresh
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
                <th
                  className="px-3 py-3 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)", width: "36px" }}
                />
                <th
                  className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Job
                </th>
                <th
                  className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Source
                </th>
                <th
                  className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Status
                </th>
                <th
                  className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)", minWidth: "120px" }}
                >
                  Progress
                </th>
                <th
                  className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Start
                </th>
                <th
                  className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Duration
                </th>
                <th
                  className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Records
                </th>
                <th
                  className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Errors
                </th>
                <th
                  className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-10 text-center text-[13px]"
                    style={{ color: "var(--neutral-500)" }}
                  >
                    No jobs match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((job) => (
                  <>
                    <tr
                      key={job.id}
                      className="hover:bg-[var(--neutral-50)] cursor-pointer"
                      style={{ borderBottom: "1px solid var(--border)" }}
                      onClick={() => toggleExpand(job.id)}
                    >
                      {/* Expand chevron */}
                      <td className="px-3 py-3 text-center" style={{ color: "var(--neutral-400)" }}>
                        {expandedId === job.id ? (
                          <ChevronDown className="h-4 w-4 mx-auto" style={{ color: "var(--primary-500)" }} />
                        ) : (
                          <ChevronRight className="h-4 w-4 mx-auto" />
                        )}
                      </td>

                      {/* Job name */}
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-[12px] font-medium"
                          style={{ color: "var(--neutral-900)" }}
                        >
                          {job.name}
                        </span>
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium"
                          style={{
                            backgroundColor: "var(--neutral-100)",
                            color: "var(--neutral-500)",
                          }}
                        >
                          {job.source}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <StatusBadge status={job.status} />
                      </td>

                      {/* Progress bar */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex-1 rounded-full overflow-hidden"
                            style={{
                              height: "6px",
                              backgroundColor: "var(--neutral-200)",
                              minWidth: "80px",
                            }}
                          >
                            <div
                              style={{
                                width: `${job.progress}%`,
                                height: "100%",
                                backgroundColor:
                                  PROGRESS_COLOR[job.status] ?? "var(--neutral-400)",
                                borderRadius: "9999px",
                                transition: "width 0.3s ease",
                              }}
                            />
                          </div>
                          <span
                            className="font-mono text-[11px] tabular shrink-0"
                            style={{
                              color: "var(--neutral-500)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {job.progress}%
                          </span>
                        </div>
                      </td>

                      {/* Start */}
                      <td
                        className="px-4 py-3 font-mono text-[12px]"
                        style={{
                          color: "var(--neutral-700)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {job.start}
                      </td>

                      {/* Duration */}
                      <td
                        className="px-4 py-3 font-mono text-[12px]"
                        style={{
                          color: "var(--neutral-700)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {job.duration}
                      </td>

                      {/* Records */}
                      <td
                        className="px-4 py-3 font-mono text-[12px]"
                        style={{
                          color: "var(--neutral-700)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {job.records}
                      </td>

                      {/* Errors */}
                      <td className="px-4 py-3">
                        {job.errors > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 font-mono text-[11px] font-medium"
                            style={{ color: "var(--fail)" }}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {job.errors}
                          </span>
                        ) : (
                          <span
                            className="font-mono text-[12px]"
                            style={{ color: "var(--neutral-400)" }}
                          >
                            —
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5">
                          {/* View Logs — all jobs */}
                          <button
                            onClick={() => toggleExpand(job.id)}
                            className="h-7 px-2.5 rounded text-[11px] font-medium transition-colors"
                            style={{
                              backgroundColor: "var(--primary-50)",
                              color: "var(--primary-500)",
                              border: "1px solid var(--primary-100)",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor =
                                "var(--primary-100)"
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor =
                                "var(--primary-50)"
                            }}
                          >
                            View Logs
                          </button>

                          {/* Failed: Reprocess */}
                          {job.status === "failed" && (
                            <button
                              onClick={() => handleReprocess(job.id)}
                              disabled={reprocessing.has(job.id)}
                              className="h-7 px-2.5 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors disabled:opacity-60"
                              style={{
                                backgroundColor: "var(--fail-bg)",
                                color: "var(--fail)",
                                border: "1px solid #fecdd3",
                              }}
                              onMouseEnter={(e) => {
                                if (!reprocessing.has(job.id))
                                  (e.currentTarget as HTMLElement).style.backgroundColor =
                                    "#ffe0e3"
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--fail-bg)"
                              }}
                            >
                              {reprocessing.has(job.id) ? (
                                <>
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                  <span>Reprocessing…</span>
                                </>
                              ) : (
                                "Reprocess"
                              )}
                            </button>
                          )}

                          {/* Running: Stop */}
                          {job.status === "running" && (
                            <button
                              onClick={() => alert(`Stopping ${job.name}`)}
                              className="h-7 px-2.5 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                              style={{
                                backgroundColor: "var(--warn-bg)",
                                color: "var(--warn)",
                                border: "1px solid #fde68a",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "#fef0c4"
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--warn-bg)"
                              }}
                            >
                              <Pause className="h-3 w-3" />
                              Stop
                            </button>
                          )}

                          {/* Queued: Run Now */}
                          {job.status === "queued" && (
                            <button
                              onClick={() => alert(`Starting ${job.name}`)}
                              className="h-7 px-2.5 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                              style={{
                                backgroundColor: "var(--ok-bg)",
                                color: "var(--ok)",
                                border: "1px solid #99f6e4",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "#b2f9ef"
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                  "var(--ok-bg)"
                              }}
                            >
                              <Play className="h-3 w-3" />
                              Run Now
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded log view */}
                    {expandedId === job.id && (
                      <tr
                        key={`${job.id}-logs`}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td colSpan={10} style={{ padding: 0 }}>
                          <div
                            style={{
                              backgroundColor: "var(--neutral-50)",
                              borderTop: "1px solid var(--border)",
                              padding: "12px 16px",
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className="font-mono text-[11px] uppercase tracking-wide font-medium"
                                style={{ color: "var(--neutral-500)" }}
                              >
                                Execution log — {job.name}
                              </span>
                              <button
                                onClick={() =>
                                  alert(`Downloading logs for ${job.name}`)
                                }
                                className="h-7 px-2.5 rounded text-[11px] font-medium transition-colors"
                                style={{
                                  backgroundColor: "var(--card)",
                                  border: "1px solid var(--border)",
                                  color: "var(--neutral-700)",
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.backgroundColor =
                                    "var(--neutral-100)"
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.backgroundColor =
                                    "var(--card)"
                                }}
                              >
                                Download logs
                              </button>
                            </div>
                            <div
                              className="rounded font-mono text-[12px] leading-relaxed"
                              style={{
                                backgroundColor: "var(--neutral-900)",
                                padding: "10px 14px",
                                overflowX: "auto",
                              }}
                            >
                              {job.logs.map((line, i) => {
                                const tsMatch = line.match(/^(\d{2}:\d{2}:\d{2})\s(.+)/)
                                return (
                                  <div key={i} className="flex gap-3">
                                    {tsMatch ? (
                                      <>
                                        <span
                                          style={{
                                            color: "var(--neutral-400)",
                                            minWidth: "60px",
                                          }}
                                        >
                                          {tsMatch[1]}
                                        </span>
                                        <span
                                          style={{
                                            color:
                                              line.includes("ERROR") ||
                                              line.includes("failed")
                                                ? "#fca5a5"
                                                : line.includes("Warning")
                                                ? "#fcd34d"
                                                : line.includes("Completed")
                                                ? "#6ee7b7"
                                                : "#e5e7eb",
                                          }}
                                        >
                                          {tsMatch[2]}
                                        </span>
                                      </>
                                    ) : (
                                      <span style={{ color: "var(--neutral-400)" }}>
                                        {line}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Create Pipeline Modal ── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2
                className="text-[17px] font-semibold"
                style={{ color: "var(--neutral-900)" }}
              >
                Create Pipeline
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="h-8 w-8 grid place-items-center rounded-md transition-colors"
                style={{ color: "var(--neutral-400)" }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.backgroundColor =
                    "var(--neutral-100)"
                  ;(e.currentTarget as HTMLElement).style.color = "var(--neutral-700)"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = "transparent"
                  ;(e.currentTarget as HTMLElement).style.color = "var(--neutral-400)"
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Name */}
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5"
                  style={{ color: "var(--neutral-700)" }}
                >
                  Pipeline Name
                </label>
                <input
                  type="text"
                  value={newPipeline.name}
                  onChange={(e) =>
                    setNewPipeline((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. core-banking-ingest"
                  className="w-full h-9 px-3 rounded-lg text-[13px] border focus:outline-none transition-colors"
                  style={{
                    backgroundColor: "var(--neutral-50)",
                    borderColor: "var(--border)",
                    color: "var(--neutral-900)",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = "var(--primary-500)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "var(--border)")
                  }
                />
              </div>

              {/* Source */}
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5"
                  style={{ color: "var(--neutral-700)" }}
                >
                  Data Source
                </label>
                <select
                  value={newPipeline.source}
                  onChange={(e) =>
                    setNewPipeline((p) => ({ ...p, source: e.target.value }))
                  }
                  className="w-full h-9 px-3 rounded-lg text-[13px] border appearance-none focus:outline-none cursor-pointer transition-colors"
                  style={{
                    backgroundColor: "var(--neutral-50)",
                    borderColor: "var(--border)",
                    color: newPipeline.source
                      ? "var(--neutral-900)"
                      : "var(--neutral-400)",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 10px center",
                    paddingRight: "30px",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = "var(--primary-500)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "var(--border)")
                  }
                >
                  <option value="">Select a source</option>
                  <option value="Core Banking">Core Banking</option>
                  <option value="Mobile Money">Mobile Money</option>
                  <option value="Credit Bureau">Credit Bureau</option>
                  <option value="ERP">ERP</option>
                  <option value="Payment GW">Payment Gateway</option>
                  <option value="Fraud ML">Fraud ML</option>
                  <option value="Regulatory">Regulatory</option>
                  <option value="Analytics">Analytics</option>
                </select>
              </div>

              {/* Schedule + Timeout row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="block text-[12px] font-medium mb-1.5"
                    style={{ color: "var(--neutral-700)" }}
                  >
                    Schedule
                  </label>
                  <select
                    value={newPipeline.schedule}
                    onChange={(e) =>
                      setNewPipeline((p) => ({ ...p, schedule: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-lg text-[13px] border appearance-none focus:outline-none cursor-pointer"
                    style={{
                      backgroundColor: "var(--neutral-50)",
                      borderColor: "var(--border)",
                      color: "var(--neutral-900)",
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 10px center",
                      paddingRight: "30px",
                    }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor = "var(--primary-500)")
                    }
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "var(--border)")
                    }
                  >
                    <option value="Real-time">Real-time</option>
                    <option value="Hourly">Hourly</option>
                    <option value="Daily">Daily</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label
                    className="block text-[12px] font-medium mb-1.5"
                    style={{ color: "var(--neutral-700)" }}
                  >
                    Timeout (min)
                  </label>
                  <input
                    type="number"
                    value={newPipeline.timeout}
                    onChange={(e) =>
                      setNewPipeline((p) => ({ ...p, timeout: e.target.value }))
                    }
                    min={1}
                    max={120}
                    className="w-full h-9 px-3 rounded-lg text-[13px] border focus:outline-none transition-colors"
                    style={{
                      backgroundColor: "var(--neutral-50)",
                      borderColor: "var(--border)",
                      color: "var(--neutral-900)",
                    }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor = "var(--primary-500)")
                    }
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "var(--border)")
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <SecondaryButton onClick={() => setShowCreateModal(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton onClick={() => setShowCreateModal(false)}>
                Create Pipeline
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
