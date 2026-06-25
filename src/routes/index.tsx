import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PrimaryButton, FilterChip, SectionCard } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, Download, Eye } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const riskData = [
  { day: "Day 1",  v: 22 },
  { day: "Day 15", v: 28 },
  { day: "Day 30", v: 35 },
  { day: "Day 45", v: 31 },
  { day: "Day 60", v: 42 },
  { day: "Day 75", v: 38 },
  { day: "Day 90", v: 47 },
];

const freshnessData = [
  { name: "Core Banking",     v: 98 },
  { name: "Mobile Money",     v: 94 },
  { name: "Credit Bureau",    v: 87 },
  { name: "ERP/Accounting",   v: 72 },
  { name: "Payment Gateway",  v: 65 },
];

const ALERTS = [
  {
    id: "A-1041",
    title: "Velocity pattern: 14 txns in 3 min",
    desc: "Card cluster C-8812 · same POS terminal · amounts $190–$210",
    severity: "failed" as const,
    source: "fraud-ml",
    time: "2m ago",
  },
  {
    id: "A-1040",
    title: "Geo-anomaly: card used in 2 countries",
    desc: "Customer ID 448822 · Lagos and Nairobi within 40 min",
    severity: "failed" as const,
    source: "fraud-ml",
    time: "11m ago",
  },
  {
    id: "A-1039",
    title: "Structuring pattern detected",
    desc: "9 deposits just below KYC threshold · 3 accounts linked",
    severity: "warning" as const,
    source: "fraud-ml",
    time: "34m ago",
  },
  {
    id: "A-1038",
    title: "Device fingerprint mismatch",
    desc: "New device on trusted account · first login from this IP",
    severity: "warning" as const,
    source: "fraud-ml",
    time: "58m ago",
  },
  {
    id: "A-1037",
    title: "AML rule 7B triggered",
    desc: "Cumulative transfers exceed monthly threshold",
    severity: "warning" as const,
    source: "compliance-engine",
    time: "1h ago",
  },
];

const SEVERITY_COLOR: Record<string, string> = {
  failed:  "var(--fail)",
  warning: "var(--warn)",
  draft:   "var(--neutral-400)",
  completed: "var(--ok)",
};

const REPORTS = [
  {
    id: "RPT-0091",
    name: "Q2 2025 Regulatory Capital Report",
    type: "Quarterly",
    generated: "Jun 30, 2025",
    status: "completed" as const,
  },
  {
    id: "RPT-0090",
    name: "May 2025 Credit Portfolio Summary",
    type: "Monthly",
    generated: "Jun 1, 2025",
    status: "completed" as const,
  },
  {
    id: "RPT-0089",
    name: "FSA-22 Compliance Submission",
    type: "Regulatory",
    generated: "Jun 28, 2025",
    status: "warning" as const,
  },
];

