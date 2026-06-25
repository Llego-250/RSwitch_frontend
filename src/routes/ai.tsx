import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PrimaryButton, FilterChip, SectionCard } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import {
  Plus,
  Brain,
  Activity,
  TrendingUp,
  AlertTriangle,
  Eye,
  Play,
  Pause,
  Settings,
} from "lucide-react";

export const Route = createFileRoute("/ai")({
  component: AIPage,
});

const perfData = [
  { month: "Jan", accuracy: 93.1, precision: 91.4 },
  { month: "Feb", accuracy: 93.8, precision: 92.0 },
  { month: "Mar", accuracy: 94.2, precision: 92.5 },
  { month: "Apr", accuracy: 93.9, precision: 92.1 },
  { month: "May", accuracy: 94.5, precision: 93.0 },
  { month: "Jun", accuracy: 94.7, precision: 93.4 },
];

const typeDistribution = [
  { type: "Credit Scoring",      count: 2, color: "#2D6A9F" },
  { type: "Fraud Detection",     count: 2, color: "#E11D48" },
  { type: "Churn Prediction",    count: 1, color: "#0D9488" },
  { type: "Financial Inclusion", count: 1, color: "#7C3AED" },
];
const totalModels = typeDistribution.reduce((s, d) => s + d.count, 0);

const MODELS = [
  {
    id: "MDL-001",
    name: "Credit Risk Scorer v3",
    version: "3.2.1",
    type: "Credit Scoring",
    status: "healthy" as const,
    accuracy: "94.8%",
    drift: "None",
    lastPred: "12:04",
  },
  {
    id: "MDL-002",
    name: "Fraud Velocity Detector",
    version: "8.1.0",
    type: "Fraud Detection",
    status: "healthy" as const,
    accuracy: "96.2%",
    drift: "None",
    lastPred: "12:09",
  },
  {
    id: "MDL-003",
    name: "Inclusion Eligibility",
    version: "1.4.2",
    type: "Financial Inclusion",
    status: "healthy" as const,
    accuracy: "89.4%",
    drift: "Minor",
    lastPred: "11:30",
  },
  {
    id: "MDL-004",
    name: "Churn Predictor v2",
    version: "2.0.1",
    type: "Churn Prediction",
    status: "warning" as const,
    accuracy: "87.1%",
    drift: "Detected",
    lastPred: "10:15",
  },
  {
    id: "MDL-005",
    name: "Geo-Anomaly Detector",
    version: "4.0.0",
    type: "Fraud Detection",
    status: "healthy" as const,
    accuracy: "91.5%",
    drift: "None",
    lastPred: "12:08",
  },
  {
    id: "MDL-006",
    name: "SME Credit Scorer",
    version: "1.1.0",
    type: "Credit Scoring",
    status: "running" as const,
    accuracy: "—",
    drift: "—",
    lastPred: "Deploying",
  },
];

function DriftCell({ drift }: { drift: string }) {
  if (drift === "Detected") {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium whitespace-nowrap"
        style={{
          color: "#E11D48",
          backgroundColor: "#FFE4E6",
          borderRadius: "4px",
          padding: "3px 8px",
          lineHeight: "1.4",
        }}
      >
        <AlertTriangle className="h-3 w-3" />
        Detected
      </span>
    );
  }
  if (drift === "Minor") {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium whitespace-nowrap"
        style={{
          color: "#D97706",
          backgroundColor: "#FEF3C7",
          borderRadius: "4px",
          padding: "3px 8px",
          lineHeight: "1.4",
        }}
      >
        <Activity className="h-3 w-3" />
        Minor
      </span>
    );
  }
  return (
    <span
      className="font-mono text-[13px]"
      style={{ color: "var(--neutral-400)" }}
    >
      {drift}
    </span>
  );
}

function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors"
      style={{ color: "var(--neutral-400)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor =
          "var(--primary-100)";
        (e.currentTarget as HTMLElement).style.color = "var(--primary-500)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
        (e.currentTarget as HTMLElement).style.color = "var(--neutral-400)";
      }}
    >
      {children}
    </button>
  );
}

