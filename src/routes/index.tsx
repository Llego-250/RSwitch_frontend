import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, PrimaryButton, SectionCard } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart, Bar,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
  Area, AreaChart
} from "recharts";
import { Plus, RefreshCw, Download, ArrowUpRight, Bell, Sparkles } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import {
  useDocumentRoster,
  useIntegrations,
  useIssues,
  useOverview,
  useParticipants,
  useSubmissionRoster,
  useSubmissions,
  useTemplates,
  useTrends,
} from "@/lib/queries";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

type AlertSev = "failed" | "warning" | "draft" | "completed";

const SEV_BORDER: Record<AlertSev, string> = {
  failed:    "#EF4444",
  warning:   "#F59E0B",
  draft:     "#64748B",
  completed: "#10B981",
};

const REPORTS = [
  { id: "compliance_status", name: "Compliance Document Status", type: "Compliance" },
  { id: "integration_status", name: "Integration Health Matrix", type: "Technical" },
  { id: "submission_history", name: "Submission History", type: "Business" },
  { id: "issues", name: "Issue Tracker Export", type: "Compliance" },
];

const MONTH_FMT = new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" });
const TIME_FMT = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function compact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/* ─── Component ─── */

function Dashboard() {
  const { role, roleLabel, scope } = useRole();
  const navigate = useNavigate();

  const [autoRefresh, setAutoRefresh]       = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [downloadError, setDownloadError]   = useState<string | null>(null);

  const overview = useOverview();
  const trends = useTrends(6);
  const integrations = useIntegrations();
  const issues = useIssues();
  const docRoster = useDocumentRoster();
  const subRoster = useSubmissionRoster();
  const submissions = useSubmissions();
  const templates = useTemplates();
  const participants = useParticipants();

  const refetchAll = () =>
    [overview, trends, integrations, issues, docRoster, subRoster, submissions].forEach((q) => q.refetch());

  // 5-minute auto-refresh while the toggle is on.
  useInterval(autoRefresh ? refetchAll : null, 5 * 60_000);

  const ov = overview.data;
  const ints = integrations.data ?? [];
  const failedInts = ints.filter((i) => i.status === "Disconnected");
  const degradedInts = ints.filter((i) => i.status === "Degraded");
  const openIssues = (issues.data ?? []).filter((i) => i.status === "Open" || i.status === "In Progress");
  const latestTrend = trends.data?.at(-1);
  const prevTrend = trends.data?.at(-2);
  const expiring = (docRoster.data ?? []).filter((d) => d.status === "Expiring Soon");
  const overdueSubs = (subRoster.data ?? []).filter((r) => {
    const p = participants.data?.find((x) => x.id === r.participant_id);
    const age = daysSince(r.last_uploaded_at);
    return p && (age === null || age > p.expected_frequency_days);
  });
  const failedSubsThisMonth = latestTrend ? latestTrend.submissions_total - latestTrend.submissions_passed : 0;

  const trendData = (trends.data ?? []).map((t) => ({
    d: MONTH_FMT.format(new Date(`${t.month}-01T00:00:00`)),
    v: t.submissions_total,
    volume: t.volume,
  }));
  const trendMax = Math.max(4, ...trendData.map((t) => t.v));

  // "Freshness": 100% on the day of a submission, falling to 0% at twice the
  // participant's expected reporting cadence.
  const freshnessData = (subRoster.data ?? []).map((r) => {
    const p = participants.data?.find((x) => x.id === r.participant_id);
    const age = daysSince(r.last_uploaded_at);
    const window = (p?.expected_frequency_days ?? 30) * 2;
    return { n: r.participant_code, v: age === null ? 0 : Math.max(0, Math.round(100 - (age / window) * 100)) };
  });

  const alertItems = useMemo(() => {
    const items: { id: string; sev: AlertSev; title: string; institution: string; to: string }[] = [];
    for (const i of ints) {
      if (i.status === "Disconnected" || i.status === "Degraded") {
        items.push({
          id: `int-${i.id}`,
          sev: i.status === "Disconnected" ? "failed" : "warning",
          title: `Integration ${i.status.toLowerCase()}${i.note ? `: ${i.note}` : ""}`,
          institution: i.participant_name,
          to: "/integrations",
        });
      }
    }
    for (const iss of openIssues) {
      if (iss.severity === "Critical" || iss.severity === "High") {
        items.push({
          id: `iss-${iss.id}`,
          sev: iss.severity === "Critical" ? "failed" : "warning",
          title: iss.description,
          institution: participantName(iss.participant_id),
          to: "/compliance",
        });
      }
    }
    for (const d of docRoster.data ?? []) {
      if (d.status === "Expired" || d.status === "Expiring Soon") {
        items.push({
          id: `doc-${d.participant_id}-${d.doc_type}`,
          sev: d.status === "Expired" ? "failed" : "warning",
          title: `${d.doc_type} ${d.status === "Expired" ? "expired" : "expiring"}${d.expiry_date ? ` (${d.expiry_date})` : ""}`,
          institution: d.participant_name,
          to: "/compliance",
        });
      }
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrations.data, issues.data, docRoster.data, participants.data]);

  function participantName(id: number) {
    return participants.data?.find((p) => p.id === id)?.name ?? `Participant #${id}`;
  }

  const visibleAlerts = alertItems.filter((a) => !dismissedAlerts.has(a.id));

  const activityLog = (submissions.data ?? []).slice(0, 8).map((s) => ({
    t: TIME_FMT.format(new Date(s.uploaded_at)),
    a: `${s.period} submission ${s.result.toLowerCase()} · ${participantName(s.participant_id)}`,
    u: s.uploaded_by || "system",
  }));

  const loadError = [overview, trends, integrations, issues, docRoster, subRoster].find((q) => q.error)?.error;

  function dismiss(id: string) {
    setDismissedAlerts((prev) => new Set([...prev, id]));
  }

  async function download(report: string, format: "pdf" | "xlsx") {
    setDownloadError(null);
    try {
      await api.download(`/reports/export?report=${report}&format=${format}`, `${report}.${format}`);
    } catch (e) {
      setDownloadError(errorMessage(e));
    }
  }

  return (
    <AppShell
      title="Dashboard"
      subtitle="Overview & System Status"
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
      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Couldn't load live data: {errorMessage(loadError)}
        </div>
      )}
      {/* ROW 1 — Dynamic Role-Aware KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {role === "compliance" ? (
          <>
            <KpiCard
              label="Overdue submissions"
              value={String(overdueSubs.length)}
              context={overdueSubs.map((r) => r.participant_code).join(", ") || "All on schedule"}
              source="submissions"
              freshness="live"
            />
            <KpiCard
              label="Documents needing attention"
              value={String(ov?.documents_needing_attention ?? "–")}
              context={expiring.length ? `${expiring.length} expiring soon` : undefined}
              source="documents"
              freshness="live"
            />
            <KpiCard
              label="Open issues"
              value={String(ov?.open_issues_total ?? "–")}
              context={ov ? `${ov.open_issues_by_severity.Critical} Critical, ${ov.open_issues_by_severity.High} High` : undefined}
              source="issues"
              freshness="live"
            />
            <KpiCard
              label="On-time rate (this month)"
              value={latestTrend?.on_time_rate != null ? `${(latestTrend.on_time_rate * 100).toFixed(1)}%` : "–"}
              delta={
                latestTrend?.on_time_rate != null && prevTrend?.on_time_rate != null
                  ? {
                      dir: latestTrend.on_time_rate >= prevTrend.on_time_rate ? "up" : "down",
                      text: `${((latestTrend.on_time_rate - prevTrend.on_time_rate) * 100).toFixed(1)}pp`,
                      tone: latestTrend.on_time_rate >= prevTrend.on_time_rate ? "good" : "bad",
                    }
                  : undefined
              }
              source="reports/trends"
              freshness="live"
            />
          </>
        ) : role === "business" ? (
          <>
            <KpiCard
              label="Integration health"
              value={ov ? `${ov.participants_connected} / ${ov.participants_total}` : "–"}
              context={ov ? `${ov.participants_degraded_or_worse} degraded or worse` : undefined}
              source="integrations"
              freshness="live"
            />
            <KpiCard
              label="Participants"
              value={String(ov?.participants_total ?? "–")}
              context={latestTrend ? `+${latestTrend.new_participants} this month` : undefined}
              source="participants"
              freshness="live"
            />
            <KpiCard
              label="Reported volume (this month)"
              value={latestTrend ? compact(latestTrend.volume) : "–"}
              delta={
                latestTrend && prevTrend && prevTrend.volume > 0
                  ? {
                      dir: latestTrend.volume >= prevTrend.volume ? "up" : "down",
                      text: `${(((latestTrend.volume - prevTrend.volume) / prevTrend.volume) * 100).toFixed(1)}%`,
                      tone: latestTrend.volume >= prevTrend.volume ? "good" : "bad",
                    }
                  : undefined
              }
              source="reports/trends"
              freshness="live"
            />
            <KpiCard
              label="Open issues"
              value={String(ov?.open_issues_total ?? "–")}
              context={ov ? `${ov.open_issues_by_severity.Critical} Critical` : undefined}
              source="issues"
              freshness="live"
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Connected integrations"
              value={ov ? `${ov.participants_connected} / ${ov.participants_total}` : "–"}
              context={degradedInts.length ? `● ${degradedInts.length} degraded` : undefined}
              source="integrations"
              freshness="live"
            />
            <KpiCard
              label="Disconnected integrations"
              value={String(failedInts.length)}
              context={failedInts.map((i) => i.participant_code).join(", ") || undefined}
              source="integrations"
              freshness="live"
            />
            <KpiCard
              label="Failed submissions (this month)"
              value={latestTrend ? String(failedSubsThisMonth) : "–"}
              context={latestTrend ? `of ${latestTrend.submissions_total} received` : undefined}
              source="submissions"
              freshness="live"
            />
            <KpiCard
              label="Ingestion templates"
              value={String(templates.data?.length ?? "–")}
              context="Per-participant schemas"
              source="templates"
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
                <span>Submissions Received per Month (6 months)</span>
              </div>
            }
            action={
              <span className="text-xs font-sans text-[#7B8798] dark:text-slate-400 font-medium">
                Source: /reports/trends
              </span>
            }
          >
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData} margin={{ top: 15, right: 15, left: -15, bottom: 20 }}>
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
                  domain={[0, trendMax]}
                  allowDecimals={false}
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
                RDIP Ingestion Monitor · {ov?.participants_total ?? "–"} Participants
              </span>
              <span className="text-[#168FA8] dark:text-sky-400 font-semibold">
                This month's volume: {latestTrend ? compact(latestTrend.volume) : "–"}
              </span>
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
                  {alertItems.length ? "All attention items dismissed for current session." : "Nothing needs attention right now."}
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
        <SectionCard title="Data Freshness by Participant (vs. expected cadence)">
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
              <Bar dataKey="v" fill="#168FA8" radius={[8, 8, 0, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Right: Recent Activity Log */}
        <SectionCard title="Recent Submission Activity">
          <div className="flex flex-col gap-0 divide-y divide-slate-100 dark:divide-slate-800/80">
            {activityLog.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">No submissions yet.</div>
            )}
            {activityLog.map((entry, i) => (
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
        <SectionCard title="System Reports" noPad>
          {downloadError && <div className="px-5 py-2 text-xs font-medium text-red-600">{downloadError}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200/80 dark:border-slate-700">
                <tr>
                  {["Report Name", "Module Type", "Status", "Actions"].map((col) => (
                    <th key={col} className="text-left px-5 py-3 text.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {REPORTS.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{r.name}</div>
                      <div className="font-mono text-[10px] text-slate-400 font-semibold">{r.id}</div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">{r.type}</td>
                    <td className="px-5 py-3.5"><StatusBadge status="completed" /></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => download(r.id, "pdf")}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#168FA8] hover:text-[#0F6F83] hover:underline cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </button>
                        <button
                          onClick={() => download(r.id, "xlsx")}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#168FA8] hover:text-[#0F6F83] hover:underline cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Excel
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

function useInterval(fn: (() => void) | null, ms: number) {
  const saved = useRef(fn);
  saved.current = fn;
  const active = fn !== null;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => saved.current?.(), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