function Dashboard() {
  const { role, roleLabel, scope } = useRole();
  const masked = role === "regulator" || role === "analyst";

  return (
    <AppShell
      title={`${roleLabel} Dashboard`}
      breadcrumb="HOME"
      scope={scope}
      primaryAction={
        <PrimaryButton icon={<Plus className="h-4 w-4" />}>
          New Report
        </PrimaryButton>
      }
      toolbar={
        <>
          <FilterChip label="scope" value="My portfolio" />
          <FilterChip label="period" value="MTD" />
          <FilterChip label="institution" value="All" />
          <span
            className="ml-auto font-mono text-[11px] flex items-center gap-1.5"
            style={{ color: "var(--neutral-500)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--ok)" }}
            />
            data live · refreshed{" "}
            {new Date().toLocaleTimeString("en", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </>
      }
    >
      {/* ROW 1 — KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Portfolio at Risk"
          value="4.82%"
          delta={{ dir: "up", text: "+0.3pp", tone: "bad" }}
          source="core-banking"
          freshness="live"
          updated="12:04"
          masked={masked}
        />
        <KpiCard
          label="Active Integrations"
          value="11/12"
          delta={{ dir: "down", text: "−1", tone: "good" }}
          source="orchestrator"
          freshness="live"
          updated="12:04"
        />
        <KpiCard
          label="Open Fraud Alerts"
          value="3"
          delta={{ dir: "up", text: "+1", tone: "bad" }}
          source="fraud-ml"
          freshness="live"
          updated="12:04"
        />
        <KpiCard
          label="Compliance Items"
          value="2 pending"
          source="regulatory"
          freshness="live"
          updated="12:04"
        />
      </div>

      {/* ROW 2 — Risk trend + Attention queue */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 8 cols */}
        <div className="lg:col-span-8">
          <SectionCard title="Risk Trend — 90 days">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={riskData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--neutral-400)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--neutral-400)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontFamily: "IBM Plex Mono, monospace",
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
              source: core-banking · v2.3 model
            </div>
          </SectionCard>
        </div>

        {/* Right 4 cols — Attention queue */}
        <div className="lg:col-span-4">
          <SectionCard title="Attention Queue">
            <ul className="space-y-2">
              <AttentionItem
                status="failed"
                to="/pipelines"
                title="ERP nightly pipeline failed"
                meta="412 records · 18m ago"
              />
              <AttentionItem
                status="warning"
                to="/fraud"
                title="3 high-severity fraud alerts"
                meta="velocity · geo · device"
              />
              <AttentionItem
                status="draft"
                to="/mapping"
                title="Mapping v4 ready to publish"
                meta="1 required field unmapped"
              />
              <AttentionItem
                status="warning"
                to="/reports"
                title="FSA-22 report due in 2 days"
                meta="quarterly · awaiting approver"
              />
            </ul>
          </SectionCard>
        </div>
      </div>

      {/* ROW 3 — Data freshness + Alert summary */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left — Data freshness bar chart */}
        <SectionCard title="Data Freshness by Source">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={freshnessData}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
            >
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--neutral-400)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--neutral-700)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontFamily: "IBM Plex Mono, monospace",
                  color: "var(--neutral-700)",
                }}
                cursor={{ fill: "var(--neutral-100)" }}
                formatter={(v: number) => [`${v}%`, "Freshness"]}
              />
              <Bar dataKey="v" fill="#2D6A9F" radius={[0, 3, 3, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Right — Alert summary */}
        <SectionCard
          title="Alert Summary"
          action={
            <Link
              to="/fraud"
              className="font-mono text-[12px] font-medium transition-colors"
              style={{ color: "var(--primary-500)" }}
            >
              View all
            </Link>
          }
        >
          <ul className="space-y-2.5">
            {ALERTS.map((alert) => (
              <li
                key={alert.id}
                style={{
                  borderLeft: `4px solid ${SEVERITY_COLOR[alert.severity] ?? "var(--neutral-400)"}`,
                  paddingLeft: "12px",
                  paddingTop: "6px",
                  paddingBottom: "6px",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={alert.severity} />
                    <span
                      className="font-mono text-[11px]"
                      style={{ color: "var(--neutral-400)" }}
                    >
                      {alert.source}
                    </span>
                  </div>
                  <span
                    className="font-mono text-[11px] shrink-0"
                    style={{ color: "var(--neutral-400)" }}
                  >
                    {alert.time}
                  </span>
                </div>
                <div
                  className="mt-1 text-[13px] font-semibold leading-tight"
                  style={{ color: "var(--neutral-900)" }}
                >
                  {alert.title}
                </div>
                <div
                  className="text-[12px] font-mono mt-0.5"
                  style={{ color: "var(--neutral-500)" }}
                >
                  {alert.desc}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* ROW 4 — Recent reports table */}
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
                  {["Report Name", "Type", "Generated", "Status", "Actions"].map(
                    (col) => (
                      <th
                        key={col}
                        className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                        style={{ color: "var(--neutral-500)" }}
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {REPORTS.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      backgroundColor:
                        i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                    }}
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
                      className="px-4 py-3 font-mono text-[12px] tabular"
                      style={{ color: "var(--neutral-700)" }}
                    >
                      {r.generated}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          className="inline-flex items-center gap-1 font-mono text-[12px] font-medium transition-colors"
                          style={{ color: "var(--primary-500)" }}
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
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLElement).style.color =
                              "var(--neutral-900)")
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLElement).style.color =
                              "var(--neutral-500)")
                          }
                        >
                          <Eye className="h-3.5 w-3.5" />
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
  );
}

function AttentionItem({
  status,
  to,
  title,
  meta,
}: {
  status: "failed" | "warning" | "draft" | "completed";
  to: string;
  title: string;
  meta: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-start gap-3 rounded-md p-2 transition-colors"
        style={{ color: "inherit" }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.backgroundColor =
            "var(--neutral-50)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")
        }
      >
        <div className="pt-0.5 shrink-0">
          <StatusBadge status={status} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[13px] font-medium leading-tight truncate"
            style={{ color: "var(--neutral-900)" }}
          >
            {title}
          </div>
          <div
            className="font-mono text-[11px] mt-0.5 truncate"
            style={{ color: "var(--neutral-500)" }}
          >
            {meta}
          </div>
        </div>
      </Link>
    </li>
  );
}
