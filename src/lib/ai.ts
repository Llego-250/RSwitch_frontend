// AI Decision Support (SRS §5.9) — types and hooks for /alerts. Everything
// shown on the AI page comes from these endpoints; nothing is computed or
// invented client-side beyond formatting.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FieldError } from "./api";

export type AlertStatus =
  | "Generated"
  | "Acknowledged"
  | "Under Investigation"
  | "Resolved"
  | "Escalated"
  | "Closed";

export const ALERT_STATUSES: AlertStatus[] = [
  "Generated",
  "Acknowledged",
  "Under Investigation",
  "Resolved",
  "Escalated",
  "Closed",
];

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export interface AlertNote {
  date: string;
  user: string;
  user_id?: number | null;
  role?: string;
  text: string;
  from?: AlertStatus;
  to?: AlertStatus;
  assignee?: string;
  resolution_summary?: string;
}

export interface AiAlert {
  id: number;
  ref: string;
  participant_id: number;
  participant_name: string;
  participant_type: string;
  participant_region: string;
  participant_link: string;
  indicator: string;
  indicator_code: string;
  baseline_value: string;
  observed_value: string;
  deviation: string;
  deviation_pct: number | null;
  recommended_area: string;
  severity: Severity;
  baseline_method: string;
  baseline_method_key: string;
  baseline_method_label: string;
  methodology: string;
  data_sources: string[];
  detector: string;
  source_submission_ids: number[];
  status: AlertStatus;
  assignee_id: number | null;
  assignee_name: string;
  recurrence_of: number | null;
  created_at: string;
  status_changed_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  days_in_state: number;
  notes: AlertNote[];
  resolution_summary: string;
  allowed_next: AlertStatus[];
  read_only: boolean;
}

export interface AlertSource {
  id: number;
  participant_id: number;
  period: string;
  filename: string;
  uploaded_at: string;
  uploaded_by: string;
  result: "Passed" | "Failed";
  error_count: number;
  row_count: number;
  error_fields: Record<string, number>;
}

export interface AiAlertDetail extends AiAlert {
  participant: { id: number; name: string; code: string; type: string; region: string } | null;
  sources: AlertSource[];
  recurrence_of_ref: string | null;
  advisory_notice: string;
}

export interface DetectorInfo {
  path: string;
  loaded: boolean;
  error: string;
  name: string;
  method: string;
  method_label: string;
  description: string;
}

export interface BaselineMethod {
  key: string;
  label: string;
  release: string;
  description: string;
}

export interface ParticipantAiStatus {
  participant_id: number;
  participant_name: string;
  participant_type: string;
  history_months: number;
  first_submission_at: string | null;
  prior_months_with_data: number;
  insufficient_history: boolean;
  insufficient_history_reason: string;
  method: string;
  method_label: string;
  fallback_reason: string;
}

export interface AnomalySettings {
  volume_deviation_pct: number;
  error_rate_pct: number;
  failure_rate_change_pp: number;
  auto_escalate_days: number;
  min_history_months: number;
  baseline_method: string;
  rolling_window_months: number;
  peer_min_peers: number;
  cadence_multiplier: number;
  severity_bands: { medium: number; high: number; critical: number };
  trend_months: number;
  detectors: string[];
}

export interface EngineStatus {
  advisory_notice: string;
  active_method: string;
  active_method_label: string;
  configured_method: string;
  method_warning: string;
  methods: BaselineMethod[];
  rolling_min_months: number;
  config: AnomalySettings;
  detectors: DetectorInfo[];
  participants: ParticipantAiStatus[];
  insufficient_history: ParticipantAiStatus[];
  status_counts: Record<AlertStatus, number>;
  lifecycle: {
    statuses: AlertStatus[];
    transitions: Record<AlertStatus, AlertStatus[]>;
    system_transitions: Partial<Record<AlertStatus, AlertStatus[]>>;
  };
  schedule: string;
}

export interface PriorityRow {
  rank: number;
  participant_id: number;
  participant_name: string;
  participant_type: string;
  region: string;
  composite_score: number;
  signal_strength: "High" | "Medium" | "Low";
  /** null until the participant has 3 months of submission history (REQ-P360-012). */
  risk_score: number | null;
  risk_status: "scored" | "insufficient_data";
  risk_message: string | null;
  risk_band: "Low" | "Medium" | "High" | null;
  risk_components: Record<"integration" | "compliance" | "incidents" | "overdue", number | null>;
  alert_points: number;
  open_alerts: number;
  highest_severity: Severity | null;
  open_alert_ids: number[];
  signals: string[];
  insufficient_history: boolean;
  insufficient_history_reason: string;
  history_months: number;
}

export interface PriorityList {
  methodology: string;
  data_sources: string[];
  rows: PriorityRow[];
}

export interface OperationalMonth {
  month: string;
  label: string;
  partial: boolean;
  submissions: number;
  failed_submissions: number;
  validation_error_rate: number | null;
  validation_errors: number;
  alerts_raised: number;
  incidents_raised: number;
}

