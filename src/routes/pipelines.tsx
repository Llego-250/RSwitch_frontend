import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
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
  ShieldCheck,
  RotateCcw,
  StopCircle,
} from "lucide-react";

export const Route = createFileRoute("/pipelines")({
  component: PipelineMonitor,
});

type JobStatus = "running" | "completed" | "failed" | "queued" | "paused";

type Job = {
  id: string;
  name: string;
  institution: string;
  source: string;
  status: JobStatus;
  progress: number;
  start: string;
  duration: string;
  records: string;
  errors: number;
  logs: string[];
};

const INITIAL_JOBS: Job[] = [
  {
    id: "j1",
    name: "bk-core-ingest-v3",
    institution: "Bank of Kigali",
    source: "Core Banking API",
    status: "completed",
    progress: 100,
    start: "12:00:00",
    duration: "3m 12s",
    records: "128,400",
    errors: 0,
    logs: [
      "12:00:00 [INFO] Pipeline initialized for Bank of Kigali",
      "12:00:05 [INFO] Schema validation passed against ISO 20022 mapping v3.1",
      "12:01:20 [INFO] Processing batch 1..50 (128,400 records)",
      "12:03:12 [SUCCESS] Pipeline completed successfully. 0 validation errors.",
    ],
  },
  {
    id: "j2",
    name: "mtn-momo-stream-sync",
    institution: "MTN Mobile Money",
    source: "Mobile Money Switch Feed",
    status: "running",
    progress: 67,
    start: "12:08:00",
    duration: "2m 14s",
    records: "56,210",
    errors: 0,
    logs: [
      "12:08:00 [INFO] Streaming connection established to MTN MoMo Gateway",
      "12:08:03 [INFO] Token authentication verified",
      "12:09:30 [INFO] Ingesting stream batch 34 (67% complete)...",
    ],
  },
  {
    id: "j3",
    name: "equity-pos-pull",
    institution: "Equity Bank Rwanda",
    source: "Card Switch Feed",
    status: "completed",
    progress: 100,
    start: "11:45:00",
    duration: "8m 01s",
    records: "45,890",
    errors: 0,
    logs: [
      "11:45:00 [INFO] Job triggered via scheduled cron (0 0 * * *)",
      "11:45:10 [INFO] Payload received (45,890 record metadata entries)",
      "11:53:01 [SUCCESS] Ingestion completed into RDIP Data Store",
    ],
  },
  {
    id: "j4",
    name: "inkomoko-mfi-ingest",
    institution: "Inkomoko MFI",
    source: "Manual CSV Upload",
    status: "failed",
    progress: 23,
    start: "09:30:00",
    duration: "1m 44s",
    records: "2,100",
    errors: 3,
    logs: [
      "09:30:00 [INFO] Ingestion job started for file Inkomoko_Q2_Portfolio.csv",
      "09:30:45 [WARN] Schema warning: missing optional tax identifier in row 14",
      "09:31:12 [ERROR] Schema validation failed: Row 42 negative value in PAR_30d",
      "09:31:44 [FATAL] Job failed per §6.4 rule (no partial ingestion permitted).",
    ],
  },
  {
    id: "j5",
    name: "zigama-[#56B4D3]-sync",
    institution: "Zigama CSS SACCO",
    source: "Manual XML Feed",
    status: "running",
    progress: 45,
    start: "12:09:00",
    duration: "1m 02s",
    records: "12,300",
    errors: 0,
    logs: [
      "12:09:00 [INFO] XML Schema parser started",
      "12:09:30 [INFO] Normalizing 12,300 records to JSON Canonical format (45%)",
    ],
  },
  {
    id: "j6",
    name: "umwalimu-sacco-api-pull",
    institution: "Umwalimu SACCO",
    source: "Automated API",
    status: "queued",
    progress: 0,
    start: "—",
    duration: "—",
    records: "—",
    errors: 0,
    logs: ["12:10:00 [QUEUED] Waiting in worker queue slot 2..."],
  },
];

type StatusFilter = "all" | "running" | "completed" | "failed" | "queued" | "paused";

