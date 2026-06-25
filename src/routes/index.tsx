import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { AppShell, PrimaryButton, FilterChip, SectionCard } from "@/components/AppShell"
import { KpiCard } from "@/components/KpiCard"
import { StatusBadge } from "@/components/StatusBadge"
import { useRole } from "@/context/RoleContext"
import { useState, useMemo } from "react"
import {
  BarChart, Bar, LineChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Plus, RefreshCw, Download, X } from "lucide-react"

export const Route = createFileRoute("/")({
  component: Dashboard,
})

/* ─── Static data ─── */

const riskData = [
  { d: "Day 1",  v: 22 },
  { d: "Day 15", v: 28 },
  { d: "Day 30", v: 35 },
  { d: "Day 45", v: 31 },
  { d: "Day 60", v: 42 },
  { d: "Day 75", v: 38 },
  { d: "Day 90", v: 47 },
]

const freshnessData = [
  { n: "Core Banking",  v: 98 },
  { n: "Mobile Money",  v: 94 },
  { n: "Credit Bureau", v: 87 },
  { n: "ERP",           v: 72 },
  { n: "Payment GW",    v: 65 },
]

type AlertSev = "failed" | "warning" | "draft" | "completed"

const ALERT_ITEMS: {
  id: string
  sev: AlertSev
  title: string
  to: string
}[] = [
  { id: "a1", sev: "failed",  title: "ERP nightly pipeline failed",   to: "/pipelines" },
  { id: "a2", sev: "warning", title: "3 high-severity fraud alerts",   to: "/fraud" },
  { id: "a3", sev: "draft",   title: "Mapping v4 ready to publish",    to: "/mapping" },
  { id: "a4", sev: "warning", title: "FSA-22 report due in 2 days",   to: "/reports" },
]

const SEV_BORDER: Record<AlertSev, string> = {
  failed:    "var(--fail)",
  warning:   "var(--warn)",
  draft:     "var(--neutral-400)",
  completed: "var(--ok)",
}

const ACTIVITY_LOG = [
  { t: "12:04", a: "Pipeline completed",  u: "system" },
  { t: "11:58", a: "Fraud alert raised",  u: "fraud-ml" },
  { t: "11:30", a: "Mapping v4 saved",    u: "architect" },
  { t: "10:15", a: "User login",          u: "admin" },
  { t: "09:30", a: "Report generated",    u: "analyst" },
]

const REPORTS = [
  { id: "R1", name: "Q2 Portfolio Risk",      type: "Risk",        gen: "Jun 25 09:14", status: "completed" as const },
  { id: "R2", name: "FSA Quarterly Return",   type: "Compliance",  gen: "Jun 24 14:32", status: "completed" as const },
  { id: "R3", name: "Fraud Monthly Report",   type: "Operations",  gen: "Jun 23 11:00", status: "completed" as const },
]

/* ─── Component ─── */

