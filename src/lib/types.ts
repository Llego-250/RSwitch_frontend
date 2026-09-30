// Shapes returned by the FastAPI backend (see backend/app/models and routers).

export type BackendRole = "Compliance" | "Business" | "Board" | "Technical / Admin" | "Participant";
export type IntegrationStatus = "Connected" | "Degraded" | "Disconnected" | "Maintenance";
export type IssueSeverity = "Critical" | "High" | "Medium" | "Low";
export type IssueStatus = "Open" | "In Progress" | "Resolved" | "Closed";
export type DocumentStatus = "On File" | "Expiring Soon" | "Expired" | "Missing";

export interface Me {
  id: number;
  email: string;
  full_name: string;
  role: BackendRole;
  participant_id: number | null;
  mfa_enabled: boolean;
  last_login_at: string | null;
}

export interface Participant {
  id: number;
  name: string;
  code: string;
  type: string;
  is_active: boolean;
  expected_frequency_days: number;
  created_at: string;
}

export interface IntegrationRow {
  id: number;
  participant_id: number;
  participant_name: string;
  participant_code: string;
  status: IntegrationStatus;
  note: string;
  source: "Manual" | "Schedule check";
  updated_at: string;
  updated_by: string;
}

export interface Issue {
  id: number;
  participant_id: number;
  description: string;
  severity: IssueSeverity;
  assignee: string;
  status: IssueStatus;
  due_date: string | null;
  notes: string;
  created_at: string;
}

export interface Submission {
  id: number;
  participant_id: number;
  template_id: number | null;
  period: string;
  filename: string;
  uploaded_at: string;
  uploaded_by: string;
  result: "Passed" | "Failed";
  error_count: number;
  errors: unknown[];
  row_count: number;
  numeric_totals: Record<string, number>;
  review_status: "Pending Review" | "Approved" | "Rejected";
  review_note: string;
  reviewed_by: string;
  reviewed_at: string | null;
}

export interface SubmissionRosterRow {
  participant_id: number;
  participant_name: string;
  participant_code: string;
  submission_count: number;
  last_period: string | null;
  last_uploaded_at: string | null;
  last_result: "Passed" | "Failed" | null;
}

export interface DocumentRosterRow {
  participant_id: number;
  participant_name: string;
  doc_type: string;
  status: DocumentStatus;
  expiry_date: string | null;
}

export interface DocumentType {
  id: number;
  name: string;
  renewal_months: number | null;
}

export interface ParticipantDocumentRow {
  doc_type: DocumentType;
  document: { id: number; filename: string; uploaded_at: string; expiry_date: string | null; notes: string } | null;
  status: DocumentStatus;
}

export interface Template {
  id: number;
  participant_id: number;
  name: string;
  version: number;
  applies_to: string;
  created_at: string;
}

export interface TemplateColumn {
  id: number;
  template_id: number;
  name: string;
  type: string;
  rule: string;
  required: boolean;
  position: number;
}

export interface Overview {
  participants_total: number;
  participants_connected: number;
  participants_degraded_or_worse: number;
  documents_needing_attention: number;
  open_issues_total: number;
  open_issues_by_severity: Record<IssueSeverity, number>;
}

export interface TrendPoint {
  month: string;
  submissions_total: number;
  submissions_passed: number;
  on_time_rate: number | null;
  volume: number;
  new_participants: number;
  cumulative_participants: number;
  issues_raised: number;
}

export interface UserRow {
  id: number;
  email: string;
  full_name: string;
  role: BackendRole;
  participant_id: number | null;
  is_active: boolean;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: number;
  timestamp: string;
  actor_email: string;
  actor_name: string;
  actor_role: string;
  action: string;
  resource: string;
  ip_address: string;
  status: "SUCCESS" | "WARNING" | "FAILED";
}

export interface ApiKeyRow {
  id: number;
  name: string;
  masked: string;
  owner: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
  key?: string;
}

export interface SystemSettings {
  organization: { name: string; timezone: string; date_format: string };
  security: { mfa_enforced: boolean; session_timeout_minutes: number; min_password_length: number };
  reminders: { days_before: number[] };
  risk_weights: { integration: number; compliance: number; incidents: number; overdue: number };
  anomaly: { volume_deviation_pct: number; error_rate_pct: number; auto_escalate_days: number };
}

export interface NotificationRow {
  id: number;
  title: string;
  message: string;
  severity: "alert" | "warning" | "info";
  link: string;
  created_at: string;
  read: boolean;
}

export interface GovDocument {
  id: number;
  title: string;
  category: string;
  committee: string;
  version: string;
  access_level: string;
  filename: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface Meeting {
  id: number;
  title: string;
  committee: string;
  scheduled_at: string;
  attendees_count: number;
  decisions_count: number;
  minutes_document_id: number | null;
  minutes_filename: string | null;
}

export interface ActionItem {
  id: number;
  description: string;
  owner: string;
  committee: string;
  due_date: string;
  completed: boolean;
  status: "Open" | "Overdue" | "Completed";
}

export interface WorkingGroup {
  id: number;
  name: string;
  chair: string;
  members: string;
}

export type AlertStatus = "Generated" | "Acknowledged" | "Under Investigation" | "Escalated" | "Closed";

export interface AnomalyAlert {
  id: number;
  participant_id: number;
  participant_name: string;
  indicator: string;
  baseline_value: string;
  observed_value: string;
  deviation: string;
  recommended_area: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  baseline_method: string;
  status: AlertStatus;
  created_at: string;
  status_changed_at: string;
  days_in_state: number;
  notes: { date: string; user: string; text: string; from?: string; to?: string }[];
  resolution_summary: string;
}

export interface RiskRow {
  participant_id: number;
  participant_name: string;
  participant_type: string;
  score: number;
  components: { integration: number; compliance: number; incidents: number; overdue: number };
  top_factor: "integration" | "compliance" | "incidents" | "overdue" | null;
  history_months: number;
}

export interface ReportRun {
  id: number;
  report: string;
  format: "pdf" | "xlsx";
  participant_id: number | null;
  date_from: string | null;
  date_to: string | null;
  filename: string;
  size_bytes: number;
  generated_by: string;
  generated_at: string;
  schedule_id: number | null;
}

export interface ReportSchedule {
  id: number;
  name: string;
  report: string;
  format: "pdf" | "xlsx";
  frequency: "Daily" | "Weekly" | "Monthly";
  recipient: string;
  active: boolean;
  created_by: string;
  last_run_at: string | null;
}

export interface ParticipantNote {
  id: number;
  participant_id: number;
  author: string;
  note: string;
  created_at: string;
}

export interface InclusionSummary {
  total_transactions: number;
  total_volume: number;
  inclusion_institutions: number;
  inclusion_volume_share_pct: number | null;
  digital_share_pct: number | null;
  avg_transaction_value: number | null;
  by_institution_type: { institution_type: string; participants: number; transactions: number; volume: number; volume_share_pct: number }[];
  by_channel: { channel: string; transactions: number; volume: number; share_pct: number }[];
  trend: { month: string; inclusion_share_pct: number | null; digital_share_pct: number | null; transactions: number }[];
}
