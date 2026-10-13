// Financial inclusion (SRS §5.10, §14.4) — types and hooks for /inclusion.
// Every figure comes from the API's metric registry; a metric without data
// arrives as null and is shown as "Not available — awaiting data".
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type MetricValues = Record<string, number | null>;

export interface InclusionMetric {
  key: string;
  label: string;
  unit: string;
  kind: "stock" | "flow" | "ratio";
  description: string;
  value: number | null;
  available: boolean;
  status: string;
  data_source: string;
  last_updated: string | null;
  institutions: number;
}

export interface InclusionFilters {
  institution_type?: string;
  region?: string;
  period_from?: string;
  period_to?: string;
}

export interface InclusionDashboard {
  indicative: boolean;
  indicative_label: string;
  indicative_note: string;
  not_available_label: string;
  generated_at: string;
  filters: {
    institution_type: string | null;
    region: string | null;
    period_from: string | null;
    period_to: string | null;
  };
  options: { institution_types: string[]; regions: string[]; periods: string[] };
  coverage: {
    institutions_registered: number;
    institutions_reporting: number;
    submissions: number;
    periods: string[];
    last_updated: string | null;
  };
  region_basis_note: string;
  metrics: InclusionMetric[];
  by_institution_type: {
    institution_type: string;
    institutions: number;
    reporting: number;
    values: MetricValues;
    last_updated: string | null;
  }[];
  by_region: {
    region: string;
    reporting: number;
    values: MetricValues;
    region_basis: "reported" | "registered" | "mixed" | "";
    last_updated: string | null;
  }[];
  matrix: {
    institution_type: string;
    region: string;
    values: MetricValues;
    last_updated: string;
  }[];
  trend: { period: string; label: string; values: MetricValues }[];
}

export interface RegistryMetric {
  key: string;
  label: string;
  unit: string;
  kind: string;
  description: string;
  numerator: string;
  denominator: string;
  awaiting: string;
  sources: { column: string; label: string; requires_column: string }[];
}

export const inclusionQuery = (filters: InclusionFilters) => {
  const s = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => v && s.set(k, v));
  const q = s.toString();
  return q ? `?${q}` : "";
};

export const useInclusionDashboard = (filters: InclusionFilters) =>
  useQuery({
    queryKey: ["inclusion", "dashboard", filters],
    queryFn: () => api.get<InclusionDashboard>(`/inclusion/dashboard${inclusionQuery(filters)}`),
    placeholderData: (prev) => prev,
  });

export const useInclusionRegistry = () =>
  useQuery({
    queryKey: ["inclusion", "metrics"],
    queryFn: () =>
      api.get<{ indicative_label: string; metrics: RegistryMetric[] }>("/inclusion/metrics"),
  });

export const periodLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

/** Compact display of a metric value in its unit. */
export function formatMetric(
  value: number | null | undefined,
  unit: string,
  compact = false,
): string {
  if (value === null || value === undefined) return "—";
  if (unit === "%") return `${value.toFixed(1)}%`;
  const opts: Intl.NumberFormatOptions = compact
    ? { notation: "compact", maximumFractionDigits: 1 }
    : { maximumFractionDigits: 0 };
  const n = new Intl.NumberFormat(undefined, opts).format(value);
  return unit === "RWF" ? `${n} RWF` : n;
}
