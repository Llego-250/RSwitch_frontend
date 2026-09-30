import React, { Fragment, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from "@tanstack/react-table";
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
  ArrowUpDown,
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
    name: "inkomoko-loan-ledger",
    institution: "Inkomoko MFI",
    source: "Loan Mgmt System DB",
    status: "failed",
    progress: 32,
    start: "11:30:00",
    duration: "1m 45s",
    records: "12,100",
    errors: 4,
    logs: [
      "11:30:00 [INFO] ETL process initiated",
      "11:31:12 [WARN] Unmapped field encountered: borrower_alt_id_2",
      "11:31:45 [ERROR] Schema validation exception: Record 3,890 failed strict type validation",
      "11:31:45 [FATAL] Job halted due to high error threshold. 4 validation errors.",
    ],
  },
  {
    id: "j5",
    name: "zigama-css-payroll-batch",
    institution: "Zigama CSS SACCO",
    source: "Batch SFTP Server",
    status: "queued",
    progress: 0,
    start: "—",
    duration: "—",
    records: "0",
    errors: 0,
    logs: ["12:10:00 [INFO] Job queued. Waiting for worker pool availability..."],
  },
];

type StatusFilter = "all" | "running" | "completed" | "failed" | "queued" | "paused";

const columnHelper = createColumnHelper<Job>();

