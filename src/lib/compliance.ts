// Compliance Monitoring (SRS §5.8, §6.1, §6.2, §6.4, §6.5, §8.4, §9.2, §9.4,
// §19.3): API types and TanStack Query hooks. Every value the Compliance page
// shows comes from these endpoints; statuses and their meanings come from the
// backend (app.services.compliance), nothing is computed from fixtures.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, fieldErrors as apiFieldErrors } from "./api";
import type { DocumentStatus, ValidationIssue } from "./types";

export { dayKey, fmtDate, fmtDateTime, fmtDay, parseDay, parseUtc } from "./governance";

// §9.2, in lifecycle order.
export const COMPLIANCE_STATUSES = [
  "Pending",
  "Submitted",
  "Under Review",
  "Approved",
  "Validation Failed",
  "Rejected",
  "Pending Correction",
  "Overdue",
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

// §9.4 / REQ-COMP-007, in workflow order.
export const INCIDENT_STATUSES = [
  "Open",
  "Under Investigation",
  "Remediation In Progress",
  "Resolved",
  "Closed",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const KINDS = ["Data Return", "Document"] as const;
export type RequirementKind = (typeof KINDS)[number];
export const FREQUENCIES = ["Monthly", "Quarterly", "Annual", "Ad hoc"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface ParticipantRef {
  participant_id: number;
  participant_name: string;
  participant_code: string;
  institution_type: string;
}

/** A submission or document sent for a cycle. */
export interface CycleItem {
  kind: "submission" | "document";
  id: number;
  ref: string;
  filename: string;
  uploaded_at: string;
  uploaded_by: string;
  status: string;
  rejection_reason: string;
  review_note: string;
  reviewed_by: string;
  reviewed_at: string | null;
  period: string;
  result: "Passed" | "Failed";
  error_count: number;
  warning_count: number;
  records_received: number | null;
  replaces_id: number | null;
  replaced_by_id?: number | null;
  automated: boolean;
  expiry_date?: string | null;
  doc_type_id?: number;
  errors?: ValidationIssue[];
  warnings?: ValidationIssue[];
}

export interface Cycle {
  id: number;
  requirement_id: number;
  period: string;
  due_date: string;
  stage: ComplianceStatus;
  status: ComplianceStatus;
  submitted_at: string | null;
  reviewed_by: string;
  reviewed_at: string | null;
  approved_at: string | null;
  approved_submission_id: number | null;
  approved_document_id: number | null;
  on_time: boolean | null;
  rejection_reason: string;
  correction_requested_at: string | null;
  correction_requested_by: string;
  correction_note: string;
  overdue_at: string | null;
  opened_at: string;
  closed_at: string | null;
  days_until_due: number;
  items?: CycleItem[];
}

/** A Compliance Register entry (REQ-COMP-002) with its current cycle. */
export interface Requirement extends ParticipantRef {
  id: number;
  requirement_name: string;
  regulatory_reference: string;
  kind: RequirementKind;
  template_id: number | null;
  template_name: string | null;
  doc_type_id: number | null;
  doc_type_name: string | null;
  frequency: Frequency;
  description: string;
  due_date: string;
  submission_status: ComplianceStatus;
  stage: ComplianceStatus;
  submitted_at: string | null;
  reviewed_by: string;
  approved_at: string | null;
  rejection_reason: string;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string | null;
  days_until_due: number;
  cycle: Cycle | null;
  latest_item: CycleItem | null;
  attempts: number;
}

export interface RequirementDetail extends Requirement {
  cycles: Cycle[];
}

export interface Deadline extends ParticipantRef {
  key: string;
  requirement_id: number;
  cycle_id: number | null;
  requirement_name: string;
  regulatory_reference: string;
  kind: RequirementKind;
  frequency: Frequency;
  period: string;
  due_date: string;
  days_until_due: number;
  status: ComplianceStatus;
  stage: ComplianceStatus;
  /** A later due date the frequency already fixes; its cycle opens once the one before is approved. */
  projected: boolean;
}

export interface CalendarData {
  start: string;
  end: string;
  deadlines: Deadline[];
  overdue: Deadline[];
}

export interface QueueEntry extends ParticipantRef {
  item: CycleItem | null;
  chain: CycleItem[];
  requirement: {
    id: number;
    requirement_name: string;
    regulatory_reference: string;
    kind: RequirementKind;
    frequency: Frequency;
  } | null;
  cycle: Cycle | null;
  cycle_closed?: boolean;
  received_in_time?: boolean | null;
}

export interface ReviewQueue {
  awaiting_review: QueueEntry[];
  needs_follow_up: QueueEntry[];
  awaiting_correction: QueueEntry[];
}

export interface StaffRef {
  id: number;
  name: string;
  email: string;
  role: string;
  is_senior?: boolean;
}

export interface RemediationActionRow {
  id: number;
  incident_id: number;
  description: string;
  owner_id: number;
  owner: StaffRef | null;
  due_date: string;
  status: "Open" | "Completed" | "Overdue";
  days_until_due: number;
  completed_at: string | null;
  completed_by: string;
  completion_note: string;
  created_by: string;
  created_at: string;
  can_complete: boolean;
}

export interface Incident {
  id: number;
  ref: string;
  participant_id: number;
  participant_name: string;
  participant_code: string;
  incident_date: string | null;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  raised_at: string;
  raised_by: StaffRef | null;
  owner_id: number | null;
  owner: StaffRef | null;
  assignee: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_summary: string;
  notes: string;
  created_at: string;
  updated_at: string | null;
  is_open: boolean;
  actions: RemediationActionRow[];
  action_counts: { total: number; open: number; completed: number; overdue: number };
  next_action_due: string | null;
  permissions: {
    can_edit: boolean;
    can_acknowledge: boolean;
    can_add_actions: boolean;
    can_resolve: boolean;
    can_close: boolean;
  };
}

export interface ComplianceDoc {
  id: number;
  ref: string;
  participant_id: number;
  doc_type_id: number;
  filename: string;
  uploaded_at: string;
  uploaded_by: string;
  expiry_date: string | null;
  notes: string;
  requirement_id: number | null;
  review_status: string;
  rejection_reason: string;
  reviewed_by: string;
  reviewed_at: string | null;
  expiry_status: DocumentStatus;
}

export interface DocumentRow extends ParticipantRef {
  doc_type_id: number;
  doc_type: string;
  renewal_months: number | null;
  expiry_status: DocumentStatus;
  expiry_date: string | null;
  document: ComplianceDoc | null;
  latest_upload: ComplianceDoc | null;
  requirement: {
    id: number;
    requirement_name: string;
    frequency: Frequency;
    due_date: string;
    status: ComplianceStatus;
  } | null;
}

export interface FailureRate {
  rate_pct: number | null;
  total: number;
  failed_or_rejected: number;
  validation_failed: number;
  rejected: number;
  window_start: string;
  months: number;
}

export interface Adherence {
  rate_pct: number | null;
  on_time: number;
  total: number;
  window_start: string;
  months: number;
}

export interface RateRow extends ParticipantRef {
  status: string;
  failure: FailureRate;
  adherence: Adherence;
}

export interface HistoryEvent extends ParticipantRef {
  at: string;
  type: string;
  title: string;
  detail: string;
  status: string;
  requirement_id: number | null;
  requirement_name: string | null;
  cycle_id: number | null;
  period: string | null;
  submission_id: number | null;
  document_id: number | null;
  incident_id: number | null;
  replaces_id: number | null;
}

export interface DashboardSummary {
  as_of: string;
  overdue_submissions: number;
  upcoming_deadlines: Deadline[];
  open_incidents: Record<Severity | "total", number>;
  compliance_rate_30d: {
    rate_pct: number | null;
    on_time: number;
    total: number;
    window_start: string;
    days: number;
  };
  overdue_action_items: { governance: number; incident_remediation: number; total: number };
  recent_activity: HistoryEvent[];
}

export interface ComplianceMeta {
  statuses: ComplianceStatus[];
  status_help: Record<string, string>;
  kinds: RequirementKind[];
  frequencies: Frequency[];
  severities: Severity[];
  incident_statuses: IncidentStatus[];
  incident_status_help: Record<string, string>;
  reminder_days_before: number[];
  min_rejection_reason: number;
  calendar_days: number;
  today: string;
}

export interface ComplianceOptions {
  templates: { id: number; participant_id: number; name: string; version: number; label: string }[];
  doc_types: { id: number; name: string; renewal_months: number | null }[];
}

// ---- queries ----------------------------------------------------------------

const KEY = ["compliance"] as const;

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : "";
};

export const useComplianceMeta = () =>
  useQuery({
    queryKey: [...KEY, "meta"],
    queryFn: () => api.get<ComplianceMeta>("/compliance/meta"),
    staleTime: 5 * 60_000,
  });

export const useComplianceOptions = (participantId?: number) =>
  useQuery({
    queryKey: [...KEY, "options", participantId ?? "all"],
    queryFn: () =>
      api.get<ComplianceOptions>(`/compliance/options${qs({ participant_id: participantId })}`),
  });

export const useStaff = () =>
  useQuery({
    queryKey: [...KEY, "staff"],
    queryFn: () => api.get<StaffRef[]>("/compliance/staff"),
    staleTime: 5 * 60_000,
  });

export interface RequirementFilters {
  participant_id?: number;
  status?: string;
  kind?: string;
  frequency?: string;
  include_inactive?: boolean;
}

export const useRequirements = (filters: RequirementFilters = {}) =>
  useQuery({
    queryKey: [...KEY, "requirements", filters],
    queryFn: () =>
      api.get<Requirement[]>(
        `/compliance/requirements${qs({ ...filters, include_inactive: filters.include_inactive || "" })}`,
      ),
  });

export const useRequirement = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "requirements", "detail", id],
    queryFn: () => api.get<RequirementDetail>(`/compliance/requirements/${id}`),
    enabled: id !== null,
  });

