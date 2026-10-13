// Governance module (SRS §5.7, §6.3, §9.4, §10.6, §19.5): API types and
// TanStack Query hooks. Every value shown on the Governance page comes from
// these endpoints; nothing is computed from fixtures.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "./api";

export const COMMITTEE_TYPES = [
  "Board",
  "Steering Committee",
  "Technical Working Group",
  "Operational Working Group",
] as const;
export type CommitteeType = (typeof COMMITTEE_TYPES)[number];

export const MEMBER_ROLES = ["Member", "Vice-Chair", "Secretary", "Observer"] as const;
export const DOC_CATEGORIES = ["Policy", "Minutes", "Decision", "Working Paper", "Other"] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];
export const ACCESS_LEVELS = ["Internal", "Restricted"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const ACTION_STATUSES = ["Open", "In Progress", "Completed", "Overdue"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

// REQ-GOV-002: PDF, Word and Excel only (the backend enforces this too).
export const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx"];
export const FILE_TYPES_MESSAGE =
  "Only PDF, Word (.doc, .docx) and Excel (.xls, .xlsx) files can be uploaded.";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface UserRef {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface Institution {
  id: number;
  name: string;
  code: string;
  type: string;
  primary_contact_name: string;
  primary_contact_email: string;
}

export interface GovDirectory {
  users: UserRef[];
  institutions: Institution[];
}

export interface CommitteeMember {
  id: number;
  committee_id: number;
  kind: "staff" | "representative";
  user_id: number | null;
  participant_id: number | null;
  institution: string | null;
  name: string;
  email: string;
  staff_role: string | null;
  role: string;
  joined_on: string;
}

export interface Committee {
  id: number;
  name: string;
  type: CommitteeType;
  description: string;
  is_active: boolean;
  created_at: string;
  chair: UserRef | null;
  /** The signed-in user chairs or sits on this committee. */
  is_member: boolean;
  members: CommitteeMember[];
  staff_count: number;
  representative_count: number;
  open_action_items: number;
  overdue_action_items: number;
  upcoming_meetings: number;
  document_count: number;
}

export interface GovDocument {
  id: number;
  series_id: number;
  title: string;
  category: DocCategory;
  committee_id: number | null;
  committee: string;
  version: string;
  is_latest: boolean;
  access_level: AccessLevel;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_by_id: number | null;
  uploaded_at: string;
  meeting_id: number | null;
  meeting_title: string | null;
  /** Earlier versions, newest first (list endpoint only). */
  versions?: GovDocument[];
}

export interface MeetingAttendee {
  id: number;
  user_id: number | null;
  member_id: number | null;
  kind: "staff" | "representative";
  name: string;
  email: string;
}

export interface GovMeeting {
  id: number;
  title: string;
  committee_id: number | null;
  committee: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string;
  agenda: string;
  decisions: string[];
  attendees: MeetingAttendee[];
  status: "Upcoming" | "Past";
  minutes: {
    id: number;
    title: string;
    version: string;
    filename: string;
    access_level: AccessLevel;
  } | null;
  document_count: number;
  action_items: { total: number; open: number; overdue: number; completed: number };
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GovMeetingDetail extends GovMeeting {
  documents: GovDocument[];
  action_item_list: GovActionItem[];
}

export interface GovActionItem {
  id: number;
  description: string;
  owner: {
    type: "user" | "institution" | "unlinked";
    id: number | null;
    name: string;
    email: string;
  };
  committee_id: number | null;
  committee: string;
  committee_type: CommitteeType | null;
  chair: UserRef | null;
  meeting_id: number | null;
  meeting_title: string | null;
  due_date: string;
  days_until_due: number;
  status: ActionStatus;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string;
  created_by: string;
  created_at: string;
  /** Governance managers, or the RSwitch user who owns it (§6.3 step 6). */
  can_update_status: boolean;
}

export interface OverdueGroup {
  committee_id: number | null;
  committee: string;
  committee_type: CommitteeType | null;
  chair: UserRef | null;
  count: number;
  max_days_overdue: number;
  items: GovActionItem[];
}

// ---- queries ----------------------------------------------------------------

const KEY = ["governance"] as const;

export const useGovDirectory = () =>
  useQuery({
    queryKey: [...KEY, "directory"],
    queryFn: () => api.get<GovDirectory>("/governance/directory"),
    staleTime: 5 * 60_000,
  });

export const useCommittees = () =>
  useQuery({
    queryKey: [...KEY, "committees"],
    queryFn: () => api.get<Committee[]>("/governance/committees"),
  });

export const useGovDocuments = () =>
  useQuery({
    queryKey: [...KEY, "documents"],
    queryFn: () => api.get<GovDocument[]>("/governance/documents"),
  });

/** Meetings in [start, end] (YYYY-MM-DD, inclusive); all meetings when omitted. */
export const useMeetings = (range?: { start?: string; end?: string }) =>
  useQuery({
    queryKey: [...KEY, "meetings", range?.start ?? "", range?.end ?? ""],
    queryFn: () => {
      const params = new URLSearchParams();
      if (range?.start) params.set("start", range.start);
      if (range?.end) params.set("end", range.end);
      const qs = params.toString();
      return api.get<GovMeeting[]>(`/governance/meetings${qs ? `?${qs}` : ""}`);
    },
  });

export const useMeeting = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "meetings", "detail", id],
    queryFn: () => api.get<GovMeetingDetail>(`/governance/meetings/${id}`),
    enabled: id !== null,
  });

export const useActionItems = () =>
  useQuery({
    queryKey: [...KEY, "action-items"],
    queryFn: () => api.get<GovActionItem[]>("/governance/action-items"),
  });

export const useOverdueActionItems = () =>
  useQuery({
    queryKey: [...KEY, "action-items", "overdue"],
    queryFn: () => api.get<OverdueGroup[]>("/governance/action-items/overdue"),
  });

/** Any governance write can change counts shown elsewhere on the page. */
export function useRefreshGovernance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: KEY });
}

