// Pipeline Monitor (SRS §5.4): job, log, configuration and settings shapes
// and hooks. Everything here is aggregate counts and metadata (REQ-PIPE-010).

import { useQuery } from "@tanstack/react-query";
import type { Status } from "@/components/StatusBadge";
import { api } from "./api";

export type JobStatus = "Running" | "Completed" | "Failed" | "Queued" | "Paused"; // REQ-PIPE-003
export const JOB_STATUSES: JobStatus[] = ["Running", "Completed", "Failed", "Queued", "Paused"];

export const JOB_BADGE: Record<JobStatus, Status> = {
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Queued: "queued",
  Paused: "paused",
};

export interface PipelineJob {
  id: number;
  name: string;
  participant_id: number;
  participant_name: string;
  participant_code: string;
  integration_id: number | null;
  source_name: string | null;
  integration_mode: string | null;
  submission_id: number | null;
  config_id: number | null;
  trigger: string;
  triggered_by: string;
  status: JobStatus;
  progress: number;
  current_step: string;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  records_processed: number;
  error_count: number;
  warning_count: number;
  mapping_label: string;
  stop_requested: boolean;
  stopped_by: string;
  reprocess_of_id: number | null;
  summary: string;
}

export interface PipelineLogLine {
  id: number;
  at: string;
  step: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
}

export interface PipelineSummary {
  by_status: Record<JobStatus, number>;
  running: number;
  queue_depth: number;
  completed_today: number;
  failed_today: number;
  records_today: number;
  retention_days: number;
}

export interface PipelineConfig {
  id: number;
  name: string;
  integration_id: number;
  source_name: string | null;
  participant_id: number | null;
  participant_name: string | null;
  schedule_cron: string;
  mapping_id: number | null;
  mapping_code: string | null;
  active: boolean;
  is_default: boolean;
  next_run_at: string | null;
  last_enqueued_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineSettings {
  log_retention_days: number;
  overdue_grace_days: number;
}

export interface CronPreview {
  valid: boolean;
  message: string;
  next_runs: string[];
  timezone: string;
}

export interface JobFilters {
  status?: JobStatus | "";
  participantId?: number | "";
}

const isActive = (jobs: PipelineJob[] | undefined) =>
  !!jobs?.some((j) => j.status === "Running" || j.status === "Queued");

/** Server-side filters (REQ-PIPE-007); refreshes every 2 s while anything is in flight. */
export const usePipelineJobs = (filters: JobFilters) => {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.participantId) params.set("participant_id", String(filters.participantId));
  const qs = params.toString();
  return useQuery({
    queryKey: ["pipeline-jobs", filters.status ?? "", filters.participantId ?? ""],
    queryFn: () => api.get<PipelineJob[]>(`/pipelines/jobs${qs ? `?${qs}` : ""}`),
    refetchInterval: (q) => (isActive(q.state.data) ? 2_000 : 30_000),
  });
};

export const useJobLogs = (jobId: number | null, live: boolean) =>
  useQuery({
    queryKey: ["pipeline-logs", jobId],
    queryFn: () => api.get<PipelineLogLine[]>(`/pipelines/jobs/${jobId}/logs`),
    enabled: jobId !== null,
    refetchInterval: live ? 2_000 : false,
  });

export const usePipelineSummary = () =>
  useQuery({
    queryKey: ["pipeline-summary"],
    queryFn: () => api.get<PipelineSummary>("/pipelines/summary"),
    refetchInterval: 15_000,
  });

export const usePipelineConfigs = () =>
  useQuery({
    queryKey: ["pipeline-configs"],
    queryFn: () => api.get<PipelineConfig[]>("/pipelines/configs"),
  });

export const useCronPreview = (expr: string) =>
  useQuery({
    queryKey: ["cron-preview", expr],
    queryFn: () => api.get<CronPreview>(`/pipelines/cron-preview?expr=${encodeURIComponent(expr)}`),
    enabled: expr.trim().length > 0,
    staleTime: 60_000,
  });

export const usePipelineSettings = (enabled = true) =>
  useQuery({
    queryKey: ["pipeline-settings"],
    queryFn: () => api.get<PipelineSettings>("/pipelines/settings"),
    enabled,
  });

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