export interface ComplianceMonth {
  month: string;
  label: string;
  partial: boolean;
  reporting_coverage_pct: number | null;
  requirements_due: number;
  on_time_rate: number | null;
  overdue_items: number | null;
  document_expiries: number;
}

export interface TrendMetric {
  key: string;
  group: "operational" | "compliance";
  label: string;
  source: string;
}

export interface TrendSummary {
  months: string[];
  window_label: string;
  operational: OperationalMonth[];
  compliance: ComplianceMonth[];
  snapshot: {
    open_incidents: number;
    open_alerts: number;
    open_alerts_by_severity: Record<Severity, number>;
    overdue_requirements: number | null;
    documents_expired: number;
  };
  summary: string[];
  register_note: string;
  metrics: TrendMetric[];
  methodology: string;
}

export interface Assignee {
  id: number;
  name: string;
  email: string;
  role: string;
  is_senior: boolean;
}

export interface AlertFilters {
  status?: string;
  severity?: string;
  method?: string;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  });
  const out = s.toString();
  return out ? `?${out}` : "";
};

export const useAiAlerts = (filters: AlertFilters = {}) =>
  useQuery({
    queryKey: ["ai", "alerts", filters],
    queryFn: () => api.get<AiAlert[]>(`/alerts${qs({ ...filters })}`),
  });

export const useAiAlert = (id: number | null) =>
  useQuery({
    queryKey: ["ai", "alert", id],
    queryFn: () => api.get<AiAlertDetail>(`/alerts/${id}`),
    enabled: id !== null,
  });

export const useAiEngine = () =>
  useQuery({ queryKey: ["ai", "engine"], queryFn: () => api.get<EngineStatus>("/alerts/engine") });

export const useAiPriority = () =>
  useQuery({
    queryKey: ["ai", "priority"],
    queryFn: () => api.get<PriorityList>("/alerts/priority"),
  });

export const useAiTrends = (months?: number) =>
  useQuery({
    queryKey: ["ai", "trends", months ?? "default"],
    queryFn: () => api.get<TrendSummary>(`/alerts/trends${qs({ months })}`),
  });

export const useAssignees = (enabled: boolean) =>
  useQuery({
    queryKey: ["ai", "assignees"],
    queryFn: () => api.get<Assignee[]>("/alerts/assignees"),
    enabled,
  });

export interface TransitionInput {
  id: number;
  status: AlertStatus;
  note: string;
  resolution_summary?: string;
  assignee_id?: number | null;
}

/** Refreshes everything AI-related (and notifications) after a change. */
function useInvalidateAi() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["ai"] });
    qc.invalidateQueries({ queryKey: ["alerts"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}

export const useTransitionAlert = () => {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ id, ...body }: TransitionInput) =>
      api.post<AiAlert>(`/alerts/${id}/transition`, body),
    onSuccess: invalidate,
  });
};

export const useRunScan = () => {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: () => api.post<{ created: number; escalated: number }>("/alerts/detect"),
    onSuccess: invalidate,
  });
};

export const useAnomalySettings = () =>
  useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<{ anomaly: AnomalySettings }>("/settings"),
    select: (s) => s.anomaly,
  });

/** Validates server-side first (§20.2 field errors), then saves. */
export const useSaveAnomalySettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: Partial<AnomalySettings>) => {
      const { errors } = await api.post<{ errors: FieldError[] }>(
        "/alerts/settings/validate",
        value,
      );
      if (errors.length) throw new SettingsValidationError(errors);
      return api.put<AnomalySettings>("/settings/anomaly", value);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["ai"] });
    },
  });
};

export class SettingsValidationError extends Error {
  constructor(public errors: FieldError[]) {
    super("Some settings are invalid — see the highlighted fields.");
  }
}

export const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL:
    "bg-[#FDECEF] text-[#B4233F] border-[#DC3154]/40 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
  HIGH: "bg-[#FFF3DF] text-[#9A5300] border-[#D97706]/40 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  MEDIUM:
    "bg-[#E7F5F8] text-[#0F6F83] border-[#168FA8]/30 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800",
  LOW: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export const STATUS_STYLE: Record<AlertStatus, string> = {
  Generated:
    "bg-[#FDECEF] text-[#B4233F] border-[#DC3154]/30 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  Acknowledged:
    "bg-[#E7F5F8] text-[#0F6F83] border-[#168FA8]/30 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  "Under Investigation":
    "bg-[#FFF3DF] text-[#9A5300] border-[#D97706]/30 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  Resolved:
    "bg-[#E8F7F1] text-[#0E7A57] border-[#16A979]/30 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  Escalated: "bg-rose-600 text-white border-rose-700",
  Closed:
    "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).toLocaleDateString(
        undefined,
        { dateStyle: "medium" },
      )
    : "—";