export const useCalendar = (days = 90) =>
  useQuery({
    queryKey: [...KEY, "calendar", days],
    queryFn: () => api.get<CalendarData>(`/compliance/calendar${qs({ days })}`),
  });

export const useReviewQueue = () =>
  useQuery({
    queryKey: [...KEY, "review-queue"],
    queryFn: () => api.get<ReviewQueue>("/compliance/review-queue"),
  });

export interface IncidentFilters {
  participant_id?: number;
  status?: string;
  severity?: string;
  mine?: boolean;
}

export const useIncidents = (filters: IncidentFilters = {}) =>
  useQuery({
    queryKey: [...KEY, "incidents", filters],
    queryFn: () =>
      api.get<Incident[]>(`/compliance/incidents${qs({ ...filters, mine: filters.mine || "" })}`),
  });

export const useIncident = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "incidents", "detail", id],
    queryFn: () => api.get<Incident>(`/compliance/incidents/${id}`),
    enabled: id !== null,
  });

export const useComplianceDocuments = () =>
  useQuery({
    queryKey: [...KEY, "documents"],
    queryFn: () => api.get<DocumentRow[]>("/compliance/documents"),
  });

export const useFailureRates = (months = 12) =>
  useQuery({
    queryKey: [...KEY, "failure-rates", months],
    queryFn: () => api.get<RateRow[]>(`/compliance/failure-rates${qs({ months })}`),
  });

