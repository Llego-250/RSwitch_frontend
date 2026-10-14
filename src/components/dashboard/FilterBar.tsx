// REQ-DASH-009 dashboard filters: institution, participant type, region,
// participant status, date range and risk category. They are applied by the
// API to every widget whose scope is "Dashboard filters", and kept for the
// browser session by the page.
import { FilterX } from "lucide-react";
import { useDashboardOptions, type DashboardFilters } from "@/lib/dashboard";

const ctl =
  "h-8 px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-xs text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40";

export function FilterBar({
  filters,
  onChange,
  inScope,
  total,
}: {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  inScope?: number;
  total?: number;
}) {
  const options = useDashboardOptions();
  const o = options.data;
  const set = (patch: DashboardFilters) => onChange({ ...filters, ...patch });
  const active = Object.values(filters).some((v) => v !== undefined && v !== "");

  const select = (
    label: string,
    value: string | number | undefined,
    values: { value: string; label: string }[],
    apply: (v: string) => void,
  ) => (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => apply(e.target.value)}
      className={ctl}
    >
      <option value="">{label}: all</option>
      {values.map((v) => (
        <option key={v.value} value={v.value}>
          {v.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      {select(
        "Institution",
        filters.participant_id,
        (o?.participants ?? []).map((p) => ({ value: String(p.id), label: p.name })),
        (v) => set({ participant_id: v ? Number(v) : undefined }),
      )}
      {select(
        "Type",
        filters.institution_type,
        (o?.institution_types ?? []).map((t) => ({ value: t, label: t })),
        (v) => set({ institution_type: v || undefined }),
      )}
      {select(
        "Region",
        filters.region,
        (o?.regions ?? []).map((r) => ({ value: r, label: r })),
        (v) => set({ region: v || undefined }),
      )}
      {select(
        "Status",
        filters.status,
        (o?.statuses ?? []).map((s) => ({ value: s, label: s })),
        (v) => set({ status: v || undefined }),
      )}
      {select(
        "Risk",
        filters.risk,
        (o?.risk_categories ?? []).map((r) => ({ value: r, label: r })),
        (v) => set({ risk: v || undefined }),
      )}
      <label className="inline-flex items-center gap-1 text-xs text-[#526174] dark:text-slate-300">
        From
        <input
          type="date"
          aria-label="Date from"
          value={filters.date_from ?? ""}
          max={filters.date_to}
          onChange={(e) => set({ date_from: e.target.value || undefined })}
          className={ctl}
        />
      </label>
      <label className="inline-flex items-center gap-1 text-xs text-[#526174] dark:text-slate-300">
        To
        <input
          type="date"
          aria-label="Date to"
          value={filters.date_to ?? ""}
          min={filters.date_from}
          onChange={(e) => set({ date_to: e.target.value || undefined })}
          className={ctl}
        />
      </label>
      {active && (
        <button
          onClick={() => onChange({})}
          className="h-8 px-3 rounded-xl text-xs font-semibold text-[#168FA8] hover:bg-[#E7F5F8] dark:hover:bg-cyan-950/40 inline-flex items-center gap-1 cursor-pointer"
        >
          <FilterX className="h-3.5 w-3.5" />
          Clear filters
        </button>
      )}
      {active && inScope !== undefined && total !== undefined && (
        <span className="text-[11px] text-[#7B8798]">
          {inScope} of {total} participants in scope
        </span>
      )}
    </div>
  );
}
