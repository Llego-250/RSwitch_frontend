import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BookOpen, Download, FileSpreadsheet, Info, Lock } from "lucide-react";
import { AppShell, SectionCard, SecondaryButton } from "@/components/AppShell";
import { useRole } from "@/context/RoleContext";
import { hasCap } from "@/lib/roles";
import { api, errorMessage } from "@/lib/api";
import {
  formatMetric,
  inclusionQuery,
  periodLabel,
  useInclusionDashboard,
  useInclusionRegistry,
  type InclusionDashboard,
  type InclusionFilters,
  type InclusionMetric,
  type MetricValues,
} from "@/lib/inclusion";

export const Route = createFileRoute("/inclusion")({
  component: Inclusion,
});

const selectCls =
  "h-9 px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-xs text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40";
const AXIS_TICK = { fontSize: 10, fill: "#7B8798" };

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso.endsWith("Z") ? iso : `${iso}Z`).toLocaleDateString(undefined, {
        dateStyle: "medium",
      })
    : "—";

function Inclusion() {
  const { role } = useRole();
  const canExport = hasCap(role, "inclusion.manage");
  const [filters, setFilters] = useState<InclusionFilters>({});
  const [chartKey, setChartKey] = useState<string>("accounts");
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const dash = useInclusionDashboard(filters);
  const d = dash.data;

  const set = (patch: InclusionFilters) => setFilters((f) => ({ ...f, ...patch }));
  const periods = d?.options.periods ?? [];

  const doExport = async (format: "xlsx" | "pdf") => {
    setExporting(format);
    setExportError(null);
    try {
      const q = inclusionQuery(filters);
      await api.download(
        `/inclusion/export?format=${format}${q ? `&${q.slice(1)}` : ""}`,
        `financial_inclusion.${format}`,
      );
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  const available = (d?.metrics ?? []).filter((m) => m.available);
  const chartMetric = available.find((m) => m.key === chartKey) ?? available[0];

  return (
    <AppShell
      title="Financial Inclusion"
      subtitle="Aggregated inclusion metrics by institution type and region"
      breadcrumb="DECIDE › FINANCIAL INCLUSION"
      scope="Indicative"
      primaryAction={
        canExport ? (
          <div className="flex gap-2">
            <SecondaryButton
              icon={<FileSpreadsheet className="h-4 w-4" />}
              onClick={() => doExport("xlsx")}
            >
              {exporting === "xlsx" ? "Exporting…" : "Excel"}
            </SecondaryButton>
            <SecondaryButton
              icon={<Download className="h-4 w-4" />}
              onClick={() => doExport("pdf")}
            >
              {exporting === "pdf" ? "Exporting…" : "PDF"}
            </SecondaryButton>
          </div>
        ) : undefined
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2 w-full">
          <select
            aria-label="Institution type"
            className={selectCls}
            value={filters.institution_type ?? ""}
            onChange={(e) => set({ institution_type: e.target.value || undefined })}
          >
            <option value="">All institution types</option>
            {(d?.options.institution_types ?? []).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="Region"
            className={selectCls}
            value={filters.region ?? ""}
            onChange={(e) => set({ region: e.target.value || undefined })}
          >
            <option value="">All regions</option>
            {(d?.options.regions ?? []).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <label className="text-xs text-[#526174] dark:text-slate-400 inline-flex items-center gap-1">
            From
            <select
              aria-label="Period from"
              className={selectCls}
              value={filters.period_from ?? ""}
              onChange={(e) => set({ period_from: e.target.value || undefined })}
            >
              <option value="">Earliest</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[#526174] dark:text-slate-400 inline-flex items-center gap-1">
            To
            <select
              aria-label="Period to"
              className={selectCls}
              value={filters.period_to ?? ""}
              onChange={(e) => set({ period_to: e.target.value || undefined })}
            >
              <option value="">Latest</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p)}
                </option>
              ))}
            </select>
          </label>
          {Object.values(filters).some(Boolean) && (
            <button
              onClick={() => setFilters({})}
              className="text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          )}
          {!canExport && (
            <span className="ml-auto text-[11px] text-[#526174] dark:text-slate-400 inline-flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" /> Export is available to Business users
            </span>
          )}
        </div>
      }
    >
      {exportError && (
        <p className="mb-4 text-xs text-[#B4233F] dark:text-rose-300">{exportError}</p>
      )}
      {dash.error ? (
        <p className="text-sm text-[#B4233F] dark:text-rose-300">{errorMessage(dash.error)}</p>
      ) : !d ? (
        <p className="text-sm text-[#526174]">Loading inclusion metrics…</p>
      ) : (
        <>
          <IndicativeBanner d={d} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {d.metrics.map((m) => (
              <MetricTile key={m.key} m={m} />
            ))}
          </div>

          {available.length === 0 ? (
            <SectionCard>
              <p className="text-sm text-[#526174] dark:text-slate-400">
                No inclusion data has been submitted for this selection yet — every metric is
                awaiting data.
              </p>
            </SectionCard>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-[#526174] dark:text-slate-400">
                  Chart metric
                </span>
                <div className="flex flex-wrap gap-1" role="tablist">
                  {available.map((m) => (
                    <button
                      key={m.key}
                      role="tab"
                      aria-selected={chartMetric?.key === m.key}
                      onClick={() => setChartKey(m.key)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                        chartMetric?.key === m.key
                          ? "bg-[#168FA8] text-white border-[#168FA8]"
                          : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {chartMetric && <Charts d={d} metric={chartMetric} />}
            </>
          )}

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 mt-6">
            <SegmentTable
              title="By institution type"
              metrics={d.metrics}
              rows={d.by_institution_type.map((r) => ({
                key: r.institution_type,
                label: r.institution_type,
                sub: `${r.reporting} of ${r.institutions} reporting`,
                values: r.values,
              }))}
            />
            <SegmentTable
              title="By region"
              note={d.region_basis_note}
              metrics={d.metrics}
              rows={d.by_region.map((r) => ({
                key: r.region,
                label: r.region,
                sub: r.reporting
                  ? `${r.reporting} institution${r.reporting === 1 ? "" : "s"} · ${
                      r.region_basis === "registered"
                        ? "registered region"
                        : r.region_basis === "mixed"
                          ? "reported + registered"
                          : "reported in returns"
                    }`
                  : "No data",
                values: r.values,
              }))}
            />
          </div>

          {chartMetric && <Matrix d={d} metric={chartMetric} />}
          <Registry />
        </>
      )}
    </AppShell>
  );
}

function IndicativeBanner({ d }: { d: InclusionDashboard }) {
  return (
    <div className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-950 dark:text-amber-100 space-y-1">
      <div className="font-bold flex items-center gap-1.5">
        <Info className="h-4 w-4 text-amber-600" /> {d.indicative_label}
      </div>
      <p>{d.indicative_note}</p>
      <p className="text-amber-900/80 dark:text-amber-200/80">
        {d.coverage.institutions_reporting} of {d.coverage.institutions_registered} institutions
        reporting · {d.coverage.submissions} submission{d.coverage.submissions === 1 ? "" : "s"}
        {d.coverage.periods.length > 0 &&
          ` · ${periodLabel(d.coverage.periods[0])} – ${periodLabel(d.coverage.periods[d.coverage.periods.length - 1])}`}{" "}
        · last updated {fmtDate(d.coverage.last_updated)} · aggregated institution data only, no
        customer-level records.
      </p>
    </div>
  );
}

function MetricTile({ m }: { m: InclusionMetric }) {
  return (
    <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-[#DCE3E8] dark:border-slate-800 shadow-2xs flex flex-col gap-1.5">
      <div className="text-[13px] font-semibold text-[#526174] dark:text-slate-300">{m.label}</div>
      {m.available ? (
        <div className="text-2xl font-bold text-[#172033] dark:text-white tracking-tight">
          {formatMetric(m.value, m.unit, true)}
        </div>
      ) : (
        <div className="text-sm font-semibold text-[#7B8798]">{m.status}</div>
      )}
      <div className="text-[11px] text-[#526174] dark:text-slate-400">{m.description}</div>
      <div className="mt-auto pt-1 border-t border-[#DCE3E8] dark:border-slate-800 text-[10px] text-[#7B8798] space-y-0.5">
        <div>Source: {m.data_source}</div>
        <div>Last updated: {fmtDate(m.last_updated)}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SectionCard title={<span className="text-sm">{title}</span>}>
      <div className="h-56 text-[#168FA8] dark:text-[#2AA3BE]">{children}</div>
    </SectionCard>
  );
}

function Charts({ d, metric }: { d: InclusionDashboard; metric: InclusionMetric }) {
  const fmt = (v: unknown) => (typeof v === "number" ? formatMetric(v, metric.unit, true) : "");
  const tip = (v: unknown) => [
    typeof v === "number" ? formatMetric(v, metric.unit) : "n/a",
    metric.label,
  ];
  const byType = d.by_institution_type.map((r) => ({
    name: r.institution_type,
    value: r.values[metric.key],
  }));
  const byRegion = d.by_region.map((r) => ({
    name: r.region.replace(" Province", ""),
    value: r.values[metric.key],
  }));
  const trend = d.trend.map((t) => ({ name: t.label, value: t.values[metric.key] }));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <ChartCard title={`${metric.label} by institution type`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byType} margin={{ top: 18, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
            <YAxis hide />
            <Tooltip
              formatter={tip}
              cursor={{ fill: "rgba(123,135,152,0.12)" }}
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
            />
            <Bar dataKey="value" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={44}>
              <LabelList
                dataKey="value"
                position="top"
                formatter={fmt}
                style={{ fontSize: 10, fill: "#526174" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title={`${metric.label} by region`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byRegion} margin={{ top: 18, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
            <YAxis hide />
            <Tooltip
              formatter={tip}
              cursor={{ fill: "rgba(123,135,152,0.12)" }}
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
            />
            <Bar dataKey="value" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={44}>
              <LabelList
                dataKey="value"
                position="top"
                formatter={fmt}
                style={{ fontSize: 10, fill: "#526174" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title={`${metric.label} by reported period`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 12, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(123,135,152,0.2)" />
            <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={fmt}
            />
            <Tooltip formatter={tip} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="currentColor"
              strokeWidth={2}
              dot={{ r: 4, fill: "currentColor" }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

type SegmentRow = { key: string; label: string; sub: string; values: MetricValues };

function SegmentTable({
  title,
  note,
  metrics,
  rows,
}: {
  title: string;
  note?: string;
  metrics: InclusionMetric[];
  rows: SegmentRow[];
}) {
  return (
    <SectionCard title={<span className="text-sm">{title}</span>} noPad>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-[#526174] dark:text-slate-400">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Segment</th>
              {metrics.map((m) => (
                <th
                  key={m.key}
                  className="text-right px-3 py-2 font-semibold whitespace-nowrap"
                  title={m.description}
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCE3E8] dark:divide-slate-800">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-2">
                  <div className="font-semibold text-[#172033] dark:text-white whitespace-nowrap">
                    {r.label}
                  </div>
                  <div className="text-[10px] text-[#7B8798]">{r.sub}</div>
                </td>
                {metrics.map((m) => (
                  <td
                    key={m.key}
                    className="px-3 py-2 text-right font-mono whitespace-nowrap text-[#172033] dark:text-slate-200"
                  >
                    {m.available ? (
                      formatMetric(r.values[m.key], m.unit, true)
                    ) : (
                      <span className="text-[10px] font-sans text-[#7B8798]" title={m.data_source}>
                        Awaiting data
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && (
        <p className="px-4 py-2 text-[10px] text-[#7B8798] border-t border-[#DCE3E8] dark:border-slate-800">
          {note}
        </p>
      )}
    </SectionCard>
  );
}

function Matrix({ d, metric }: { d: InclusionDashboard; metric: InclusionMetric }) {
  const types = useMemo(() => [...new Set(d.matrix.map((r) => r.institution_type))], [d.matrix]);
  const regions = useMemo(() => [...new Set(d.matrix.map((r) => r.region))], [d.matrix]);
  if (!d.matrix.length) return null;
  const cell = (t: string, r: string) =>
    d.matrix.find((m) => m.institution_type === t && m.region === r);
  return (
    <div className="mt-6">
      <SectionCard
        title={<span className="text-sm">{metric.label}: institution type × region</span>}
        noPad
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-[#526174] dark:text-slate-400">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Institution type</th>
                {regions.map((r) => (
                  <th key={r} className="text-right px-3 py-2 font-semibold whitespace-nowrap">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE3E8] dark:divide-slate-800">
              {types.map((t) => (
                <tr key={t}>
                  <td className="px-4 py-2 font-semibold text-[#172033] dark:text-white whitespace-nowrap">
                    {t}
                  </td>
                  {regions.map((r) => {
                    const c = cell(t, r);
                    return (
                      <td
                        key={r}
                        className="px-3 py-2 text-right font-mono text-[#172033] dark:text-slate-200"
                        title={c ? `Last updated ${fmtDate(c.last_updated)}` : "No data"}
                      >
                        {c ? formatMetric(c.values[metric.key], metric.unit, true) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[10px] text-[#7B8798] border-t border-[#DCE3E8] dark:border-slate-800">
          Source: {metric.data_source}. "—" = no institution of that type reported in that region.
        </p>
      </SectionCard>
    </div>
  );
}

function Registry() {
  const registry = useInclusionRegistry();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6">
      <SectionCard
        title={
          <span className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#168FA8]" /> Metric definitions
          </span>
        }
        action={
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer"
          >
            {open ? "Hide" : "Show"}
          </button>
        }
        noPad
      >
        {open && (
          <div className="overflow-x-auto">
            {registry.error ? (
              <p className="p-4 text-xs text-[#B4233F]">{errorMessage(registry.error)}</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-[#526174] dark:text-slate-400">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Metric</th>
                    <th className="text-left px-3 py-2 font-semibold">Unit</th>
                    <th className="text-left px-3 py-2 font-semibold">Aggregation</th>
                    <th className="text-left px-3 py-2 font-semibold">
                      Submitted columns (priority order)
                    </th>
                    <th className="text-left px-3 py-2 font-semibold">Definition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3E8] dark:divide-slate-800">
                  {(registry.data?.metrics ?? []).map((m) => (
                    <tr key={m.key} className="align-top">
                      <td className="px-4 py-2 font-semibold text-[#172033] dark:text-white">
                        {m.label}
                      </td>
                      <td className="px-3 py-2">{m.unit}</td>
                      <td className="px-3 py-2">
                        {m.kind === "stock"
                          ? "Latest period per institution"
                          : m.kind === "flow"
                            ? "Sum over periods"
                            : "Ratio"}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">
                        {m.sources.length
                          ? m.sources
                              .map((s) => (s.column === "@rows" ? "transactions loaded" : s.column))
                              .join(" → ")
                          : `${m.numerator} ÷ ${m.denominator}`}
                      </td>
                      <td className="px-3 py-2 text-[#526174] dark:text-slate-400">
                        {m.description}
                        {m.awaiting && (
                          <span className="block text-[#9A5300] dark:text-amber-300">
                            {m.awaiting}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