export const useParticipantHistory = (participantId: number | null) =>
  useQuery({
    queryKey: [...KEY, "history", participantId],
    queryFn: () => api.get<HistoryEvent[]>(`/compliance/participants/${participantId}/history`),
    enabled: participantId !== null,
  });

export const useComplianceDashboard = (days = 30) =>
  useQuery({
    queryKey: [...KEY, "dashboard", days],
    queryFn: () => api.get<DashboardSummary>(`/compliance/dashboard${qs({ days })}`),
  });

/** Any compliance write can change counts and lists across the page (and
 *  the submissions, documents and incident lists other pages read). */
export function useRefreshCompliance() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      KEY,
      ["issues"],
      ["submissions"],
      ["documents"],
      ["overview"],
      ["submission-requirements"],
      ["notifications"],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

// ---- errors -------------------------------------------------------------------

/** §20.2: split API validation errors into the inputs a form shows; anything
 *  else (or a non-field error) becomes the form-level message. */
export function formErrors(
  e: unknown,
  known: string[],
): { fields: Record<string, string>; message: string | null } {
  const all = apiFieldErrors(e);
  const fields: Record<string, string> = {};
  for (const name of known) if (all[name]) fields[name] = all[name];
  const covered = Object.keys(all).every(
    (k) => known.includes(k) || known.includes(k.split(".").pop() ?? k),
  );
  return {
    fields,
    message: Object.keys(fields).length && covered ? null : errorMessage(e),
  };
}

// ---- presentation -------------------------------------------------------------

