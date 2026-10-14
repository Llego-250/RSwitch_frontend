// Reports (SRS §5.11, §14, §19.6) — types and hooks for /reports. Which report
// types a user may generate or only view comes from the API (§14 per-report
// permissions); the UI never decides it on its own.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type ReportFormat = "pdf" | "xlsx" | "csv";
export type RunStatus = "Queued" | "Running" | "Completed" | "Failed";
export type Frequency = "Daily" | "Weekly" | "Monthly";

/** Filter values as the API stores them (REQ-RPT-006). */
export interface ReportFilters {
  participant_id?: number;
  institution_type?: string;
  region?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  risk_level?: string;
  integration_type?: string;
  severity?: string;
  committee_id?: number;
  owner?: string;
}
export type FilterKey = keyof ReportFilters;

export interface ReportType {
  key: string;
  name: string;
  section: string;
  purpose: string;
  columns: string[];
  filters: FilterKey[];
  status_label: string;
  status_options: string[];
  date_basis: string;
  note: string;
  formats: ReportFormat[];
  generate_roles: string[];
  view_roles: string[];
  can_generate: boolean;
  can_view: boolean;
  can_schedule: boolean;
}

export interface ReportCatalog {
  types: ReportType[];
  frequencies: Frequency[];
  delivery_hour: number;
  filter_labels: Record<string, string>;
  options: {
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
    risk_levels: string[];
    integration_types: string[];
    severities: string[];
    committees: { id: number; name: string }[];
  };
}

export interface ReportRun {
  id: number;
  ref: string;
  name: string;
  report: string;
  report_type: string;
  report_name: string;
  format: ReportFormat;
  status: RunStatus;
  error: string;
  filters: ReportFilters;
  filters_text: string[];
  row_count: number | null;
  filename: string;
  size_bytes: number;
  generated_by: string;
  generated_by_id: number | null;
  generated_at: string;
  finished_at: string | null;
  schedule_id: number | null;
  download_url: string | null;
  mine: boolean;
}

export interface ReportSchedule {
  id: number;
  name: string;
  report: string;
  report_name: string;
  format: ReportFormat;
  frequency: Frequency;
  filters: ReportFilters;
  filters_text: string[];
  active: boolean;
  created_by: string;
  created_at: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_id: number | null;
  cancelled_at: string | null;
  cancelled_by: string;
}

export interface ReportTemplate {
  id: number;
  name: string;
  report: string;
  filters: ReportFilters;
  format: ReportFormat;
  shared: boolean;
  owner_id: number;
  owner_name: string;
  mine: boolean;
  created_at: string;
}

export const FORMAT_LABEL: Record<ReportFormat, string> = {
  pdf: "PDF",
  xlsx: "Excel (XLSX)",
  csv: "CSV",
};

/** Drops empty values so saved filters stay minimal. */
export function compactFilters(filters: ReportFilters): ReportFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as ReportFilters;
}

const KEY = ["reports"] as const;

export const useReportCatalog = () =>
  useQuery({
    queryKey: [...KEY, "types"],
    queryFn: () => api.get<ReportCatalog>("/reports/types"),
  });

/** History; polls while any run is still being generated (§17.3 queue). */
export const useReportHistory = (params: { report?: string; mine?: boolean } = {}) =>
  useQuery({
    queryKey: [...KEY, "history", params],
    queryFn: () => {
      const q = new URLSearchParams({ limit: "200" });
      if (params.report) q.set("report", params.report);
      if (params.mine) q.set("mine", "true");
      return api.get<ReportRun[]>(`/reports?${q}`);
    },
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "Queued" || r.status === "Running")
        ? 2_000
        : false,
  });

export const useReportSchedules = () =>
  useQuery({
    queryKey: [...KEY, "schedules"],
    queryFn: () => api.get<ReportSchedule[]>("/reports/schedules"),
  });

export const useReportTemplates = (report?: string) =>
  useQuery({
    queryKey: [...KEY, "templates", report ?? "all"],
    queryFn: () =>
      api.get<ReportTemplate[]>(
        `/reports/templates${report ? `?report=${encodeURIComponent(report)}` : ""}`,
      ),
  });

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useGenerateReport() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      report: string;
      format: ReportFormat;
      filters: ReportFilters;
      name?: string;
    }) => api.post<ReportRun>("/reports/generate", body),
    onSuccess: invalidate,
  });
}

export function useCreateSchedule() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      report: string;
      format: ReportFormat;
      frequency: Frequency;
      filters: ReportFilters;
      name?: string;
      start_date?: string;
    }) => api.post<ReportSchedule>("/reports/schedules", body),
    onSuccess: invalidate,
  });
}

export function useCancelSchedule() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api.delete<ReportSchedule>(`/reports/schedules/${id}`),
    onSuccess: invalidate,
  });
}

export function useCreateTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      name: string;
      report: string;
      filters: ReportFilters;
      format: ReportFormat;
      shared: boolean;
    }) => api.post<ReportTemplate>("/reports/templates", body),
    onSuccess: invalidate,
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: boolean }>(`/reports/templates/${id}`),
    onSuccess: invalidate,
  });
}

/** Fetches a run until it leaves the queue (used right after generating). */
export async function waitForRun(id: number, timeoutMs = 60_000): Promise<ReportRun> {
  const started = Date.now();
  for (;;) {
    const run = await api.get<ReportRun>(`/reports/${id}`);
    if (run.status === "Completed" || run.status === "Failed") return run;
    if (Date.now() - started > timeoutMs) return run;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

export const downloadRun = (run: Pick<ReportRun, "id" | "filename" | "format">) =>
  api.download(`/reports/${run.id}/download`, run.filename || `report-${run.id}.${run.format}`);
