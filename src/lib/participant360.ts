// Participant 360 (SRS §5.6 REQ-P360-001..014, §8.1) and the participant risk
// assessment (REQ-P360-009..012, §11.5). Types mirror
// backend/app/services/participant360.py and backend/app/services/risk.py.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Deadline, DocumentRow, Incident, Requirement } from "./compliance";
import type { IntegrationRow, Participant } from "./types";

export const INSUFFICIENT_MESSAGE = "Insufficient data — score pending.";
export const NO_DATA_MESSAGE = "No data submitted yet";

export type RiskCategoryKey = "compliance" | "operational" | "technical";
export type RiskBand = "Low" | "Medium" | "High";
export const RISK_CATEGORIES: RiskCategoryKey[] = ["compliance", "operational", "technical"];

export interface RiskIndicatorScore {
  label: string;
  value: number | null;
  unit: string;
  /** 0–100, higher = riskier; null when not measurable or disabled. */
  score: number | null;
  measured: boolean;
  enabled: boolean;
  /** Configured weight within its category. */
  weight: number;
  /** Share of the composite this indicator actually carried in this run. */
  applied_weight: number;
  /** Composite points it added. */
  contribution: number;
  detail: string;
  inputs: Record<string, number>;
}

export interface RiskCategoryScore {
  label: string;
  score: number | null;
  weight: number;
  applied_weight: number;
  measured: boolean;
  indicators: Record<string, RiskIndicatorScore>;
}

export interface RiskScore {
  participant_id: number;
  participant_name: string;
  participant_code: string;
  participant_type: string;
  region: string;
  status: "scored" | "insufficient_data";
  message: string | null;
  composite: number | null;
  band: RiskBand | null;
  categories: Partial<Record<RiskCategoryKey, RiskCategoryScore>>;
  components: Record<"integration" | "compliance" | "incidents" | "overdue", number | null>;
  top_factor: string | null;
  top_factor_label: string | null;
  months_of_history: number;
  first_submission_at: string | null;
  eligible_from: string | null;
  computed_at: string;
  trigger: string;
  run_id: string;
}

export interface RiskHistoryPoint {
  computed_at: string;
  trigger: string;
  status: RiskScore["status"];
  composite: number | null;
  band: RiskBand | null;
  compliance: number | null;
  operational: number | null;
  technical: number | null;
  months_of_history: number;
}

export interface IndicatorSetting {
  enabled: boolean;
  weight: number;
  /** Indicator value scoring 0 risk. */
  good: number;
  /** Indicator value scoring 100 risk. */
  bad: number;
}

/** Settings → "risk" (REQ-P360-011). */
export interface RiskConfig {
  category_weights: Record<RiskCategoryKey, number>;
  indicators: Record<string, IndicatorSetting>;
  severity_points: Record<"Critical" | "High" | "Medium" | "Low", number>;
  bands: { medium: number; high: number };
  lookback_months: number;
}

export interface MethodologyIndicator {
  key: string;
  label: string;
  category: RiskCategoryKey;
  category_label: string;
  unit: string;
  definition: string;
  data_source: string;
  window: string;
  enabled: boolean;
  weight: number;
  /** Share of the composite (category weight × indicator weight). */
  effective_weight: number;
  good: number;
  bad: number;
  scale: string;
  srs_component: string | null;
}

export interface RiskMethodology {
  summary: string;
  srs_formula: string;
  reproduces_srs_formula: boolean;
  is_default: boolean;
  categories: { key: RiskCategoryKey; label: string; description: string; weight: number }[];
  indicators: MethodologyIndicator[];
  severity_points: RiskConfig["severity_points"];
  bands: { Low: string; Medium: string; High: string; medium: number; high: number };
  lookback_months: number;
  technical_window_days: number;
  minimum_history: string;
  recalculation: string;
  data_sources: string[];
  scope: string;
  advisory: string;
  config: RiskConfig;
  config_hash: string;
  warning: string;
  recomputed?: number;
}

export interface ParticipantRisk extends RiskScore {
  previous_composite: number | null;
  change: number | null;
  history: RiskHistoryPoint[];
  /** Present for users allowed to see the methodology (REQ-P360-009). */
  methodology?: RiskMethodology;
}

export interface TechnicalSource {
  integration_id: number;
  source_name: string;
  integration_mode: string;
  status: string;
  uptime_pct: number | null;
  observed_hours: number;
  failed_hours: number;
}

