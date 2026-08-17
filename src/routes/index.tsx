import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, PrimaryButton, FilterChip, SectionCard } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Plus, RefreshCw, Download, X, Building2, AlertCircle, Calendar, ShieldCheck, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

/* ─── Static Data ─── */

const riskTrendData = [
  { d: "Week 1",  v: 22 },
  { d: "Week 2",  v: 28 },
  { d: "Week 3",  v: 35 },
  { d: "Week 4",  v: 31 },
  { d: "Week 5",  v: 42 },
  { d: "Week 6",  v: 38 },
  { d: "Week 7",  v: 47 },
];

const freshnessData = [
  { n: "Bank of Kigali",   v: 98 },
  { n: "MTN Mobile Money", v: 94 },
  { n: "Equity Bank",      v: 87 },
  { n: "Inkomoko MFI",     v: 72 },
  { n: "Zigama SACCO",     v: 65 },
];

type AlertSev = "failed" | "warning" | "draft" | "completed";

const ALERT_ITEMS: {
  id: string;
  sev: AlertSev;
  title: string;
  institution: string;
  to: string;
}[] = [
  { id: "a1", sev: "failed",  title: "ERP ingestion pipeline timeout", institution: "Inkomoko MFI", to: "/pipelines" },
  { id: "a2", sev: "warning", title: "AI Deviation: Mobile Money error spike (+4.2%)", institution: "MTN Mobile Money", to: "/ai" },
  { id: "a3", sev: "warning", title: "BNR Directive 07/2024 compliance deadline in 14d", institution: "Zigama SACCO", to: "/compliance" },
  { id: "a4", sev: "draft",   title: "ISO 20022 field mapping v3.1 ready to publish", institution: "Bank of Kigali", to: "/mapping" },
];

const SEV_BORDER: Record<AlertSev, string> = {
  failed:    "#E11D48",
  warning:   "#D97706",
  draft:     "#64748B",
  completed: "#10B981",
};

const ACTIVITY_LOG = [
  { t: "12:04", a: "Core Banking pipeline completed", u: "system" },
  { t: "11:58", a: "AI anomaly alert acknowledged", u: "Compliance User" },
  { t: "11:30", a: "Mapping ISO 20022 v3.1 published", u: "Technical Lead" },
  { t: "10:15", a: "Governance meeting record created", u: "Board Admin" },
  { t: "09:30", a: "Financial Inclusion report generated", u: "Business User" },
];

const RECENT_REPORTS = [
  { id: "RPT-001", name: "Q2 2025 Compliance Summary", type: "Compliance", gen: "Jul 10 09:14", status: "completed" as const },
  { id: "RPT-002", name: "Integration Health Matrix", type: "Technical", gen: "Jul 09 14:32", status: "completed" as const },
  { id: "RPT-003", name: "Participant Performance Ranking", type: "Business", gen: "Jul 08 11:00", status: "completed" as const },
];

const INSTITUTION_TYPES = ["All Types", "Commercial Bank", "E-money Issuer", "MFI", "SACCO"];
const REGIONS = ["All Regions", "Kigali", "Eastern Province", "Northern Province", "Southern Province", "Western Province"];

/* ─── Component ─── */

