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
import { motion } from "framer-motion";
import { api, errorMessage } from "@/lib/api";
import { useParticipants, useSubmissions } from "@/lib/queries";
import type { Submission } from "@/lib/types";
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
  Download,
} from "lucide-react";

export const Route = createFileRoute("/pipelines")({
  component: PipelineMonitor,
});

type JobStatus = "completed" | "failed";

type Job = {
  id: number;
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

type StatusFilter = "all" | JobStatus;

const columnHelper = createColumnHelper<Job>();

const DATE_FMT = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

// Each backend Submission is one ingestion run: file read → validated
// against the participant's template → accepted or rejected as a whole.
function toJob(sub: Submission, participantName: string): Job {
  const errors = (sub.errors ?? []) as { row: number; field: string; error: string }[];
  const logs = [
    `[INFO] ${sub.filename} uploaded by ${sub.uploaded_by || "participant"} for ${sub.period}`,
    `[INFO] Validating against ingestion template #${sub.template_id ?? "–"}`,
    ...errors.map((e) => `[ERROR] ${e.row ? `Row ${e.row}` : "Header"} · ${e.field}: ${e.error}`),
    sub.result === "Passed"
      ? `[SUCCESS] Accepted ${sub.row_count.toLocaleString()} rows${
          Object.keys(sub.numeric_totals ?? {}).length
            ? ` · totals ${Object.entries(sub.numeric_totals).map(([k, v]) => `${k}=${v.toLocaleString()}`).join(", ")}`
            : ""
        }`
      : `[FATAL] Rejected with ${sub.error_count} validation error(s). No partial ingestion.`,
  ];
  return {
    id: sub.id,
    name: sub.filename,
    institution: participantName,
    source: sub.period,
    status: sub.result === "Passed" ? "completed" : "failed",
    progress: 100,
    start: DATE_FMT.format(new Date(sub.uploaded_at)),
    duration: sub.uploaded_by || "—",
    records: sub.row_count.toLocaleString(),
    errors: sub.error_count,
    logs,
  };
}

function PipelineMonitor() {
  const submissions = useSubmissions();
  const participants = useParticipants();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const jobs = useMemo(
    () =>
      (submissions.data ?? []).map((sub) =>
        toJob(sub, participants.data?.find((p) => p.id === sub.participant_id)?.name ?? `Participant #${sub.participant_id}`),
      ),
    [submissions.data, participants.data],
  );

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

  async function handleDownload(job: Job) {
    setDownloadError(null);
    try {
      await api.download(`/submissions/${job.id}/download`, job.name);
    } catch (e) {
      setDownloadError(errorMessage(e));
    }
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
            File
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
        header: "Validation",
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
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 w-16">
                {info.row.original.errors ? `${info.row.original.errors} err` : "clean"}
              </span>
            </div>
          );
        },
      }),
      columnHelper.accessor("start", {
        header: "Uploaded",
        cell: (info) => (
          <span className="font-mono text-xs text-slate-500">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("duration", {
        header: "Uploaded By",
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
              <button
                onClick={() => handleDownload(job)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#168FA8]/10 text-[#168FA8] hover:bg-[#168FA8]/20 flex items-center gap-1 cursor-pointer"
                title="Download the exact file that was ingested"
              >
                <Download className="h-3 w-3" />
                File
              </button>
            </div>
          );
        },
      }),
    ],
    [expandedId]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthSubs = (submissions.data ?? []).filter((sub) => sub.uploaded_at.startsWith(thisMonth));
  const failedCount = monthSubs.filter((sub) => sub.result === "Failed").length;
  const passRate = monthSubs.length ? ((monthSubs.length - failedCount) / monthSubs.length) * 100 : null;
  const rowsThisMonth = monthSubs.reduce((sum, sub) => sum + sub.row_count, 0);

  return (
    <AppShell
      title="Pipelines"
      subtitle="ETL Execution & Status"
      breadcrumb="CONNECT › PIPELINES"
      scope="Ingestion Runs"
      toolbar={
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7B8798]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files, participants, periods..."
              className="h-9 w-64 pl-8 pr-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-[#168FA8]"
            />
          </div>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            {(["all", "completed", "failed"] as StatusFilter[]).map(
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
          label="Submissions (this month)"
          value={monthSubs.length}
          source="submissions"
        />
        <KpiCard
          label="Rejected (this month)"
          value={failedCount}
          delta={
            failedCount > 0
              ? { dir: "up", text: "Requires Attention", tone: "bad" }
              : { dir: "down", text: "0 rejected", tone: "good" }
          }
          source="validation"
        />
        <KpiCard
          label="Rows Ingested (this month)"
          value={rowsThisMonth.toLocaleString()}
          source="submissions"
        />
        <KpiCard
          label="Pass Rate (this month)"
          value={passRate === null ? "–" : `${passRate.toFixed(1)}%`}
          source="validation"
        />
      </div>

      {/* TanStack Table Data Table */}
      <SectionCard title="Ingestion Runs" noPad>
        {(submissions.error || downloadError) && (
          <div className="px-4 py-2 text-xs font-medium text-red-600">
            {submissions.error ? `Couldn't load submissions: ${errorMessage(submissions.error)}` : downloadError}
          </div>
        )}
        {submissions.isLoading && <div className="px-4 py-6 text-center text-xs text-slate-400">Loading…</div>}
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
                              <span>Validation Log — {job.name}</span>
                              <span>{job.institution}</span>
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

    </AppShell>
  );
}
