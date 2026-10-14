// Role-aware dashboard (SRS §5.2 REQ-DASH-001..010, §15) — types and hooks
// for /dashboard. The API decides which widgets the signed-in role sees and
// computes every number; this module only carries filters and per-widget
// settings, which persist for the browser session (DASH-009/010).
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { api } from "./api";

export interface DashboardFilters {
  participant_id?: number;
  institution_type?: string;
  region?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  risk?: string;
}

export type WidgetSettings = Record<string, { period?: number | string; scope?: string }>;

export interface OptionSet {
  value: number | string;
  default: number | string;
  choices: { value: number | string; label: string }[];
  overridden?: boolean;
}

export interface Widget<T = unknown> {
  key: string;
  title: string;
  description: string;
  link: string;
  note: string;
  period: OptionSet | null;
  scope: OptionSet | null;
  data: T;
}

export interface DashboardPayload {
  role: string;
  as_of: string;
  generated_at: string;
  widgets: string[];
  sections: string[];
  filters: DashboardFilters;
  participants_in_scope: number;
  participants_total: number;
  elapsed_ms: number;
  data: Record<string, Widget>;
}

export interface DashboardOptions {
  participants: {
    id: number;
    name: string;
    code: string;
    type: string;
    region: string;
    status: string;
  }[];
  institution_types: string[];
  regions: string[];
  statuses: string[];
  risk_categories: string[];
}

// ---- widget data shapes ------------------------------------------------------

export interface DeadlineItem {
  key: string;
  participant_id: number;
  participant_name: string;
  requirement_name: string;
  period: string;
  due_date: string;
  days_until_due: number;
  status: string;
  projected: boolean;
}
export interface CountList<T> {
  count: number;
  period_label?: string;
  items: T[];
}
export interface OverdueItem {
  participant_name: string;
  requirement_name: string;
  period: string;
  due_date: string;
  days_overdue: number;
}
export interface SeverityCounts {
  Critical: number;
  High: number;
  Medium: number;
  Low: number;
  total: number;
  period_label: string;
}
export interface RateData {
  rate_pct: number | null;
  on_time: number;
  total: number;
  window_start: string;
  window_end: string;
  period_label: string;
  current_status?: Record<string, number>;
}
export interface ActionItemsData {
  governance: number;
  incident_remediation: number;
  total: number;
  period_label: string;
  items: {
    kind: string;
    description: string;
    owner: string;
    due_date: string;
    days_overdue: number;
    link: string;
  }[];
}
export interface ActivityData {
  source: "compliance" | "audit";
  period_label: string;
  items: {
    at: string;
    title: string;
    detail: string;
    status: string;
    kind: string;
    participant_name: string;
    actor: string;
    link: string;
  }[];
}
export interface HealthData {
  healthy: number;
  warning: number;
  failed: number;
  total: number;
  by_status: Record<string, number>;
}
export interface AlertsData {
  unacknowledged: number;
  escalated: number;
  by_severity: Record<string, number>;
  period_label: string;
  items: {
    id: number;
    ref: string;
    participant_name: string;
    indicator: string;
    severity: string;
    created_at: string;
    link: string;
  }[];
}
export interface InclusionSnapshotData {
  period_label: string;
  indicative_label: string;
  coverage: {
    institutions_reporting: number;
    institutions_registered: number;
    last_updated: string | null;
  };
  metrics: {
    key: string;
    label: string;
    unit: string;
    value: number | null;
    available: boolean;
    status: string;
    data_source: string;
    last_updated: string | null;
  }[];
}
export interface RiskData {
  distribution: Record<string, number>;
  total: number;
  riskiest: {
    participant_id: number;
    participant_name: string;
    score: number;
    band: string;
    top_factor: string | null;
    link: string;
  }[];
}
export interface PipelinesData {
  running: number;
  queued: number;
  failed: number;
  completed: number;
  period_label: string;
}
export interface FailedIntegrationsData {
  count: number;
  items: {
    integration_id: number;
    participant_name: string;
    source_name: string;
    mode: string;
    note: string;
    since: string;
    last_success_at: string | null;
    link: string;
  }[];
}
export interface FreshnessData {
  count: number;
  stale: number;
  items: {
    integration_id: number;
    participant_name: string;
    source_name: string;
    status: string;
    last_sync_at: string | null;
    last_success_at: string | null;
    hours_since_sync: number | null;
    expected_days: number;
    stale: boolean;
  }[];
}
export interface SystemHealthData {
  started_at: string;
  uptime_seconds: number;
  requests: number;
  errors_5xx: number;
  error_rate_pct: number | null;
  window_minutes: number;
  queue_depth: number;
  running_jobs: number;
  report_queue: number;
  period_label: string;
}
export interface MappingsData {
  count: number;
  items: {
    id: number;
    code: string;
    name: string;
    source_system: string;
    created_by: string;
    created_at: string;
    link: string;
  }[];
}
export interface PipelineRunsData {
  period_label: string;
  items: {
    id: number;
    name: string;
    participant_name: string;
    source_name: string | null;
    trigger: string;
    status: string;
    queued_at: string;
    finished_at: string | null;
    records_processed: number;
    error_count: number;
  }[];
}
export interface AttentionItem {
  id: string;
  kind: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  title: string;
  detail: string;
  participant_id: number | null;
  participant_name: string;
  since: string;
  age_days: number;
  link: string;
}
export interface AttentionData {
  total: number;
  by_kind: Record<string, number>;
  items: AttentionItem[];
}

// ---- session persistence (DASH-007/009/010) ----------------------------------------

function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** useState backed by sessionStorage: survives navigation and reloads within
 * the browser session, gone when the session ends. Switching `key` (another
 * user signs in) reads that key's own value; nothing is written until set. */
export function useSessionState<T>(key: string, initial: T) {
  const fallback = useRef(initial);
  const [state, setState] = useState(() => ({ key, value: readSession(key, initial) }));
  const value = state.key === key ? state.value : readSession(key, fallback.current);
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setState((s) => {
        const prev = s.key === key ? s.value : readSession(key, fallback.current);
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          sessionStorage.setItem(key, JSON.stringify(v));
        } catch {
          /* storage unavailable */
        }
        return { key, value: v };
      }),
    [key],
  );
  return [value, set] as const;
}

export function dashboardQuery(filters: DashboardFilters, settings: WidgetSettings): string {
  const q = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  if (Object.keys(settings).length) q.set("widgets", JSON.stringify(settings));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const useDashboard = (
  filters: DashboardFilters,
  settings: WidgetSettings,
  autoRefresh: boolean,
) =>
  useQuery({
    queryKey: ["dashboard", filters, settings],
    queryFn: () => api.get<DashboardPayload>(`/dashboard${dashboardQuery(filters, settings)}`),
    placeholderData: keepPreviousData,
    // REQ-DASH-006: every 5 minutes while enabled. Each poll carries the
    // idle header (api.ts), so it never counts as user activity.
    refetchInterval: autoRefresh ? 5 * 60_000 : false,
    refetchIntervalInBackground: autoRefresh,
  });

export const useDashboardOptions = () =>
  useQuery({
    queryKey: ["dashboard", "options"],
    queryFn: () => api.get<DashboardOptions>("/dashboard/options"),
    staleTime: 5 * 60_000,
  });

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const at = new Date(/(Z|[+-]\d\d:\d\d)$/.test(iso) ? iso : `${iso}Z`).getTime();
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function fmtDuration(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/** In-app navigation to a link the API gave (path plus query string). */
export function useOpenLink() {
  const router = useRouter();
  return (link: string) => {
    if (link) router.history.push(link);
  };
}