// ---- errors -----------------------------------------------------------------

/** §20.2: the API returns validation errors as [{field, rule, message}]
 *  (FastAPI's own as [{loc, msg}]); split them per field for inline display. */
export function fieldErrors(e: unknown): {
  fields: Record<string, string>;
  message: string | null;
} {
  const message = errorMessage(e);
  try {
    const parsed: unknown = JSON.parse(message);
    if (Array.isArray(parsed)) {
      const fields: Record<string, string> = {};
      for (const entry of parsed as Record<string, unknown>[]) {
        const loc = Array.isArray(entry.loc) ? entry.loc : [];
        const field = String(entry.field ?? loc[loc.length - 1] ?? "form");
        fields[field] = String(entry.message ?? entry.msg ?? "Invalid value");
      }
      return { fields, message: null };
    }
  } catch {
    /* a plain message */
  }
  return { fields: {}, message };
}

export function checkUploadFile(file: File | null): string | null {
  if (!file) return "Choose a file to upload.";
  const name = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) return FILE_TYPES_MESSAGE;
  if (file.size > MAX_UPLOAD_BYTES) return "The uploaded file exceeds the 50 MB maximum size.";
  if (file.size === 0) return "The file is empty.";
  return null;
}

// ---- dates ------------------------------------------------------------------

/** The API stores times as naive UTC. */
export function parseUtc(value: string): Date {
  return new Date(/(Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
}

/** A YYYY-MM-DD date as a local calendar day (no timezone shift). */
export function parseDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const fmtDay = (value: string) =>
  parseDay(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** A stored UTC timestamp as a local calendar date. */
export const fmtDate = (value: string) =>
  parseUtc(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const fmtDateTime = (value: string) =>
  parseUtc(value).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const fmtTime = (value: string) =>
  parseUtc(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function dueLabel(item: Pick<GovActionItem, "days_until_due" | "status">): string {
  if (item.status === "Completed") return "";
  const d = item.days_until_due;
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} overdue`;
  if (d === 0) return "due today";
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

export function fmtBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Value for <input type="datetime-local"> from a stored UTC time. */
export function toLocalInput(value: string): string {
  const d = parseUtc(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- presentation helpers ---------------------------------------------------

// One colour per committee type, used by the calendar and badges.
export const COMMITTEE_COLORS: Record<CommitteeType, { dot: string; chip: string }> = {
  Board: {
    dot: "bg-[#6D5BD0]",
    chip: "bg-[#EFEDFB] text-[#5B4BC4] border-[#6D5BD0]/30 dark:bg-indigo-950/50 dark:text-indigo-300",
  },
  "Steering Committee": {
    dot: "bg-[#168FA8]",
    chip: "bg-[#E7F5F8] text-[#0F6F83] border-[#168FA8]/30 dark:bg-cyan-950/50 dark:text-cyan-300",
  },
  "Technical Working Group": {
    dot: "bg-[#D97706]",
    chip: "bg-[#FFF3DF] text-[#B45309] border-[#D97706]/30 dark:bg-amber-950/50 dark:text-amber-300",
  },
  "Operational Working Group": {
    dot: "bg-[#16A979]",
    chip: "bg-[#E8F7F1] text-[#12825E] border-[#16A979]/30 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
};

const FALLBACK_COLOR = {
  dot: "bg-slate-400",
  chip: "bg-slate-100 text-[#526174] border-slate-300 dark:bg-slate-800 dark:text-slate-300",
};

export const committeeColor = (type: string | null | undefined) =>
  (type && COMMITTEE_COLORS[type as CommitteeType]) || FALLBACK_COLOR;

export function downloadDocument(doc: Pick<GovDocument, "id" | "filename">) {
  return api.download(`/governance/documents/${doc.id}/download`, doc.filename);
}