function PipelineMonitor() {
  const { role } = useRole();
  const canManagePipelines = canManage(role, "pipelines");

  const [jobs, setJobs]                   = useState<Job[]>(INITIAL_JOBS);
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Config State (§5.4 REQ-PIPE-008)
  const [newInst, setNewInst]         = useState("Bank of Kigali");
  const [newName, setNewName]         = useState("");
  const [newSource, setNewSource]     = useState("Core Banking");
  const [newCron, setNewCron]         = useState("0 */4 * * *");
  const [newMapping, setNewMapping]   = useState("ISO 20022 Canonical v3.1");

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const matchSearch =
        search.trim() === "" ||
        j.name.toLowerCase().includes(search.toLowerCase()) ||
        j.institution.toLowerCase().includes(search.toLowerCase()) ||
        j.source.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || j.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [jobs, search, statusFilter]);

  // Actions for Technical/Admin users
  function handleReprocess(id: string) {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? {
              ...j,
              status: "running",
              progress: 10,
              errors: 0,
              logs: [...j.logs, `${new Date().toLocaleTimeString()} [REPROCESS] Job restarted by ${role}`],
            }
          : j
      )
    );
  }

  function handleStopJob(id: string) {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? {
              ...j,
              status: "paused",
              logs: [...j.logs, `${new Date().toLocaleTimeString()} [STOP] Execution manually stopped by Technical User`],
            }
          : j
      )
    );
  }

  function handleCreatePipeline() {
    if (!newName) return;
    const created: Job = {
      id: `j${jobs.length + 1}`,
      name: newName,
      institution: newInst,
      source: newSource,
      status: "queued",
      progress: 0,
      start: "—",
      duration: "—",
      records: "0",
      errors: 0,
      logs: [`${new Date().toLocaleTimeString()} Pipeline config created. Schedule: ${newCron}, Target: ${newMapping}`],
    };
    setJobs([created, ...jobs]);
    setShowCreateModal(false);
    setNewName("");
  }

  return (
    <AppShell
      title="Data Ingestion Pipeline Monitor"
      breadcrumb="CONNECT › PIPELINES"
      scope="Ingestion Jobs"
      primaryAction={
        canManagePipelines ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)}>
            New Pipeline Config
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pipelines or institution…"
              className="h-8 pl-8 pr-3 rounded-lg text-xs w-60 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1">
            {(["all", "running", "completed", "failed", "queued", "paused"] as StatusFilter[]).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`h-8 px-3 rounded-lg text-xs font-medium border capitalize transition-colors cursor-pointer ${
                  statusFilter === st
                    ? "bg-[#56B4D3] text-[#092E3D] font-bold border-[#56B4D3]"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>REQ-PIPE-010: Aggregate Metadata Only (No Customer Records)</span>
          </div>
        </>
      }
    >
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Active Ingestion Jobs" value={jobs.filter(j => j.status === "running").length.toString()} source="pipeline-engine" freshness="live" />
        <KpiCard label="Completed Today" value={jobs.filter(j => j.status === "completed").length.toString()} source="pipeline-engine" freshness="live" />
        <KpiCard label="Failed Pipeline Jobs" value={jobs.filter(j => j.status === "failed").length.toString()} delta={{ dir: "up", text: "+1", tone: "bad" }} source="pipeline-engine" freshness="live" />
        <KpiCard label="Queued Jobs" value={jobs.filter(j => j.status === "queued").length.toString()} source="queue-manager" freshness="live" />
      </div>

      {/* Main Jobs Table */}
      <SectionCard title="Active & Recent Data Ingestion Pipelines (§5.4)" noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {["", "Job Name", "Institution", "Status", "Progress", "Start Time", "Duration", "Records", "Actions"].map((col) => (
                  <th key={col} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((job) => {
                const isExpanded = expandedId === job.id;
                return (
                  <tbody key={job.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : job.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-3 w-8 text-center text-slate-400">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">{job.name}</div>
                        <div className="text-[11px] text-slate-400">{job.source}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#56B4D3]">{job.institution}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 w-36 font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                job.status === "completed" ? "bg-emerald-500" : job.status === "failed" ? "bg-red-500" : "bg-[#56B4D3]"
                              }`}
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 w-8">{job.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{job.start}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{job.duration}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{job.records}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {job.status === "failed" && canManagePipelines && (
                            <button
                              onClick={() => handleReprocess(job.id)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300 hover:bg-red-100 flex items-center gap-1 cursor-pointer"
                              title="Reprocess Failed Job (REQ-PIPE-005)"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reprocess
                            </button>
                          )}
                          {job.status === "running" && canManagePipelines && (
                            <button
                              onClick={() => handleStopJob(job.id)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
                              title="Stop Running Job (REQ-PIPE-006)"
                            >
                              <StopCircle className="h-3 w-3" />
                              Stop Job
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Step-by-Step Execution Log Drawer (REQ-PIPE-004) */}
                    {isExpanded && (
                      <tr className="bg-slate-900 text-slate-100">
                        <td colSpan={9} className="p-4 font-mono text-xs leading-relaxed space-y-2">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[#56B4D3] font-bold">
                            <span>Step-by-Step Execution Log — {job.name}</span>
                            <span>Retained for 90 Days (REQ-PIPE-009)</span>
                          </div>
                          <div className="space-y-1">
                            {job.logs.map((logLine, idx) => (
                              <div key={idx} className="flex items-start gap-2">
                                <span className="text-slate-500 font-bold shrink-0">#{idx + 1}</span>
                                <span className={logLine.includes("ERROR") || logLine.includes("FATAL") ? "text-red-400 font-bold" : logLine.includes("SUCCESS") ? "text-emerald-400 font-bold" : "text-slate-300"}>
                                  {logLine}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Create Pipeline Config Modal (§5.4 REQ-PIPE-008) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Create New Pipeline Configuration</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Source Institution</label>
                <select
                  value={newInst}
                  onChange={(e) => setNewInst(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Bank of Kigali">Bank of Kigali</option>
                  <option value="MTN Mobile Money">MTN Mobile Money</option>
                  <option value="Equity Bank Rwanda">Equity Bank Rwanda</option>
                  <option value="Inkomoko MFI">Inkomoko MFI</option>
                  <option value="Zigama CSS SACCO">Zigama CSS SACCO</option>
                  <option value="Umwalimu SACCO">Umwalimu SACCO</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pipeline Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. bk-liquidity-nightly-sync"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Source System Type</label>
                <input
                  type="text"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder="e.g. Core Banking / Mobile Money"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Schedule (Cron Expression)</label>
                <input
                  type="text"
                  value={newCron}
                  onChange={(e) => setNewCron(e.target.value)}
                  placeholder="0 */4 * * *"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Mapping Version</label>
                <select
                  value={newMapping}
                  onChange={(e) => setNewMapping(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="ISO 20022 Canonical v3.1">ISO 20022 Canonical v3.1 (Published)</option>
                  <option value="JSON Canonical v2.0">JSON Canonical v2.0 (Published)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowCreateModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={handleCreatePipeline}>Save Pipeline Config</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
