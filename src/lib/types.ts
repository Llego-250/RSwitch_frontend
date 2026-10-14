// Shapes returned by the FastAPI backend (see backend/app/models and routers).

// The three roles of SRS §4.1 (the legacy Board role no longer exists).
export type BackendRole = "Compliance" | "Business" | "Technical / Admin";
// SRS §9.1 / REQ-INTG-003, worded exactly as the SRS.
export type IntegrationStatus =
  | "Healthy"
  | "Warning"
  | "Failed"
  | "Pending"
  | "Not Configured"
  | "Running"
  | "Queued"
  | "Paused";
export type IssueSeverity = "Critical" | "High" | "Medium" | "Low";
// SRS §9.4 incident status ("Issues" are now Incidents — see lib/compliance.ts).
export type IncidentStatusValue =
  | "Open"
  | "Under Investigation"
  | "Remediation In Progress"
  | "Resolved"
  | "Closed";
/** "In Progress" is never returned any more (stored rows were converted);
 *  it stays in the union only so older comparisons still compile. */
export type IssueStatus = IncidentStatusValue | "In Progress";
export type DocumentStatus = "On File" | "Expiring Soon" | "Expired" | "Missing";

export interface Me {
  id: number;
  email: string;
  full_name: string;
  role: BackendRole;
  is_senior: boolean;
  mfa_enabled: boolean;
  last_login_at: string | null;
  /** "mfa_setup" until two-factor is enrolled (REQ-AUTH-002). */
  session_scope: "access" | "mfa_setup" | "api_key";
  session_timeout_minutes: number;
  mfa_enforced: boolean;
}

// SRS §10.1. type is one of INSTITUTION_TYPES, region one of REGIONS.
export interface Participant {
  id: number;
  name: string;
  short_name: string;
  code: string;
  type: string;
  country: string;
  region: string;
  registration_date: string | null;
  primary_contact_name: string;
  primary_contact_email: string;
  status: "Active" | "Inactive" | "Suspended";
  is_active: boolean;
  expected_frequency_days: number;
  created_at: string;
}

export type ValidationIssue = { row: number; column: string; rule: string; description: string };

