import { Fragment, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, RotateCcw, StopCircle, X } from "lucide-react";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { formatDateTime, timeAgo } from "@/lib/integrations";
import { useMappings } from "@/lib/mapping";
import {
  formatDuration,
  JOB_BADGE,
  JOB_STATUSES,
  useCronPreview,
  useJobLogs,
  usePipelineConfigs,
  usePipelineJobs,
  usePipelineSummary,
  type JobStatus,
  type PipelineConfig,
  type PipelineJob,
} from "@/lib/pipelines";
import { useIntegrations, useParticipants } from "@/lib/queries";
import { hasCap } from "@/lib/roles";

export const Route = createFileRoute("/pipelines")({
  component: PipelineMonitor,
});

const selectCls =
  "h-8 px-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700";
const inputCls =
  "w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border text-slate-900 dark:text-white focus:outline-none text-xs";
const border = (bad?: string) =>
  bad ? "border-red-400" : "border-slate-200 dark:border-slate-700";

function PipelineMonitor() {
  const { role } = useRole();
  const canManage = hasCap(role, "pipelines.manage");
  const participants = useParticipants();
  const [status, setStatus] = useState<JobStatus | "">("");
  const [participantId, setParticipantId] = useState<number | "">("");
  const jobs = usePipelineJobs({ status, participantId });
  const summary = usePipelineSummary();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const refresh = () => {
    for (const key of ["pipeline-jobs", "pipeline-summary", "pipeline-logs", "integrations"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
  const act = useMutation({
    mutationFn: ({ job, action }: { job: PipelineJob; action: "stop" | "reprocess" }) =>
      api.post<PipelineJob>(`/pipelines/jobs/${job.id}/${action}`),
    onSuccess: refresh,
    onError: (e) => setActionError(errorMessage(e)),
  });

  const s = summary.data;

  return (
    <AppShell
      title="Pipelines"
      subtitle="Ingestion jobs & execution logs"
      breadcrumb="CONNECT › PIPELINE MONITOR"
      scope="All Institutions"
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as JobStatus | "")}
            className={selectCls}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {JOB_STATUSES.map((st) => (
              <option key={st}>{st}</option>
            ))}
          </select>
          <select
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value ? Number(e.target.value) : "")}
            className={selectCls}
            aria-label="Filter by source institution"
          >
            <option value="">All institutions</option>
            {participants.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <KpiCard label="Running" value={s ? s.running : "–"} source="pipelines" />
        <KpiCard label="Queued (queue depth)" value={s ? s.queue_depth : "–"} source="pipelines" />
        <KpiCard label="Completed today" value={s ? s.completed_today : "–"} source="pipelines" />
        <KpiCard
          label="Failed today"
          value={s ? s.failed_today : "–"}
          delta={
            s && s.failed_today > 0
              ? { dir: "up", text: "Needs attention", tone: "bad" }
              : undefined
          }
          source="pipelines"
        />
        <KpiCard
          label="Records processed today"
          value={s ? s.records_today.toLocaleString() : "–"}
          source="pipelines"
        />
      </div>

      <SectionCard
        title="Pipeline jobs"
        noPad
        action={
          <span className="text-[11px] text-slate-500">
            Aggregate counts and metadata only · logs kept {s?.retention_days ?? 90} days
          </span>
        }
      >
        {(jobs.error || actionError) && (
          <div className="px-4 py-2 text-xs font-medium text-red-600 flex justify-between">
            <span>
              {jobs.error
                ? `Couldn't load pipeline jobs: ${errorMessage(jobs.error)}`
                : actionError}
            </span>
            {actionError && (
              <button onClick={() => setActionError(null)} aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {jobs.isLoading && (
          <div className="px-4 py-6 text-center text-xs text-slate-400">Loading…</div>
        )}
        {!jobs.isLoading && jobs.data?.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            {status || participantId
              ? "No jobs match these filters."
              : "No pipeline jobs have run yet."}
          </div>
        )}
        {!!jobs.data?.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-3 w-6" />
                  <th className="px-3 py-3">Job</th>
                  <th className="px-3 py-3">Source institution</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Progress</th>
                  <th className="px-3 py-3">Start time</th>
                  <th className="px-3 py-3">Duration</th>
                  <th className="px-3 py-3 text-right">Records</th>
                  <th className="px-3 py-3 text-right">Errors</th>
                  {canManage && <th className="px-3 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {jobs.data?.map((job) => {
                  const open = expanded === job.id;
                  return (
                    <Fragment key={job.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : job.id)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                      >
                        <td className="px-3 py-3 text-slate-400">
                          {open ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                            JOB-{job.id} · {job.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {job.trigger} · {job.triggered_by}
                            {job.reprocess_of_id ? ` · reprocesses JOB-${job.reprocess_of_id}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="font-semibold text-[#168FA8]">{job.participant_name}</div>
                          <div className="text-[11px] text-slate-400">{job.source_name ?? "—"}</div>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={JOB_BADGE[job.status]}>{job.status}</StatusBadge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2 w-36 text-xs">
                            <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  job.status === "Completed"
                                    ? "bg-emerald-500"
                                    : job.status === "Failed"
                                      ? "bg-red-500"
                                      : job.status === "Paused"
                                        ? "bg-slate-400"
                                        : "bg-[#168FA8]"
                                }`}
                                style={{ width: `${job.progress}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] w-9 text-right">
                              {job.progress}%
                            </span>
                          </div>
                          {job.status === "Running" && (
                            <div className="text-[10px] text-slate-400">{job.current_step}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {job.started_at
                            ? formatDateTime(job.started_at)
                            : `Queued ${timeAgo(job.queued_at)}`}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-500">
                          {formatDuration(job.duration_seconds)}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-right font-semibold">
                          {job.records_processed.toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-3 font-mono text-xs text-right ${job.error_count ? "text-red-600 font-bold" : "text-slate-500"}`}
                        >
                          {job.error_count}
                          {job.warning_count ? (
                            <span className="text-amber-600"> · {job.warning_count}w</span>
                          ) : null}
                        </td>
                        {canManage && (
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            {(job.status === "Running" || job.status === "Queued") && (
                              <button
                                disabled={job.stop_requested || act.isPending}
                                onClick={() => act.mutate({ job, action: "stop" })}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <StopCircle className="h-3 w-3" />{" "}
                                {job.stop_requested ? "Stopping…" : "Stop"}
                              </button>
                            )}
                            {(job.status === "Failed" || job.status === "Paused") && (
                              <button
                                disabled={act.isPending}
                                onClick={() => act.mutate({ job, action: "reprocess" })}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#168FA8]/10 text-[#168FA8] hover:bg-[#168FA8]/20 inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <RotateCcw className="h-3 w-3" /> Reprocess
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr className="bg-slate-900 text-slate-100">
                          <td colSpan={canManage ? 10 : 9} className="p-0">
                            <JobLog job={job} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="mt-6">
        <PipelineConfigs canManage={canManage} />
      </div>
    </AppShell>
  );
}

// REQ-PIPE-004: the step-by-step execution log.
function JobLog({ job }: { job: PipelineJob }) {
  const live = job.status === "Running" || job.status === "Queued";
  const logs = useJobLogs(job.id, live);
  return (
    <div className="p-4 font-mono text-xs leading-relaxed space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800 text-[#5CC8DD] font-bold">
        <span>Execution log — JOB-{job.id}</span>
        <span className="text-slate-400 font-normal">
          {job.submission_id ? `SUB-${job.submission_id} · ` : ""}
          {job.mapping_label ? `mapping ${job.mapping_label} · ` : ""}
          {job.summary}
        </span>
      </div>
      {logs.isLoading && <div className="text-slate-400">Loading log…</div>}
      {logs.error && <div className="text-red-400">{errorMessage(logs.error)}</div>}
      {logs.data?.length === 0 && <div className="text-slate-400">No log lines.</div>}
      <div className="space-y-0.5 max-h-80 overflow-y-auto">
        {logs.data?.map((line) => (
          <div key={line.id} className="flex items-start gap-3">
            <span className="text-slate-500 shrink-0">{formatDateTime(line.at)}</span>
            <span className="text-slate-400 shrink-0 w-20">{line.step}</span>
            <span
              className={
                line.level === "ERROR"
                  ? "text-red-400 font-bold"
                  : line.level === "WARN"
                    ? "text-amber-300"
                    : "text-slate-200"
              }
            >
              {line.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// REQ-PIPE-008: scheduled pipelines (source, cron schedule, target mapping).
function PipelineConfigs({ canManage }: { canManage: boolean }) {
  const configs = usePipelineConfigs();
  const [editing, setEditing] = useState<PipelineConfig | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (c: PipelineConfig) => api.put(`/pipelines/configs/${c.id}`, { active: !c.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-configs"] }),
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <SectionCard
      title="Pipeline configurations"
      noPad
      action={
        canManage ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
            New pipeline
          </PrimaryButton>
        ) : undefined
      }
    >
      {error && <div className="px-4 py-2 text-xs text-red-600">{error}</div>}
      {configs.isLoading && (
        <div className="px-4 py-6 text-center text-xs text-slate-400">Loading…</div>
      )}
      {configs.data?.length === 0 && (
        <div className="px-4 py-6 text-center text-xs text-slate-400">
          No scheduled pipelines. Automated API data sources with a schedule get one automatically.
        </div>
      )}
      {!!configs.data?.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100/70 dark:bg-slate-800/70 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Pipeline</th>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">Schedule</th>
                <th className="px-4 py-2.5">Target mapping</th>
                <th className="px-4 py-2.5">Next run</th>
                <th className="px-4 py-2.5">Last queued</th>
                <th className="px-4 py-2.5">State</th>
                {canManage && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {configs.data?.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 font-semibold">
                    {c.name}
                    {c.is_default && (
                      <span className="ml-1 text-[10px] text-slate-400">(from data source)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.participant_name} · {c.source_name}
                  </td>
                  <td className="px-4 py-2.5 font-mono">{c.schedule_cron}</td>
                  <td className="px-4 py-2.5 font-mono">{c.mapping_code ?? "Data source's"}</td>
                  <td className="px-4 py-2.5">
                    {c.next_run_at ? formatDateTime(c.next_run_at) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.last_enqueued_at ? timeAgo(c.last_enqueued_at) : "Never"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={c.active ? "active" : "paused"}>
                      {c.active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <button
                        onClick={() => setEditing(c)}
                        className="text-[#168FA8] font-semibold mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggle.mutate(c)}
                        className="text-slate-500 font-semibold"
                      >
                        {c.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ConfigModal
          config={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </SectionCard>
  );
}

function ConfigModal({ config, onClose }: { config?: PipelineConfig; onClose: () => void }) {
  const sources = useIntegrations();
  const mappings = useMappings();
  const automated = (sources.data ?? []).filter((s) => s.integration_mode === "Automated API");
  const [form, setForm] = useState({
    name: config?.name ?? "",
    integration_id: config?.integration_id ?? 0,
    schedule_cron: config?.schedule_cron ?? "0 2 * * *",
    mapping_id: config?.mapping_id ?? null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const cron = useCronPreview(form.schedule_cron);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      config
        ? api.put(`/pipelines/configs/${config.id}`, {
            name: form.name,
            schedule_cron: form.schedule_cron,
            mapping_id: form.mapping_id,
          })
        : api.post("/pipelines/configs", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-configs"] });
      onClose();
    },
    onError: (e) => {
      const inline = fieldErrors(e);
      setErrors(inline);
      setFormError(Object.keys(inline).length ? null : errorMessage(e));
    },
  });
  const cronProblem =
    errors.schedule_cron || (cron.data && !cron.data.valid ? cron.data.message : undefined);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-bold text-base text-slate-900 dark:text-white">
            {config ? "Edit pipeline" : "New pipeline configuration"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold mb-1">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={`${inputCls} ${border(errors.name)}`}
            />
            {errors.name && <p className="mt-1 text-[11px] text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label className="block font-semibold mb-1">Source</label>
            <select
              value={form.integration_id || ""}
              disabled={!!config}
              onChange={(e) => setForm({ ...form, integration_id: Number(e.target.value) })}
              className={`${inputCls} ${border(errors.integration_id)}`}
            >
              <option value="">Select an Automated API data source…</option>
              {automated.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.participant_name} · {s.source_name}
                </option>
              ))}
            </select>
            {errors.integration_id && (
              <p className="mt-1 text-[11px] text-red-600">{errors.integration_id}</p>
            )}
            {!sources.isLoading && automated.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-700">
                No Automated API data sources yet. Manual uploads are queued as they arrive.
              </p>
            )}
          </div>
          <div>
            <label className="block font-semibold mb-1">Schedule (cron)</label>
            <input
              value={form.schedule_cron}
              onChange={(e) => setForm({ ...form, schedule_cron: e.target.value })}
              className={`${inputCls} font-mono ${border(cronProblem)}`}
            />
            {cronProblem ? (
              <p className="mt-1 text-[11px] text-red-600">{cronProblem}</p>
            ) : (
              cron.data?.valid && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Next runs ({cron.data.timezone}):{" "}
                  {cron.data.next_runs.map(formatDateTime).join(" · ")}
                </p>
              )
            )}
          </div>
          <div>
            <label className="block font-semibold mb-1">Target mapping</label>
            <select
              value={form.mapping_id ?? ""}
              onChange={(e) =>
                setForm({ ...form, mapping_id: e.target.value ? Number(e.target.value) : null })
              }
              className={`${inputCls} ${border(errors.mapping_id)}`}
            >
              <option value="">The data source's mapping</option>
              {(mappings.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} {m.name} ({m.version ?? "not published"})
                </option>
              ))}
            </select>
          </div>
          {formError && <p className="text-red-600 font-medium">{formError}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.name.trim() || !form.integration_id}
          >
            {save.isPending ? "Saving…" : "Save pipeline"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
