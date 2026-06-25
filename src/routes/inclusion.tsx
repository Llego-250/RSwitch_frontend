import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  PrimaryButton,
  FilterChip,
  SectionCard,
} from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Download } from "lucide-react";

export const Route = createFileRoute("/inclusion")({
  component: Inclusion,
});

/* ─── Data ─── */

const demoData = [
  { group: "18–25", banked: 58, mobile: 72, excluded: 28 },
  { group: "26–35", banked: 74, mobile: 82, excluded: 18 },
  { group: "36–45", banked: 69, mobile: 74, excluded: 23 },
  { group: "46–55", banked: 52, mobile: 58, excluded: 41 },
  { group: "55+",   banked: 38, mobile: 41, excluded: 59 },
];

const SERVICES = [
  { name: "Mobile Money",          rate: 72, color: "#0D9488" },
  { name: "Basic Savings Account", rate: 67, color: "#2D6A9F" },
  { name: "Micro-credit",          rate: 34, color: "#7C3AED" },
  { name: "Insurance",             rate: 18, color: "#D97706" },
  { name: "Pension / Savings",     rate: 12, color: "#0891B2" },
];

const trendData = [
  { m: "Jan", rate: 28 },
  { m: "Feb", rate: 30 },
  { m: "Mar", rate: 31 },
  { m: "Apr", rate: 33 },
  { m: "May", rate: 35 },
  { m: "Jun", rate: 38 },
];

const COHORTS = [
  { id: "thin-file", name: "Thin-file applicants",  size: "12,401", approval: "38%", fairness: "0.92" },
  { id: "rural",     name: "Rural applicants",       size: "8,220",  approval: "31%", fairness: "0.88" },
  { id: "youth",     name: "Youth (18–25)",          size: "15,803", approval: "42%", fairness: "0.94" },
  { id: "women",     name: "Women-led households",   size: "9,108",  approval: "36%", fairness: "0.91" },
];

/* ─── Helpers ─── */

function fairnessColor(val: string) {
  const n = parseFloat(val);
  if (n >= 0.93) return "var(--ok)";
  if (n >= 0.89) return "var(--warn)";
  return "var(--fail)";
}

/* ─── Component ─── */

function Inclusion() {
  return (
    <AppShell
      title="Financial Inclusion Analytics"
      breadcrumb="DECIDE › INCLUSION"
      scope="all-regions"
      primaryAction={
        <PrimaryButton icon={<Download className="h-4 w-4" />}>
          Export Report
        </PrimaryButton>
      }
      toolbar={
        <>
          <FilterChip label="Region" value="All regions" />
          <FilterChip label="Segment" value="All segments" />
          <FilterChip label="Period" value="Jan – Jun 2026" />
        </>
      }
    >
      {/* ── ROW 1: KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Total Unbanked Population"
          value="2.1M"
          delta={{ dir: "down", text: "−8%", tone: "good" }}
          context="Reduction vs prior period"
          freshness="live"
          updated="12:00"
        />
        <KpiCard
          label="Financial Access Rate"
          value="67.3%"
          delta={{ dir: "up", text: "+4.2 pp", tone: "good" }}
          context="Share of adult population"
          freshness="live"
          updated="12:00"
        />
        <KpiCard
          label="Mobile Money Users"
          value="1.4M"
          delta={{ dir: "up", text: "+12%", tone: "good" }}
          context="Active wallets, last 30 d"
          freshness="live"
          updated="11:50"
        />
        <KpiCard
          label="Approval Rate (Thin-file)"
          value="38%"
          delta={{ dir: "up", text: "+5 pp", tone: "good" }}
          context="Alt-data scoring enabled"
          freshness="live"
          updated="11:30"
        />
      </div>

      {/* ── ROW 2: Demographics + Service Penetration ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-5">

        {/* Left — grouped bar chart */}
        <div className="lg:col-span-8">
          <SectionCard title="Access by Demographic Group">
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={demoData}
                  margin={{ top: 4, right: 12, left: -16, bottom: 0 }}
                  barCategoryGap="28%"
                  barGap={2}
                >
                  <XAxis
                    dataKey="group"
                    tick={{ fontSize: 12, fill: "var(--neutral-500)", fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--neutral-400)", fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value}%`,
                      name.charAt(0).toUpperCase() + name.slice(1),
                    ]}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: "monospace",
                    }}
                    cursor={{ fill: "var(--neutral-100)" }}
                  />
                  <Legend
                    iconType="square"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, fontFamily: "monospace", paddingTop: 8 }}
                    formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                  />
                  <Bar dataKey="banked"   fill="#2D6A9F" radius={[3, 3, 0, 0]} name="banked"   maxBarSize={20} />
                  <Bar dataKey="mobile"   fill="#0D9488" radius={[3, 3, 0, 0]} name="mobile"   maxBarSize={20} />
                  <Bar dataKey="excluded" fill="#E11D48" radius={[3, 3, 0, 0]} name="excluded" maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>

        {/* Right — service penetration */}
        <div className="lg:col-span-4">
          <SectionCard title="Service Penetration">
            <div className="flex flex-col gap-4">
              {SERVICES.map((s) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-[13px] truncate mr-2"
                      style={{ color: "var(--neutral-700)" }}
                    >
                      {s.name}
                    </span>
                    <span
                      className="font-mono text-[12px] tabular-nums shrink-0 font-semibold"
                      style={{ color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}
                    >
                      {s.rate}%
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--neutral-100)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${s.rate}%`, backgroundColor: s.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── ROW 3: Trend + Cohort Analysis ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Left — approval rate trend */}
        <div className="lg:col-span-6">
          <SectionCard title="Program Impact — Approval Rate Trend">
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendData}
                  margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="approvalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2D6A9F" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#2D6A9F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="m"
                    tick={{ fontSize: 12, fill: "var(--neutral-500)", fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--neutral-400)", fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[20, 45]}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Approval rate"]}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: "monospace",
                    }}
                    cursor={{ stroke: "var(--neutral-200)", strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="#2D6A9F"
                    strokeWidth={2}
                    fill="url(#approvalGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#2D6A9F", strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#2D6A9F"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#2D6A9F", strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>

        {/* Right — cohort analysis table */}
        <div className="lg:col-span-6">
          <SectionCard title="Cohort Analysis" noPad>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead
                  style={{
                    backgroundColor: "var(--neutral-100)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <tr>
                    <th
                      className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)" }}
                    >
                      Cohort
                    </th>
                    <th
                      className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)" }}
                    >
                      Size
                    </th>
                    <th
                      className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)" }}
                    >
                      Approval
                    </th>
                    <th
                      className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)" }}
                    >
                      Fairness
                    </th>
                    <th
                      className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)" }}
                    >
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COHORTS.map((c, i) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        backgroundColor:
                          i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                      }}
                    >
                      <td
                        className="px-4 py-3 text-[13px] font-medium"
                        style={{ color: "var(--neutral-900)" }}
                      >
                        {c.name}
                      </td>
                      <td
                        className="px-4 py-3 text-right font-mono text-[13px]"
                        style={{
                          color: "var(--neutral-700)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {c.size}
                      </td>
                      <td
                        className="px-4 py-3 text-right font-mono text-[13px] font-semibold"
                        style={{
                          color: "var(--neutral-900)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {c.approval}
                      </td>
                      <td
                        className="px-4 py-3 text-right font-mono text-[13px] font-semibold"
                        style={{
                          color: fairnessColor(c.fairness),
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {c.fairness}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="text-[12px] font-medium transition-colors"
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
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