export const STATUS_STYLE: Record<string, string> = {
  Pending:
    "bg-slate-100 text-[#526174] border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  Submitted:
    "bg-[#EEF2FF] text-[#4F46E5] border-[#4F46E5]/30 dark:bg-indigo-950/40 dark:text-indigo-300",
  "Under Review":
    "bg-[#E7F5F8] text-[#0F6F83] border-[#168FA8]/30 dark:bg-cyan-950/40 dark:text-cyan-300",
  Approved:
    "bg-[#E8F7F1] text-[#12825E] border-[#16A979]/30 dark:bg-emerald-950/40 dark:text-emerald-300",
  "Validation Failed":
    "bg-[#FFF1E7] text-[#C2410C] border-[#EA580C]/30 dark:bg-orange-950/40 dark:text-orange-300",
  Rejected:
    "bg-[#FFF1E7] text-[#C2410C] border-[#EA580C]/30 dark:bg-orange-950/40 dark:text-orange-300",
  "Pending Correction":
    "bg-[#FFF3DF] text-[#B45309] border-[#D97706]/30 dark:bg-amber-950/40 dark:text-amber-300",
  // REQ-COMP-005: overdue in red.
  Overdue: "bg-[#FDECEF] text-[#DC3154] border-[#DC3154]/40 dark:bg-red-950/50 dark:text-red-300",
  // Incident statuses (§9.4)
  Open: "bg-[#FDECEF] text-[#DC3154] border-[#DC3154]/30 dark:bg-red-950/40 dark:text-red-300",
  "Under Investigation":
    "bg-[#FFF3DF] text-[#B45309] border-[#D97706]/30 dark:bg-amber-950/40 dark:text-amber-300",
  "Remediation In Progress":
    "bg-[#E7F5F8] text-[#0F6F83] border-[#168FA8]/30 dark:bg-cyan-950/40 dark:text-cyan-300",
  Resolved:
    "bg-[#E8F7F1] text-[#12825E] border-[#16A979]/30 dark:bg-emerald-950/40 dark:text-emerald-300",
  Closed:
    "bg-slate-100 text-[#526174] border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  Completed:
    "bg-[#E8F7F1] text-[#12825E] border-[#16A979]/30 dark:bg-emerald-950/40 dark:text-emerald-300",
  // Document expiry
  "On File":
    "bg-[#E8F7F1] text-[#12825E] border-[#16A979]/30 dark:bg-emerald-950/40 dark:text-emerald-300",
  "Expiring Soon":
    "bg-[#FFF3DF] text-[#B45309] border-[#D97706]/30 dark:bg-amber-950/40 dark:text-amber-300",
  Expired: "bg-[#FDECEF] text-[#DC3154] border-[#DC3154]/40 dark:bg-red-950/50 dark:text-red-300",
  Missing: "bg-[#FDECEF] text-[#DC3154] border-[#DC3154]/40 dark:bg-red-950/50 dark:text-red-300",
};

export const SEVERITY_STYLE: Record<Severity, string> = {
  Critical: "bg-[#DC3154] text-white border-[#DC3154]",
  High: "bg-[#FDECEF] text-[#DC3154] border-[#DC3154]/30 dark:bg-red-950/40 dark:text-red-300",
  Medium:
    "bg-[#FFF3DF] text-[#B45309] border-[#D97706]/30 dark:bg-amber-950/40 dark:text-amber-300",
  Low: "bg-slate-100 text-[#526174] border-slate-300 dark:bg-slate-800 dark:text-slate-300",
};

/** "in 3 days", "due today", "5 days overdue" */
export function dueText(days: number, overdue = days < 0): string {
  if (days === 0) return "due today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return overdue
    ? `${-days} day${days === -1 ? "" : "s"} overdue`
    : `${-days} day${days === -1 ? "" : "s"} ago`;
}

export const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;

/** What an upload dialog is opened for: a data return goes through the shared
 *  upload form (§8.2), a document through the document upload. */
export interface UploadTarget {
  participantId: number;
  requirementId?: number;
  kind: RequirementKind;
  docTypeId?: number | null;
  /** The failed or rejected file this one corrects (§6.4). */
  replacesId?: number;
}

export const uploadTargetFor = (r: Requirement, replacesId?: number): UploadTarget => ({
  participantId: r.participant_id,
  requirementId: r.id,
  kind: r.kind,
  docTypeId: r.doc_type_id,
  replacesId,
});

export function downloadItem(item: Pick<CycleItem, "kind" | "id" | "filename">) {
  return api.download(
    item.kind === "document"
      ? `/documents/${item.id}/download`
      : `/submissions/${item.id}/download`,
    item.filename,
  );
}