function AIPage() {
  const [runningModels, setRunningModels] = useState<Set<string>>(
    new Set(["MDL-001", "MDL-002", "MDL-003", "MDL-005"])
  );

  function toggleRunning(id: string) {
    setRunningModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <AppShell
      title="AI Decision Support"
      breadcrumb="DECIDE › AI"
      scope="model-registry"
      primaryAction={
        <PrimaryButton icon={<Plus className="h-4 w-4" />}>
          Register Model
        </PrimaryButton>
      }
      toolbar={
        <>
          <FilterChip label="Model Type" value="All Types" />
          <FilterChip label="Status" value="All" />
          <FilterChip label="Period" value="Last 30 days" />
        </>
      }
    >
      {/* ROW 1 — KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Active Models"
          value="6"
          delta={{ dir: "up", text: "+1", tone: "good" }}
          source="registry"
          freshness="live"
          updated="12:10"
        />
        <KpiCard
          label="Avg Model Accuracy"
          value="94.7%"
          delta={{ dir: "up", text: "+0.8pp", tone: "good" }}
          source="eval-svc"
          freshness="live"
          updated="12:10"
        />
        <KpiCard
          label="Predictions (24h)"
          value="48,204"
          source="inference"
          freshness="live"
          updated="12:10"
        />
        <KpiCard
          label="Models with Drift"
          value="1"
          delta={{ dir: "up", text: "+1", tone: "bad" }}
          source="drift-monitor"
          freshness="live"
          updated="11:58"
        />
      </div>

      {/* ROW 2 — Chart + Distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-5">
        {/* Left: Performance Trend */}
        <div className="xl:col-span-8">
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <TrendingUp
                  className="h-4 w-4"
                  style={{ color: "var(--primary-500)" }}
                />
                Model Performance Trend
              </span>
            }
          >
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={perfData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                >
                  <XAxis
                    dataKey="month"
                    tick={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      fill: "var(--neutral-400)",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[90, 98]}
                    tick={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      fill: "var(--neutral-400)",
                    }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontFamily: "monospace",
                    }}
                    formatter={(value: number, name: string) => [
                      `${value}%`,
                      name === "accuracy" ? "Accuracy" : "Precision",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#2D6A9F"
                    strokeWidth={2}
                    dot={{ fill: "#2D6A9F", r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="precision"
                    stroke="#0D9488"
                    strokeWidth={2}
                    dot={{ fill: "#0D9488", r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-5 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--neutral-600)" }}>
                <span
                  className="h-2.5 w-4 rounded-sm inline-block"
                  style={{ backgroundColor: "#2D6A9F" }}
                />
                Accuracy
              </span>
              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--neutral-600)" }}>
                <span
                  className="h-2.5 w-4 rounded-sm inline-block"
                  style={{ backgroundColor: "#0D9488" }}
                />
                Precision
              </span>
            </div>
          </SectionCard>
        </div>

        {/* Right: Model Type Distribution */}
        <div className="xl:col-span-4">
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <Brain
                  className="h-4 w-4"
                  style={{ color: "var(--ai)" }}
                />
                Model Type Distribution
              </span>
            }
          >
            <div className="flex flex-col gap-4">
              {typeDistribution.map((d) => {
                const pct = Math.round((d.count / totalModels) * 100);
                return (
                  <div key={d.type}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="flex items-center gap-2 text-[13px] font-medium"
                        style={{ color: "var(--neutral-700)" }}
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: d.color }}
                        />
                        {d.type}
                      </span>
                      <span
                        className="font-mono text-[12px] font-semibold"
                        style={{ color: "var(--neutral-900)" }}
                      >
                        {d.count}
                      </span>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: "var(--neutral-100)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: d.color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div
                className="pt-3 mt-1 font-mono text-[11px]"
                style={{
                  borderTop: "1px solid var(--border)",
                  color: "var(--neutral-400)",
                }}
              >
                {totalModels} models total · 4 types
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ROW 3 — Model Registry Table */}
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Activity
              className="h-4 w-4"
              style={{ color: "var(--primary-500)" }}
            />
            Model Registry
          </span>
        }
        noPad
      >
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
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Model Name
                </th>
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Version
                </th>
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Type
                </th>
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Status
                </th>
                <th
                  className="text-right px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Accuracy
                </th>
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Drift
                </th>
                <th
                  className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Last Prediction
                </th>
                <th
                  className="text-right px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {MODELS.map((m, i) => (
                <tr
                  key={m.id}
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
                      {m.name}
                    </div>
                    <div
                      className="font-mono text-[11px] mt-0.5"
                      style={{ color: "var(--neutral-400)" }}
                    >
                      {m.id}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px]" style={{ color: "var(--neutral-500)" }}>
                    {m.version}
                  </td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neutral-700)" }}>
                    {m.type}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td
                    className="px-4 py-3 text-right font-mono text-[13px] font-semibold"
                    style={{
                      color:
                        m.accuracy === "—"
                          ? "var(--neutral-400)"
                          : "var(--neutral-900)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {m.accuracy}
                  </td>
                  <td className="px-4 py-3">
                    <DriftCell drift={m.drift} />
                  </td>
                  <td
                    className="px-4 py-3 font-mono text-[13px]"
                    style={{
                      color:
                        m.lastPred === "Deploying"
                          ? "var(--primary-500)"
                          : "var(--neutral-500)",
                    }}
                  >
                    {m.lastPred}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <ActionButton title="View model details">
                        <Eye className="h-3.5 w-3.5" />
                      </ActionButton>
                      <ActionButton
                        title={
                          runningModels.has(m.id)
                            ? "Pause model"
                            : "Resume model"
                        }
                        onClick={() => toggleRunning(m.id)}
                      >
                        {runningModels.has(m.id) ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </ActionButton>
                      <ActionButton title="Model settings">
                        <Settings className="h-3.5 w-3.5" />
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