function PipelineMonitor() {
  const { role } = useRole();
  const canManagePipelines = canManage(role, "pipelines");
  const { addNotification } = useAppStore();

  const [jobs, setJobs] = useState<Job[]>(INITIAL_JOBS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  // New Config State
  const [newInst, setNewInst] = useState("Bank of Kigali");
  const [newName, setNewName] = useState("");
  const [newSource, setNewSource] = useState("Core Banking");
  const [newCron, setNewCron] = useState("0 */4 * * *");
  const [newMapping, setNewMapping] = useState("ISO 20022 Canonical v3.1");

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
              logs: [
                ...j.logs,
                `${new Date().toLocaleTimeString()} [REPROCESS] Job restarted by ${role}`,
              ],
            }
          : j
      )
    );
    addNotification({
      id: `notif-${Date.now()}`,
      title: "Pipeline Restarted",
      message: `Job ${id} reprocess request triggered successfully.`,
      timestamp: "Just now",
      severity: "info",
    });
  }

  function handleStopJob(id: string) {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? {
              ...j,
              status: "paused",
              logs: [
                ...j.logs,
                `${new Date().toLocaleTimeString()} [STOP] Execution manually stopped by ${role}`,
              ],
            }
          : j
      )
    );
    addNotification({
      id: `notif-${Date.now()}`,
      title: "Pipeline Paused",
      message: `Job ${id} manually stopped by user.`,
      timestamp: "Just now",
      severity: "warning",
    });
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
      logs: [
        `${new Date().toLocaleTimeString()} Pipeline config created. Schedule: ${newCron}, Target: ${newMapping}`,
      ],
    };
    setJobs([created, ...jobs]);
    setShowCreateModal(false);
    setNewName("");
  }

  // TanStack Table setup
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "expander",
        cell: ({ row }) => (
          <span className="text-slate-400">
            {expandedId === row.original.id ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        ),
      }),
      columnHelper.accessor("name", {
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
          >
            Job Name
            <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: (info) => (
          <div>
            <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
              {info.getValue()}
            </div>
            <div className="text-[11px] text-slate-400">
              {info.row.original.source}
            </div>
          </div>
        ),
      }),
      columnHelper.accessor("institution", {
        header: "Institution",
        cell: (info) => (
          <span className="text-xs font-semibold text-[#168FA8]">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor("progress", {
        header: "Progress",
        cell: (info) => {
          const status = info.row.original.status;
          const val = info.getValue();
          return (
            <div className="flex items-center gap-2 w-36 font-mono text-xs">
              <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    status === "completed"
                      ? "bg-emerald-500"
                      : status === "failed"
                      ? "bg-red-500"
                      : "bg-[#168FA8]"
                  }`}
                  style={{ width: `${val}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 w-8">
                {val}%
              </span>
            </div>
          );
        },
      }),
      columnHelper.accessor("start", {
        header: "Start Time",
        cell: (info) => (
          <span className="font-mono text-xs text-slate-500">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("duration", {
        header: "Duration",
        cell: (info) => (
          <span className="font-mono text-xs text-slate-500">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("records", {
        header: "Records",
        cell: (info) => (
          <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const job = row.original;
          return (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              {job.status === "failed" && canManagePipelines && (
                <button
                  onClick={() => handleReprocess(job.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300 hover:bg-red-100 flex items-center gap-1 cursor-pointer"
                  title="Reprocess Failed Job"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reprocess
                </button>
              )}
              {job.status === "running" && canManagePipelines && (
                <button
                  onClick={() => handleStopJob(job.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
                  title="Stop Running Job"
                >
                  <StopCircle className="h-3 w-3" />
                  Stop Job
                </button>
              )}
            </div>
          );
        },
      }),
    ],
    [expandedId, canManagePipelines]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const activeCount = jobs.filter((j) => j.status === "running").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <AppShell
      title="Pipelines"
      subtitle="ETL Execution & Status"
      breadcrumb="CONNECT › PIPELINES"
      scope="Ingestion Jobs"
      primaryAction={
        canManagePipelines ? (
          <PrimaryButton
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            New Pipeline Config
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7B8798]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pipelines or institutions..."
              className="h-9 w-64 pl-8 pr-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-[#168FA8]"
            />
          </div>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            {(["all", "running", "completed", "failed"] as StatusFilter[]).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1 rounded-lg capitalize font-medium transition-all ${
                    statusFilter === f
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {f}
                </button>
              )
            )}
          </div>
        </>
      }
    >
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Active Streams"
          value={activeCount}
          delta={{ dir: "up", text: "+2 vs avg", tone: "good" }}
          source="Kafka / Switch Feed"
        />
        <KpiCard
          label="Failed Ingestions"
          value={failedCount}
          delta={
            failedCount > 0
              ? { dir: "up", text: "Requires Attention", tone: "bad" }
              : { dir: "down", text: "0 active errors", tone: "good" }
          }
          source="DLQ Monitor"
        />
        <KpiCard
          label="Total Volume (Today)"
          value="242,600"
          delta={{ dir: "up", text: "+14%", tone: "good" }}
          source="Ingestion Engine"
        />
        <KpiCard
          label="Average Pipeline Latency"
          value="42ms"
          delta={{ dir: "down", text: "-5ms optimal", tone: "good" }}
          source="Worker Pool"
        />
      </div>

      {/* TanStack Table Data Table */}
      <SectionCard title="Active Pipelines" noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {table.getRowModel().rows.map((row) => {
                const job = row.original;
                const isExpanded = expandedId === job.id;
                return (
                  <React.Fragment key={job.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : job.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Step-by-Step Execution Log Drawer with Framer Motion */}
                    {isExpanded && (
                      <tr className="bg-slate-900 text-slate-100">
                        <td
                          colSpan={columns.length}
                          className="p-0 border-b border-slate-800"
                        >
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="p-4 font-mono text-xs leading-relaxed space-y-2"
                          >
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[#168FA8] font-bold">
                              <span>Step-by-Step Execution Log — {job.name}</span>
                              <span>Retained for 90 Days (REQ-PIPE-009)</span>
                            </div>
                            <div className="space-y-1">
                              {job.logs.map((logLine, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2"
                                >
                                  <span className="text-slate-500 font-bold shrink-0">
                                    #{idx + 1}
                                  </span>
                                  <span
                                    className={
                                      logLine.includes("ERROR") ||
                                      logLine.includes("FATAL")
                                        ? "text-red-400 font-bold"
                                        : logLine.includes("SUCCESS")
                                        ? "text-emerald-400 font-bold"
                                        : "text-slate-300"
                                    }
                                  >
                                    {logLine}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Create Pipeline Config Modal with Framer Motion */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-bold text-base text-slate-900 dark:text-white">
                  New Pipeline
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Source Institution
                  </label>
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
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Pipeline Name
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. bk-liquidity-nightly-sync"
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Source System Type
                  </label>
                  <input
                    type="text"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    placeholder="e.g. Core Banking / Mobile Money"
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Schedule (Cron Expression)
                  </label>
                  <input
                    type="text"
                    value={newCron}
                    onChange={(e) => setNewCron(e.target.value)}
                    placeholder="0 */4 * * *"
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Canonical Data Mapping Target
                  </label>
                  <input
                    type="text"
                    value={newMapping}
                    onChange={(e) => setNewMapping(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <SecondaryButton onClick={() => setShowCreateModal(false)}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton onClick={handleCreatePipeline}>
                  Save & Deploy Config
                </PrimaryButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