/** REQ-P360-007, last 30 days. */
export interface TechnicalPerformance {
  window_days: number;
  window_start: string;
  window_end: string;
  uptime_pct: number | null;
  observed_hours: number;
  failed_hours: number;
  sources: TechnicalSource[];
  pipeline_failure_rate_pct: number | null;
  jobs_finished: number;
  jobs_failed: number;
  submission_failure_rate_pct: number | null;
  submissions_received: number;
  submissions_failed_validation: number;
  avg_submission_latency_minutes: number | null;
  latency_samples: number;
  definitions: Record<string, string>;
}

export interface OutstandingAction {
  kind:
    | "compliance_submission"
    | "compliance_review"
    | "document"
    | "incident"
    | "remediation"
    | "governance"
    | "ai_alert";
  ref: string;
  title: string;
  detail: string;
  status: string;
  assigned_to: "RSwitch" | "Institution";
  owner: string;
  due_date: string | null;
  days_until_due: number | null;
  overdue: boolean;
  link: string;
}

export interface OutstandingActions {
  items: OutstandingAction[];
  total: number;
  counts: { RSwitch: number; Institution: number; overdue: number; by_kind: Record<string, number> };
}

export interface ParticipantComplianceStatus {
  participant: {
    participant_id: number;
    participant_name: string;
    participant_code: string;
    institution_type: string;
  };
  summary: {
    requirements: number;
    approved: number;
    pending: number;
    in_review: number;
    needs_correction: number;
    overdue: number;
  };
  requirements: Requirement[];
  upcoming_deadlines: Deadline[];
  overdue: Deadline[];
  documents: DocumentRow[];
}

export interface ParticipantProfile extends Participant {
  risk_score: number | null;
  assigned_contact: { name: string; email: string };
  overall: {
    status: Participant["status"];
    is_active: boolean;
    health: "Attention needed" | "No open issues";
    attention: string[];
  };
  integrations: (IntegrationRow & { uptime_pct_30d: number | null })[];
  submissions: {
    total: number;
    passed: number;
    failed_validation: number;
    records_received: number;
    error_count: number;
    first_submission_at: string | null;
    last_submission_at: string | null;
    months_of_history: number;
    no_data: boolean;
    message: string | null;
    expected_due: { date: string; basis: string } | null;
  };
  compliance: ParticipantComplianceStatus;
  incidents: { open: Incident[]; resolved: Incident[] };
  technical_performance: TechnicalPerformance;
  outstanding_actions: OutstandingActions;
  risk: ParticipantRisk | null;
  scope_notice: string;
}

export interface ParticipantNote {
  id: number;
  participant_id: number;
  author: string;
  note: string;
  created_at: string;
}

// ---- hooks -----------------------------------------------------------------------

export const useParticipantProfile = (id: number | undefined) =>
  useQuery({
    queryKey: ["participant360", id],
    queryFn: () => api.get<ParticipantProfile>(`/participants/${id}`),
    enabled: id !== undefined,
  });

/** Current score of every participant (for the picker's risk badges). */
export const useRiskScores = () =>
  useQuery({
    queryKey: ["risk-scores"],
    queryFn: () => api.get<RiskScore[]>("/participants/risk-scores"),
  });

export const useParticipantNotes = (id: number | undefined) =>
  useQuery({
    queryKey: ["participant-notes", id],
    queryFn: () => api.get<ParticipantNote[]>(`/participants/${id}/notes`),
    enabled: id !== undefined,
  });

export function useAddNote(id: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => api.post<ParticipantNote>(`/participants/${id}/notes`, { note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["participant-notes", id] }),
  });
}

export const useRiskMethodology = () =>
  useQuery({
    queryKey: ["risk-methodology"],
    queryFn: () => api.get<RiskMethodology>("/participants/risk-methodology"),
  });

/** After a methodology change or a recalculation, every score may differ. */
export function useRefreshRisk() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ["risk-methodology", "risk-scores", "participant360", "participants", "ai"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

// ---- presentation ------------------------------------------------------------------

export const BAND_STYLE: Record<RiskBand, string> = {
  Low: "bg-[#E8F7F1] text-[#0E7A57] border-[#16A979]/30 dark:bg-emerald-950/40 dark:text-emerald-300",
  Medium:
    "bg-[#FFF3DF] text-[#9A5300] border-[#D97706]/30 dark:bg-amber-950/40 dark:text-amber-300",
  High: "bg-[#FDECEF] text-[#B4233F] border-[#DC3154]/30 dark:bg-rose-950/40 dark:text-rose-300",
};

export const PENDING_STYLE =
  "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

export function fmtValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "—";
  const n = Number.isInteger(value) ? String(value) : value.toFixed(unit === "%" ? 1 : 1);
  if (unit === "%") return `${n}%`;
  if (unit === "index") return `${n} / 100`;
  return `${n} ${unit}`;
}

export function fmtMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  if (minutes < 120) return `${minutes.toFixed(1)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}