function Dashboard() {
  const { roleLabel, scope } = useRole()
  const navigate = useNavigate()

  const [selectedPeriod, setSelectedPeriod] = useState("Q2 2025")
  const [autoRefresh, setAutoRefresh]       = useState(false)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())

  const visibleAlerts = useMemo(
    () => ALERT_ITEMS.filter((a) => !dismissedAlerts.has(a.id)),
    [dismissedAlerts],
  )

  function dismiss(id: string) {
    setDismissedAlerts((prev) => new Set([...prev, id]))
  }

  return (
    <AppShell
      title={`${roleLabel} Dashboard`}
      breadcrumb="HOME"
      scope={scope}
      primaryAction={
        <PrimaryButton
          icon={<Plus className="h-4 w-4" />}
          onClick={() => alert("Create report form would open")}
        >
          New Report
        </PrimaryButton>
      }
      toolbar={
        <>
          <FilterChip
            label="Period"
            value={selectedPeriod}
            onClick={() =>
              setSelectedPeriod((p) => (p === "Q2 2025" ? "Q1 2025" : "Q2 2025"))
            }
          />
          <FilterChip
            label="Scope"
            value="All Institutions"
            onClick={() => alert("Scope filter")}
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              style={{ color: autoRefresh ? "var(--ok)" : "var(--neutral-400)" }}
              aria-label={autoRefresh ? "Pause auto-refresh" : "Start auto-refresh"}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--neutral-400)" }}
            >
              {autoRefresh ? "Live" : "Paused"}
            </span>
          </div>
        </>
      }
    >
      {/* ROW 1 — KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Portfolio at Risk"
          value="4.82%"
          delta={{ dir: "up", text: "+0.3pp", tone: "bad" }}
          source="core-banking"
          freshness="live"
        />
        <KpiCard
          label="Active Integrations"
          value="11/12"
          delta={{ dir: "down", text: "-1", tone: "bad" }}
          source="orchestrator"
          freshness="live"
        />
        <KpiCard
          label="Open Fraud Alerts"
          value="3"
          delta={{ dir: "up", text: "+1", tone: "bad" }}
          source="fraud-ml"
          freshness="live"
        />
        <KpiCard
          label="Compliance Items"
          value="2"
          context="2 reports due"
          source="regulatory"
          freshness="stale"
        />
      </div>

      {/* ROW 2 — Risk trend + Attention queue */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left col-span-2: Risk Trend */}
        <div className="lg:col-span-2">
          <SectionCard title="Risk Trend — 90 days">
            <ResponsiveContainer width="100%" height={192}>
              <LineChart data={riskData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
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
                  stroke="#2D6A9F"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#2D6A9F", stroke: "#fff", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div
              className="mt-2 font-mono text-[11px]"
              style={{ color: "var(--neutral-400)" }}
            >
              core-banking · v2.3 model
            </div>
          </SectionCard>
        </div>

        {/* Right col-span-1: Attention Queue */}
        <div className="lg:col-span-1">
          <SectionCard
            title="Attention Queue"
            action={
              <Link
                to="/fraud"
                className="text-xs"
                style={{ color: "var(--primary-500)" }}
              >
                View all
              </Link>
            }
          >
            <div className="flex flex-col gap-1.5">
              {visibleAlerts.length === 0 && (
                <p
                  className="text-sm py-4 text-center"
                  style={{ color: "var(--neutral-400)" }}
                >
                  All items dismissed
                </p>
              )}
              {visibleAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center gap-2 rounded-md px-3 py-2"
                  style={{
                    borderLeft: `3px solid ${SEV_BORDER[alert.sev]}`,
                    backgroundColor: "var(--neutral-50)",
                  }}
                >
                  <div className="shrink-0">
                    <StatusBadge status={alert.sev} />
                  </div>
                  <span
                    className="flex-1 text-[13px] font-medium truncate"
                    style={{ color: "var(--neutral-900)" }}
                  >
                    {alert.title}
                  </span>
                  <Link
                    to={alert.to}
                    className="shrink-0 text-[12px] font-mono"
                    style={{ color: "var(--primary-500)" }}
                  >
                    View →
                  </Link>
                  <button
                    onClick={() => dismiss(alert.id)}
                    aria-label={`Dismiss alert: ${alert.title}`}
                    className="shrink-0 rounded transition-colors"
                    style={{ color: "var(--neutral-400)" }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = "var(--neutral-700)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = "var(--neutral-400)")
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ROW 3 — Data freshness + Recent Activity */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Data freshness bar chart */}
        <SectionCard title="Data Freshness by Source">
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
                cursor={{ fill: "var(--neutral-100)" }}
                formatter={(v: number) => [`${v}%`, "Freshness"]}
              />
              <Bar dataKey="v" fill="#2D6A9F" radius={[3, 3, 0, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Right: Recent Activity */}
        <SectionCard title="Recent Activity">
          <div className="flex flex-col gap-0">
            {ACTIVITY_LOG.map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-2.5"
                style={{
                  borderBottom:
                    i < ACTIVITY_LOG.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                }}
              >
                <span
                  className="font-mono text-[11px] shrink-0 tabular-nums"
                  style={{ color: "var(--neutral-400)", minWidth: "2.75rem" }}
                >
                  {entry.t}
                </span>
                <span
                  className="font-mono text-[12px] flex-1"
                  style={{ color: "var(--neutral-900)" }}
                >
                  {entry.a}
                </span>
                <span
                  className="font-mono text-[11px] shrink-0"
                  style={{ color: "var(--neutral-500)" }}
                >
                  {entry.u}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ROW 4 — Recent Reports table */}
      <div className="mt-4">
        <SectionCard title="Recent Reports" noPad>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead
                style={{
                  backgroundColor: "var(--neutral-100)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <tr>
                  {["Name", "Type", "Generated", "Status", "Actions"].map((col) => (
                    <th
                      key={col}
                      className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)" }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {REPORTS.map((r, i) => (
                  <tr
                    key={r.id}
                    className="hover:bg-[var(--neutral-50)] cursor-pointer"
                    style={{ borderBottom: "1px solid var(--border)" }}
                    onClick={() => navigate({ to: "/reports" })}
                  >
                    <td className="px-4 py-3">
                      <div
                        className="font-medium text-[13px]"
                        style={{ color: "var(--neutral-900)" }}
                      >
                        {r.name}
                      </div>
                      <div
                        className="font-mono text-[11px] mt-0.5"
                        style={{ color: "var(--neutral-400)" }}
                      >
                        {r.id}
                      </div>
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-[12px]"
                      style={{ color: "var(--neutral-700)" }}
                    >
                      {r.type}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-[12px]"
                      style={{
                        color: "var(--neutral-700)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.gen}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          className="inline-flex items-center gap-1 font-mono text-[12px] font-medium transition-colors"
                          style={{ color: "var(--primary-500)" }}
                          onClick={(e) => {
                            e.stopPropagation()
                            alert(`Downloading ${r.name}`)
                          }}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLElement).style.color =
                              "var(--primary-700)")
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLElement).style.color =
                              "var(--primary-500)")
                          }
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </button>
                        <Link
                          to="/reports"
                          className="inline-flex items-center gap-1 font-mono text-[12px] font-medium transition-colors"
                          style={{ color: "var(--neutral-500)" }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLElement).style.color =
                              "var(--neutral-900)")
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLElement).style.color =
                              "var(--neutral-500)")
                          }
                        >
                          View
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
  )
}