function Dashboard() {
  const { role, roleLabel, scope } = useRole();
  const navigate = useNavigate();

  const [selectedPeriod, setSelectedPeriod] = useState("Q2 2025");
  const [instType, setInstType]             = useState("All Types");
  const [selectedRegion, setSelectedRegion] = useState("All Regions");
  const [autoRefresh, setAutoRefresh]       = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const visibleAlerts = useMemo(
    () => ALERT_ITEMS.filter((a) => !dismissedAlerts.has(a.id)),
    [dismissedAlerts],
  );

  function dismiss(id: string) {
    setDismissedAlerts((prev) => new Set([...prev, id]));
  }

  return (
    <AppShell
      title={`${roleLabel} Operational Dashboard`}
      breadcrumb="RDIP › DASHBOARD"
      scope={scope}
      primaryAction={
        <PrimaryButton
          icon={<Plus className="h-4 w-4" />}
          onClick={() => navigate({ to: "/reports" })}
        >
          Generate Report
        </PrimaryButton>
      }
      toolbar={
        <>
          <FilterChip
            label="Period"
            value={selectedPeriod}
            onClick={() => setSelectedPeriod((p) => (p === "Q2 2025" ? "Q1 2025" : "Q2 2025"))}
          />
          <FilterChip
            label="Type"
            value={instType}
            onClick={() => {
              const idx = INSTITUTION_TYPES.indexOf(instType);
              setInstType(INSTITUTION_TYPES[(idx + 1) % INSTITUTION_TYPES.length]);
            }}
          />
          <FilterChip
            label="Region"
            value={selectedRegion}
            onClick={() => {
              const idx = REGIONS.indexOf(selectedRegion);
              setSelectedRegion(REGIONS[(idx + 1) % REGIONS.length]);
            }}
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`p-1.5 rounded-lg border transition-colors flex items-center gap-1 text-xs font-mono cursor-pointer ${
                autoRefresh
                  ? "bg-emerald-50 text-emerald-600 border-emerald-300 dark:bg-emerald-950/50 dark:border-emerald-700"
                  : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700"
              }`}
              aria-label={autoRefresh ? "Pause 5m auto-refresh" : "Enable 5m auto-refresh"}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? "animate-spin" : ""}`} />
              <span>{autoRefresh ? "5m Refresh Active" : "Auto-Refresh Off"}</span>
            </button>
          </div>
        </>
      }
    >
      {/* ROW 1 — Dynamic Role-Aware KPI Widgets (§15) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {role === "compliance" ? (
          <>
            <KpiCard
              label="Overdue Submissions"
              value="2"
              delta={{ dir: "up", text: "+1", tone: "bad" }}
              source="compliance-reg"
              freshness="live"
              updated="12:00"
            />
            <KpiCard
              label="Upcoming Deadlines (30d)"
              value="5"
              context="Next: Jul 15"
              source="calendar"
              freshness="live"
            />
            <KpiCard
              label="Open Incidents"
              value="3"
              context="1 Critical, 2 Medium"
              source="incidents-db"
              freshness="live"
            />
            <KpiCard
              label="Compliance Rate (30d)"
              value="94.2%"
              delta={{ dir: "up", text: "+1.5pp", tone: "good" }}
              source="audit-engine"
              freshness="live"
            />
          </>
        ) : role === "business" ? (
          <>
            <KpiCard
              label="Integration Health"
              value="7 / 8"
              context="1 Failed (Inkomoko)"
              source="integrations"
              freshness="live"
            />
            <KpiCard
              label="Unacknowledged AI Alerts"
              value="2"
              delta={{ dir: "up", text: "+1", tone: "bad" }}
              source="ai-engine"
              freshness="live"
            />
            <KpiCard
              label="Active Inclusion Accounts"
              value="4.2M"
              delta={{ dir: "up", text: "+8.4%", tone: "good" }}
              source="inclusion-agg"
              freshness="live"
            />
            <KpiCard
              label="Avg Composite Risk Score"
              value="34.8"
              context="Low-Medium Risk"
              source="p360-score"
              freshness="live"
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Active Pipelines"
              value="6 / 7"
              context="1 Failed today"
              source="pipeline-mon"
              freshness="live"
            />
            <KpiCard
              label="Failed Integrations"
              value="1"
              delta={{ dir: "up", text: "+1", tone: "bad" }}
              source="catalog"
              freshness="live"
            />
            <KpiCard
              label="System Uptime (30d)"
              value="99.82%"
              delta={{ dir: "up", text: "+0.02pp", tone: "good" }}
              source="uptime-mon"
              freshness="live"
            />
            <KpiCard
              label="Pending Mappings"
              value="2"
              context="Draft v1.0"
              source="standards-map"
              freshness="live"
            />
          </>
        )}
      </div>

      {/* ROW 2 — Operational Trend + Attention Queue */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left col-span-2: Participant Risk & Ingestion Trend */}
        <div className="lg:col-span-2">
          <SectionCard title="Participant Operational & Ingestion Trend — 60 days">
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={riskTrendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="d"
                  tick={{ fontSize: 11, fontFamily: "monospace", fill: "var(--neutral-400)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 60]}
                  tick={{ fontSize: 11, fontFamily: "monospace", fill: "var(--neutral-400)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    color: "var(--neutral-700)",
                  }}
                  cursor={{ stroke: "var(--neutral-200)", strokeWidth: 1 }}
                />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="#56B4D3"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "#56B4D3", stroke: "#fff", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-2 font-mono text-[11px] text-slate-400 flex items-center justify-between">
              <span>RDIP Ingestion Monitor · 8 Participants Active</span>
              <span className="text-[#56B4D3]">Filtered by: {instType} ({selectedRegion})</span>
            </div>
          </SectionCard>
        </div>

        {/* Right col-span-1: Attention Queue (REQ-DASH-003, REQ-DASH-007) */}
        <div className="lg:col-span-1">
          <SectionCard
            title="Attention Queue"
            action={
              <span className="text-[11px] font-mono text-slate-400">
                {visibleAlerts.length} Active
              </span>
            }
          >
            <div className="flex flex-col gap-2">
              {visibleAlerts.length === 0 && (
                <p className="text-sm py-6 text-center text-slate-400">
                  All attention items dismissed for current session.
                </p>
              )}
              {visibleAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-2.5 rounded-xl p-3 transition-all border border-slate-200/80 dark:border-slate-700/60 bg-white/70 dark:bg-slate-800/60 shadow-xs"
                  style={{
                    borderLeftWidth: "4px",
                    borderLeftColor: SEV_BORDER[alert.sev],
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <StatusBadge status={alert.sev} />
                      <span className="text-[10px] font-mono text-slate-400 truncate">{alert.institution}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                      {alert.title}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <Link
                        to={alert.to}
                        className="text-[11px] font-mono text-[#56B4D3] font-semibold hover:underline"
                      >
                        Investigate →
                      </Link>
                      <button
                        onClick={() => dismiss(alert.id)}
                        className="text-[11px] font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ROW 3 — Data Freshness + Recent Activity */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Data Freshness by Participant */}
        <SectionCard title="Data Ingestion Freshness by Institution">
          <ResponsiveContainer width="100%" height={208}>
            <BarChart data={freshnessData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="n"
                tick={{ fontSize: 11, fontFamily: "monospace", fill: "var(--neutral-400)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fontFamily: "monospace", fill: "var(--neutral-400)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  color: "var(--neutral-700)",
                }}
                cursor={{ fill: "rgba(0,0,0,0.03)" }}
                formatter={(v: number) => [`${v}%`, "Freshness Score"]}
              />
              <Bar dataKey="v" fill="#56B4D3" radius={[4, 4, 0, 0]} barSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Right: Recent Activity Log */}
        <SectionCard title="Recent Audit Activity Log (Last 10 Events)">
          <div className="flex flex-col gap-0 divide-y divide-slate-100 dark:divide-slate-800">
            {ACTIVITY_LOG.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 text-xs">
                <span className="font-mono text-slate-400 tabular-nums w-12 shrink-0">{entry.t}</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 flex-1 truncate">{entry.a}</span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                  {entry.u}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ROW 4 — Recent Generated Reports */}
      <div className="mt-4">
        <SectionCard title="Generated System Reports" noPad>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100/60 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {["Report Name", "Module Type", "Generated Date", "Status", "Actions"].map((col) => (
                    <th key={col} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {RECENT_REPORTS.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">{r.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{r.id}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{r.type}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.gen}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => alert(`Simulated download for ${r.name}`)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#56B4D3] hover:underline cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download PDF
                        </button>
                        <Link to="/reports" className="text-xs text-slate-400 hover:text-slate-700">
                          View Details
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
