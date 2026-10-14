// Integrations module helpers (SRS §5.3): status presentation, the manual
// upload call (§8.2) and the reference lists the forms use.

import { useQuery } from "@tanstack/react-query";
import type { Status } from "@/components/StatusBadge";
import { api, ApiError } from "./api";
import type { IntegrationStatus, Submission, ValidationIssue } from "./types";

// SRS §10.1 — mirrors backend/app/models/enums.py.
export const INSTITUTION_TYPES = ["Commercial Bank", "E-money Issuer", "MFI", "SACCO"] as const;
export const REGIONS = [
  "Kigali City",
  "Northern Province",
  "Southern Province",
  "Eastern Province",
  "Western Province",
] as const;
export const PARTICIPANT_STATUSES = ["Active", "Inactive", "Suspended"] as const;

// REQ-INTG-002 / §16
export const INTEGRATION_MODES = ["Manual", "Automated API"] as const;
export const AUTH_TYPES = ["None", "API Key", "OAuth 2.0"] as const;

// §9.1, in the order filters show them.
export const INTEGRATION_STATUSES: IntegrationStatus[] = [
  "Healthy",
  "Warning",
  "Failed",
  "Pending",
  "Not Configured",
  "Running",
  "Queued",
  "Paused",
];

export const INTEGRATION_BADGE: Record<IntegrationStatus, Status> = {
  Healthy: "healthy",
  Warning: "warning",
  Failed: "failed",
  Pending: "queued",
  "Not Configured": "draft",
  Running: "running",
  Queued: "queued",
  Paused: "paused",
};

// What each status means (§9.1), for tooltips and the legend.
export const INTEGRATION_STATUS_HELP: Record<IntegrationStatus, string> = {
  Healthy: "Last transfer succeeded with no errors",
  Warning:
    "Last transfer succeeded with validation warnings, or a transfer is late but within the grace period",
  Failed: "Last transfer failed or was rejected, or the source is long overdue",
  Pending: "Configured; nothing received yet",
  "Not Configured": "No integration set up for this data source yet",
  Running: "Transfer currently in progress",
  Queued: "Transfer scheduled but not yet started",
  Paused: "Transfer manually paused by an administrator",
};

export const SUBMISSION_BADGE: Record<string, Status> = {
  Submitted: "queued",
  "Validation Failed": "failed",
  "Under Review": "running",
  Approved: "healthy",
  Rejected: "failed",
};

export const ALLOWED_EXTENSIONS = ["csv", "xlsx", "xml"];
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Client-side mirror of §11.3, so the form can flag the file inline. */
export function checkFile(file: File | null): string | null {
  if (!file) return "Choose the file the institution sent.";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) return "File type must be CSV, XLSX or XML.";
  if (file.size > MAX_UPLOAD_BYTES) return "The uploaded file exceeds the 50 MB maximum size.";
  if (file.size === 0) return "The file is empty.";
  return null;
}

/** Row label for a §20.2 file error: row 0 is the file/header. */
export const issueWhere = (issue: ValidationIssue) => (issue.row ? `Row ${issue.row}` : "File");

/** Older stored reports used {row, field, error}. */
export function normalizeIssues(entries: unknown): ValidationIssue[] {
  if (!Array.isArray(entries)) return [];
  return entries.map((e: Record<string, unknown>) => ({
    row: Number(e.row ?? 0),
    column: String(e.column ?? e.field ?? ""),
    rule: String(e.rule ?? ""),
    description: String(e.description ?? e.error ?? e.message ?? ""),
  }));
}

export interface UploadJob {
  id: number;
  status: string;
  name: string;
}

export type UploadResult =
  | { ok: true; submission: Submission; job: UploadJob }
  | { ok: false; submission: Submission | null; errors: ValidationIssue[]; message: string };

export interface UploadInput {
  participantId: number;
  period: string;
  file: File;
  requirementId?: number | null;
  integrationId?: number | null;
  replacesSubmissionId?: number | null;
}

/**
 * POST /submissions/upload. A file that fails validation is still recorded
 * (status "Validation Failed") and comes back as `ok: false` with its
 * row/column report; any other problem throws an ApiError (413, field
 * errors, 403 …).
 */
export async function uploadSubmission(input: UploadInput): Promise<UploadResult> {
  const form = new FormData();
  form.append("participant_id", String(input.participantId));
  form.append("period", input.period);
  form.append("file", input.file);
  if (input.requirementId) form.append("requirement_id", String(input.requirementId));
  if (input.integrationId) form.append("integration_id", String(input.integrationId));
  if (input.replacesSubmissionId)
    form.append("replaces_submission_id", String(input.replacesSubmissionId));
  try {
    const res = await api.post<{ submission: Submission; job: UploadJob }>(
      "/submissions/upload",
      form,
    );
    return { ok: true, ...res };
  } catch (e) {
    const detail = e instanceof ApiError ? e.detail : undefined;
    if (
      e instanceof ApiError &&
      e.status === 422 &&
      detail &&
      typeof detail === "object" &&
      !Array.isArray(detail)
    ) {
      const d = detail as { message?: string; submission?: Submission; errors?: unknown };
      return {
        ok: false,
        submission: d.submission ?? null,
        errors: normalizeIssues(d.errors),
        message: d.message ?? e.message,
      };
    }
    throw e;
  }
}

export interface DataReturnRequirement {
  id: number;
  requirement_name: string;
  regulatory_reference: string;
  frequency: string;
  due_date: string;
  submission_status: string;
  template_id: number | null;
  template_name: string | null;
}

/** The upload form's requirement-type dropdown (§8.2). */
export const useUploadRequirements = (participantId: number | undefined) =>
  useQuery({
    queryKey: ["submission-requirements", participantId],
    queryFn: () =>
      api.get<DataReturnRequirement[]>(`/submissions/requirements?participant_id=${participantId}`),
    enabled: participantId !== undefined,
  });

export interface IntegrationInput {
  participant_id?: number;
  source_name?: string;
  integration_mode?: (typeof INTEGRATION_MODES)[number];
  endpoint_url?: string;
  auth_type?: (typeof AUTH_TYPES)[number];
  credentials?: {
    api_key?: string;
    client_id?: string;
    client_secret?: string;
    token_url?: string;
  };
  clear_credentials?: boolean;
  schedule_cron?: string;
  template_id?: number | null;
  mapping_id?: number | null;
  paused?: boolean;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const mins = Math.floor(
    (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 60_000,
  );
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

/** API datetimes are naive UTC; show them in the viewer's local time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