/** One data source of a participant (SRS §10.2). Secrets come back masked only. */
export interface IntegrationRow {
  id: number;
  participant_id: number;
  participant_name: string;
  participant_code: string;
  participant_type: string;
  source_name: string;
  integration_mode: "Manual" | "Automated API";
  auth_type: "None" | "API Key" | "OAuth 2.0";
  endpoint_url_masked: string;
  credentials_masked: Partial<
    Record<"api_key" | "client_id" | "client_secret" | "token_url", string>
  >;
  configured: boolean;
  schedule_cron: string;
  next_run_at: string | null;
  template_id: number | null;
  template_name: string | null;
  mapping_id: number | null;
  mapping_code: string | null;
  mapping_version: string | null;
  status: IntegrationStatus;
  paused: boolean;
  note: string;
  source: "Manual" | "Schedule check" | "Pipeline";
  warnings: ValidationIssue[];
  last_sync_at: string | null;
  last_sync_records: number;
  last_sync_errors: number;
  last_success_at: string | null;
  last_submission: {
    id: number;
    period: string;
    status: string;
    uploaded_at: string;
    records_received: number;
    error_count: number;
    warning_count: number;
  } | null;
  active_job: { id: number; status: string; progress: number } | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

/** An incident as GET /issues returns it: the original fields plus the
 *  §10.4 ones. New code should use lib/compliance.ts (Incident). */
export interface Issue {
  id: number;
  participant_id: number;
  description: string;
  severity: IssueSeverity;
  /** The assigned owner's name. */
  assignee: string;
  status: IssueStatus;
  due_date: string | null;
  notes: string;
  created_at: string;
  ref?: string;
  participant_name?: string;
  incident_date?: string | null;
  raised_at?: string;
  owner_id?: number | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  resolution_summary?: string;
  /** Not yet Resolved or Closed. */
  is_open?: boolean;
}

/** One transfer (upload or API pull). errors/warnings come with GET /submissions/{id}. */
export interface Submission {
  id: number;
  participant_id: number;
  participant_name: string;
  participant_code: string;
  integration_id: number | null;
  source_name: string | null;
  integration_mode: string | null;
  template_id: number | null;
  requirement_id: number | null;
  requirement_name: string | null;
  period: string;
  filename: string;
  uploaded_at: string;
  uploaded_by: string;
  result: "Passed" | "Failed";
  status: "Submitted" | "Validation Failed" | "Under Review" | "Approved" | "Rejected";
  records_received: number;
  error_count: number;
  warning_count: number;
  errors?: ValidationIssue[];
  warnings?: ValidationIssue[];
  row_count: number;
  numeric_totals: Record<string, number>;
  breakdowns: Record<string, Record<string, { count: number; amount: number }>>;
  loaded_at: string | null;
  replaces_submission_id: number | null;
  replaced_by_id: number | null;
  rejection_reason: string;
  job: { id: number; status: string; progress: number } | null;
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
  last_status: Submission["status"] | null;
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
  document: {
    id: number;
    filename: string;
    uploaded_at: string;
    expiry_date: string | null;
    notes: string;
  } | null;
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

export type UserStatus = "Active" | "Inactive" | "Invited";

export interface UserRow {
  id: number;
  email: string;
  full_name: string;
  role: BackendRole;
  status: UserStatus;
  is_active: boolean;
  is_senior: boolean;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  invited_at: string | null;
  locked: boolean;
  locked_until: string | null;
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
  user_agent: string;
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

export interface OrganizationSettings {
  name: string;
  logo_url: string;
  timezone: string;
  date_format: string;
}

export interface SecuritySettings {
  mfa_enforced: boolean;
  session_timeout_minutes: number;
  min_password_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_digit: boolean;
  require_special: boolean;
  password_history: number;
  lockout_attempts: number;
  lockout_minutes: number;
  trusted_device_days: number;
  reset_link_minutes: number;
  invite_link_hours: number;
}

/** GET /settings — module sections (anomaly, pipelines, …) are read by their own components. */
export interface SystemSettings {
  organization: OrganizationSettings;
  security: SecuritySettings;
  reminders: { days_before: number[]; action_item_days_before: number[] };
  risk_weights: { integration: number; compliance: number; incidents: number; overdue: number };
  notifications: { events: Record<string, boolean> };
  anomaly: {
    volume_deviation_pct: number;
    error_rate_pct: number;
    auto_escalate_days: number;
  } & Record<string, unknown>;
  pipelines: { log_retention_days: number } & Record<string, unknown>;
}

export interface PasswordPolicy {
  min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_digit: boolean;
  require_special: boolean;
  special_characters: string;
  history: number;
  reset_link_minutes: number;
  trusted_device_days: number;
}

/** REQ-NOTIF-003: one SRS §13 event and whether it's switched on. */
export interface NotificationEventSetting {
  key: string;
  label: string;
  recipient: string;
  channels: ("In-app" | "Email")[];
  always_on: boolean;
  enabled: boolean;
}

export interface EmailLogRow {
  id: number;
  to_address: string;
  subject: string;
  body: string;
  event: string;
  event_label: string;
  status: "Sent" | "Logged" | "Failed";
  error: string;
  attachments: string[];
  created_at: string;
}

export interface TrustedDeviceRow {
  id: number;
  user_agent: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
}

export interface NotificationRow {
  id: number;
  event: string;
  event_label: string;
  title: string;
  message: string;
  severity: "alert" | "warning" | "info";
  link: string;
  created_at: string;
  read: boolean;
  dismissed: boolean;
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

export type AlertStatus =
  | "Generated"
  | "Acknowledged"
  | "Under Investigation"
  | "Escalated"
  | "Closed";

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
  by_institution_type: {
    institution_type: string;
    participants: number;
    transactions: number;
    volume: number;
    volume_share_pct: number;
  }[];
  by_channel: { channel: string; transactions: number; volume: number; share_pct: number }[];
  trend: {
    month: string;
    inclusion_share_pct: number | null;
    digital_share_pct: number | null;
    transactions: number;
  }[];
}
