import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, PrimaryButton, FilterChip, SectionCard } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
  Area, AreaChart
} from "recharts";
import { Plus, RefreshCw, Download, ShieldCheck, ArrowUpRight, Bell, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

/* ─── Static Data ─── */

const riskTrendData = [
  { d: "Week 1",  v: 22, volume: 140 },
  { d: "Week 2",  v: 28, volume: 185 },
  { d: "Week 3",  v: 35, volume: 210 },
  { d: "Week 4",  v: 31, volume: 195 },
  { d: "Week 5",  v: 42, volume: 260 },
  { d: "Week 6",  v: 38, volume: 240 },
  { d: "Week 7",  v: 47, volume: 290 },
];

const freshnessData = [
  { n: "Bank of Kigali",   v: 98, status: "healthy" as const },
  { n: "MTN Mobile Money", v: 94, status: "healthy" as const },
  { n: "Equity Bank",      v: 87, status: "healthy" as const },
  { n: "Inkomoko MFI",     v: 72, status: "warning" as const },
  { n: "Zigama SACCO",     v: 65, status: "failed" as const },
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
  failed:    "#EF4444",
  warning:   "#F59E0B",
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
      title="Operations Dashboard"
      subtitle="Integration, ingestion & participant monitoring"
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
              className={`px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-sans font-medium cursor-pointer shadow-2xs ${
                autoRefresh
                  ? "bg-[#E8F7F1] text-[#16A979] border-[#16A979]/30 font-semibold"
                  : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
              }`}
              aria-label={autoRefresh ? "Pause 5m auto-refresh" : "Enable 5m auto-refresh"}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? "animate-spin text-[#16A979]" : ""}`} />
              <span>{autoRefresh ? "5m Refresh Active" : "Auto-Refresh Off"}</span>
            </button>
          </div>
        </>
      }
    >
      {/* ROW 1 — Dynamic Role-Aware KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {role === "compliance" ? (
          <>
            <KpiCard
              label="Overdue submissions"
              value="2"
              delta={{ dir: "up", text: "+1", tone: "bad" }}
              source="compliance-reg"
              freshness="live"
              updated="12:00"
            />
            <KpiCard
              label="Upcoming deadlines (30d)"
              value="5"
              context="Next: Jul 15"
              source="calendar"
              freshness="live"
            />
            <KpiCard
              label="Open incidents"
              value="3"
              context="1 Critical, 2 Medium"
              source="incidents-db"
              freshness="live"
            />
            <KpiCard
              label="Compliance rate (30d)"
              value="94.2%"
              delta={{ dir: "up", text: "+1.5pp", tone: "good" }}
              source="audit-engine"
              freshness="live"
            />
          </>
        ) : role === "business" ? (
          <>
            <KpiCard
              label="Integration health"
              value="7 / 8"
              context="1 Failed (Inkomoko)"
              source="integrations"
              freshness="live"
            />
            <KpiCard
              label="Unacknowledged AI alerts"
              value="2"
              delta={{ dir: "up", text: "+1", tone: "bad" }}
              source="ai-engine"
              freshness="live"
            />
            <KpiCard
              label="Active inclusion accounts"
              value="4.2M"
              delta={{ dir: "up", text: "+8.4%", tone: "good" }}
              source="inclusion-agg"
              freshness="live"
            />
            <KpiCard
              label="Avg composite risk score"
              value="34.8"
              context="Low-Medium Risk"
              source="p360-score"
              freshness="live"
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Active pipelines"
              value="6 / 7"
              context="● 1 failed today"
              source="pipeline-mon"
              freshness="live"
            />
            <KpiCard
              label="Failed integrations"
              value="1"
              delta={{ dir: "up", text: "+1", tone: "bad" }}
              source="catalog"
              freshness="live"
            />
            <KpiCard
              label="System uptime (30d)"
              value="99.82%"
              delta={{ dir: "up", text: "+0.02pp", tone: "good" }}
              source="uptime-mon"
              freshness="live"
            />
            <KpiCard
              label="Pending mappings"
              value="2"
              context="Draft v1.0"
              source="standards-map"
              freshness="live"
            />
          </>
        )}
      </div>

      {/* ROW 2 — Operational Trend + Attention Queue */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left col-span-2: Participant Risk & Ingestion Trend */}
        <div className="lg:col-span-2">
          <SectionCard
            title={
              <div className="flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-[#168FA8]" />
                <span>Participant Operational & Ingestion Trend (60 days)</span>
              </div>
            }
            action={
              <span className="text-xs font-sans text-[#7B8798] dark:text-slate-400 font-medium">
                Filtered: {instType} ({selectedRegion})
              </span>
            }
          >
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={riskTrendData} margin={{ top: 15, right: 15, left: -15, bottom: 20 }}>
                <defs>
                  <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#168FA8" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#E7F5F8" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="d"
                  tick={{ fontSize: 11, fontFamily: "Inter, sans-serif", fill: "#7B8798", fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 60]}
                  tick={{ fontSize: 11, fontFamily: "Inter, sans-serif", fill: "#7B8798", fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#172033",
                    borderColor: "#0F6F83",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontFamily: "Inter, sans-serif",
                    color: "#FFFFFF",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
                  }}
                  cursor={{ stroke: "#168FA8", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#168FA8"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorArea)"
                  activeDot={{ r: 6, fill: "#168FA8", stroke: "#FFFFFF", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-3 font-sans text-xs text-[#526174] dark:text-slate-300 flex items-center justify-between pt-3 border-t border-[#DCE3E8] dark:border-slate-800">
              <span className="flex items-center gap-2 font-medium">
                <span className="h-2 w-2 rounded-full bg-[#16A979] animate-pulse" />
                RDIP Ingestion Monitor · 8 Participants Active
              </span>
              <span className="text-[#168FA8] dark:text-sky-400 font-semibold">Volume Average: 217k tx/day</span>
            </div>
          </SectionCard>
        </div>

        {/* Right col-span-1: Attention Queue */}
        <div className="lg:col-span-1">
          <SectionCard
            title={
              <div className="flex items-center gap-2">
                <Bell className="h-4.5 w-4.5 text-[#D97706]" />
                <span>Attention Queue</span>
              </div>
            }
            action={
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#FFF3DF] text-[#D97706] border border-[#D97706]/30">
                {visibleAlerts.length} Active
              </span>
            }
          >
            <div className="flex flex-col gap-3">
              {visibleAlerts.length === 0 && (
                <div className="text-sm py-10 text-center text-[#7B8798] font-medium">
                  All attention items dismissed for current session.
                </div>
              )}
              {visibleAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-xl p-3.5 transition-all border border-[#DCE3E8] dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <StatusBadge status={alert.sev} />
                      <span className="text-xs font-semibold text-[#172033] dark:text-slate-100 font-sans truncate">{alert.institution}</span>
                    </div>
                    <p className="text-xs font-semibold text-[#172033] dark:text-slate-100 leading-snug">
                      {alert.title}
                    </p>
                    <div className="flex items-center gap-4 mt-2.5 pt-2 border-t border-[#DCE3E8] dark:border-slate-800">
                      <Link
                        to={alert.to}
                        className="text-xs font-semibold text-[#168FA8] hover:text-[#0F6F83] hover:underline inline-flex items-center gap-1"
                      >
                        Investigate <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => dismiss(alert.id)}
                        className="text-xs text-[#7B8798] hover:text-[#172033] dark:hover:text-slate-100 transition-colors cursor-pointer font-medium"
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
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Data Freshness by Participant */}
        <SectionCard title="Data Ingestion Freshness by Institution">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={freshnessData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="n"
                tick={{ fontSize: 11, fontFamily: "monospace", fill: "#718596" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fontFamily: "monospace", fill: "#718596" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  borderColor: "rgba(51, 65, 85, 0.8)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  color: "#F8FAFC",
                }}
                cursor={{ fill: "rgba(86, 180, 211, 0.08)" }}
                formatter={(v: number) => [`${v}%`, "Freshness Score"]}
              />
              <Bar dataKey="v" fill="#56B4D3" radius={[8, 8, 0, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Right: Recent Activity Log */}
        <SectionCard title="Recent Audit Activity Log (Last 10 Events)">
          <div className="flex flex-col gap-0 divide-y divide-slate-100 dark:divide-slate-800/80">
            {ACTIVITY_LOG.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 text-xs hover:bg-slate-50/60 dark:hover:bg-slate-800/40 px-2 rounded-xl transition-colors">
                <span className="font-mono text-slate-400 font-bold tabular-nums w-12 shrink-0">{entry.t}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex-1 truncate">{entry.a}</span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0 border border-slate-200 dark:border-slate-700">
                  {entry.u}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ROW 4 — Recent Generated Reports */}
      <div className="mt-5">
        <SectionCard title="Generated System Reports" noPad>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200/80 dark:border-slate-700">
                <tr>
                  {["Report Name", "Module Type", "Generated Date", "Status", "Actions"].map((col) => (
                    <th key={col} className="text-left px-5 py-3 text.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {RECENT_REPORTS.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{r.name}</div>
                      <div className="font-mono text-[10px] text-slate-400 font-semibold">{r.id}</div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">{r.type}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{r.gen}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={r.status} /></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => alert(`Simulated download for ${r.name}`)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#56B4D3] hover:text-[#267A99] hover:underline cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download PDF
                        </button>
                        <Link to="/reports" className="text-xs font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                          Details →
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
