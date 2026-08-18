import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertTriangle, Eye, UserCheck, X, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/fraud")({
  component: Fraud,
});

/* ─── Data ─── */

const ALERTS = [
  {
    id: "F-2208",
    kind: "Velocity",
    pattern: "3 identical transactions in 2 min",
    sev: "failed" as const,
    ago: "2m",
    conf: 0.88,
    amount: "$12,630",
    source: "card-stream",
    status: "open",
    assigned: "Unassigned",
  },
  {
    id: "F-2207",
    kind: "Geographic",
    pattern: "Transaction from unusual location",
    sev: "warning" as const,
    ago: "8m",
    conf: 0.71,
    amount: "$4,200",
    source: "card-stream",
    status: "investigating",
    assigned: "J. Okello",
  },
  {
    id: "F-2205",
    kind: "Device Anomaly",
    pattern: "New device + large transfer",
    sev: "warning" as const,
    ago: "22m",
    conf: 0.66,
    amount: "$8,500",
    source: "mobile-banking",
    status: "investigating",
    assigned: "A. Mbeki",
  },
  {
    id: "F-2201",
    kind: "Structuring",
    pattern: "Multiple sub-threshold deposits",
    sev: "completed" as const,
    ago: "1h",
    conf: 0.92,
    amount: "$9,800",
    source: "core-banking",
    status: "resolved",
    assigned: "J. Okello",
  },
];

const DETECTION_DATA = [
  { name: "ML Model", v: 62 },
  { name: "Rules Engine", v: 28 },
  { name: "Manual Flag", v: 10 },
];
const DETECTION_COLORS = ["#2D6A9F", "#0D9488", "#D97706"];

/* Evidence rows keyed by alert id */
const EVIDENCE: Record<
  string,
  { txn: string; amount: string; time: string; channel: string }[]
> = {
  "F-2208": [
    { txn: "TXN-99812", amount: "$4,210", time: "12:03:14", channel: "card · POS" },
    { txn: "TXN-99813", amount: "$4,210", time: "12:04:02", channel: "card · POS" },
    { txn: "TXN-99814", amount: "$4,210", time: "12:05:11", channel: "card · POS" },
  ],
  "F-2207": [
    { txn: "TXN-98741", amount: "$4,200", time: "11:54:30", channel: "card · online" },
  ],
  "F-2205": [
    { txn: "TXN-98203", amount: "$8,500", time: "11:38:02", channel: "mobile · transfer" },
  ],
  "F-2201": [
    { txn: "TXN-97011", amount: "$2,400", time: "10:12:08", channel: "branch · deposit" },
    { txn: "TXN-97022", amount: "$2,300", time: "10:48:55", channel: "branch · deposit" },
    { txn: "TXN-97038", amount: "$2,450", time: "11:15:33", channel: "branch · deposit" },
    { txn: "TXN-97051", amount: "$2,650", time: "11:44:10", channel: "branch · deposit" },
  ],
};

const BEHAVIORAL: Record<string, string> = {
  "F-2208":
    "Three card-present transactions at the same terminal cluster in under 2 minutes, identical amounts — consistent with card skimming or testing before larger spend.",
  "F-2207":
    "Cardholder's last 90 days of activity shows exclusively domestic POS. This transaction was flagged by the geo-velocity rule for a location 4,200 km from the prior authorisation.",
  "F-2205":
    "First login from this device UUID. Transfer initiated within 40 s of login — no MFA challenge recorded. Behavioural biometrics score: 0.22 (threshold 0.50).",
  "F-2201":
    "Four branch deposits over 90 minutes, each just below the $2,500 regulatory reporting threshold. Pattern is consistent with structuring (31 CFR 1010.314). Resolved — SAR filed.",
};

const RELATED: Record<string, string[]> = {
  "F-2208": ["F-2207"],
  "F-2207": ["F-2208"],
  "F-2205": [],
  "F-2201": [],
};

const AUDIT: Record<
  string,
  { when: string; who: string; what: string; color: string }[]
> = {
  "F-2208": [
    { when: "12:05", who: "system", what: "Alert raised · velocity rule + ML (conf 0.88)", color: "var(--fail)" },
    { when: "12:06", who: "system", what: "Escalated to fraud queue — severity: critical", color: "var(--fail)" },
  ],
  "F-2207": [
    { when: "11:58", who: "system", what: "Alert raised · geo-velocity rule (conf 0.71)", color: "var(--warn)" },
    { when: "12:01", who: "admin", what: "Assigned to J. Okello", color: "var(--info)" },
    { when: "12:09", who: "J. Okello", what: "Evidence reviewed · investigation open", color: "var(--info)" },
  ],
  "F-2205": [
    { when: "11:40", who: "system", what: "Alert raised · device anomaly (conf 0.66)", color: "var(--warn)" },
    { when: "11:44", who: "admin", what: "Assigned to A. Mbeki", color: "var(--info)" },
    { when: "11:52", who: "A. Mbeki", what: "Biometrics score requested", color: "var(--info)" },
  ],
  "F-2201": [
    { when: "11:50", who: "system", what: "Alert raised · structuring pattern (conf 0.92)", color: "var(--warn)" },
    { when: "11:55", who: "admin", what: "Assigned to J. Okello", color: "var(--info)" },
    { when: "12:10", who: "J. Okello", what: "Confirmed structuring · SAR prepared", color: "var(--ok)" },
    { when: "12:28", who: "J. Okello", what: "Resolved · SAR filed (BR-09)", color: "var(--ok)" },
  ],
};

/* ─── Helpers ─── */

function severityBorderColor(sev: string) {
  if (sev === "failed") return "var(--fail)";
  if (sev === "warning") return "var(--warn)";
  return "var(--neutral-200)";
}

function confidenceTone(conf: number) {
  if (conf >= 0.85) return "var(--fail)";
  if (conf >= 0.70) return "var(--warn)";
  return "var(--neutral-500)";
}

/* ─── Component ─── */

function Fraud() {
  const [selId, setSelId] = useState("F-2208");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const alert = ALERTS.find((a) => a.id === selId)!;
  const evidence = EVIDENCE[selId] ?? [];
  const behavioral = BEHAVIORAL[selId] ?? "";
  const related = RELATED[selId] ?? [];
  const audit = AUDIT[selId] ?? [];

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }

  return (
    <AppShell
      title="Fraud Detection"
      subtitle="Real-time transaction monitoring, behavioral patterns, and investigation queue"
      breadcrumb="DECIDE › FRAUD DETECTION"
      scope="card-stream · mobile-banking · core-banking"
      primaryAction={
        <PrimaryButton
          icon={
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
          }
          onClick={handleRefresh}
        >
          {refreshing ? "Refreshing…" : "Auto-refresh on"}
        </PrimaryButton>
      }
    >
      {/* ── ROW 1 — KPI cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Active alerts"
          value="3"
          delta={{ dir: "up", text: "+1", tone: "bad" }}
          freshness="live"
        />
        <KpiCard
          label="Investigation queue"
          value="7"
          context="avg age 4h"
          freshness="live"
        />
        <KpiCard
          label="False positive rate"
          value="12%"
          delta={{ dir: "down", text: "-3%", tone: "good" }}
          freshness="live"
        />
        <KpiCard
          label="Cases resolved (24h)"
          value="14"
          delta={{ dir: "up", text: "+2", tone: "good" }}
          freshness="live"
        />
      </div>

      {/* ── ROW 2 — Alert timeline + Detection methods ── */}
      <div
        className="grid gap-4 mb-6"
        style={{ gridTemplateColumns: "1fr 320px" }}
      >
        {/* Alert timeline */}
        <SectionCard
          title="Alert Timeline"
          action={
            <span
              className="font-mono text-[11px] px-2 py-0.5 rounded"
              style={{
                backgroundColor: "var(--fail-bg)",
                color: "var(--fail)",
              }}
            >
              3 open · 1 critical
            </span>
          }
          noPad
        >
          <div>
            {ALERTS.map((a) => {
              const isSelected = a.id === selId;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelId(a.id)}
                  className="w-full text-left"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    borderLeft: `4px solid ${severityBorderColor(a.sev)}`,
                    backgroundColor: isSelected
                      ? "var(--primary-50)"
                      : "transparent",
                    padding: "14px 16px",
                    display: "block",
                    transition: "background-color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "var(--neutral-50)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "transparent";
                  }}
                >
                  {/* Top row */}
                  <div
                    className="flex items-center justify-between gap-3 mb-1"
                  >
                    <div className="flex items-center gap-2">
                      <StatusBadge status={a.sev}>
                        {a.sev === "failed"
                          ? "High"
                          : a.sev === "warning"
                          ? "Medium"
                          : "Resolved"}
                      </StatusBadge>
                      <span
                        className="font-mono text-[11px]"
                        style={{ color: "var(--neutral-500)" }}
                      >
                        {a.source}
                      </span>
                    </div>
                    <span
                      className="font-mono text-[11px] shrink-0"
                      style={{ color: "var(--neutral-400)" }}
                    >
                      {a.ago} ago
                    </span>
                  </div>

                  {/* Title + description */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div
                        className="text-[13px] font-semibold"
                        style={{ color: "var(--neutral-900)" }}
                      >
                        {a.id} — {a.kind}
                      </div>
                      <div
                        className="text-[12px] mt-0.5"
                        style={{ color: "var(--neutral-500)" }}
                      >
                        {a.pattern}
                      </div>
                    </div>
                    <div
                      className="font-mono text-[12px] font-semibold shrink-0 tabular-nums"
                      style={{ color: "var(--neutral-700)" }}
                    >
                      {a.amount}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3">
                    <span
                      role="button"
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded"
                      style={{
                        backgroundColor: isSelected
                          ? "var(--primary-500)"
                          : "var(--primary-100)",
                        color: isSelected ? "#fff" : "var(--primary-500)",
                      }}
                    >
                      <Eye className="h-3 w-3" />
                      Investigate
                    </span>
                    {a.status !== "resolved" && (
                      <span
                        role="button"
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded"
                        style={{
                          backgroundColor: "var(--neutral-100)",
                          color: "var(--neutral-700)",
                        }}
                      >
                        <UserCheck className="h-3 w-3" />
                        Assign
                      </span>
                    )}
                    {a.status !== "resolved" && (
                      <span
                        role="button"
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded"
                        style={{
                          backgroundColor: "var(--neutral-100)",
                          color: "var(--neutral-500)",
                        }}
                      >
                        <X className="h-3 w-3" />
                        Dismiss
                      </span>
                    )}
                    <span
                      className="ml-auto font-mono text-[11px]"
                      style={{
                        color: confidenceTone(a.conf),
                      }}
                    >
                      conf {(a.conf * 100).toFixed(0)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* Detection methods pie */}
        <SectionCard title="Detection Methods">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={DETECTION_DATA}
                dataKey="v"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={68}
                paddingAngle={2}
              >
                {DETECTION_DATA.map((_, i) => (
                  <Cell
                    key={i}
                    fill={DETECTION_COLORS[i % DETECTION_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => [`${v}%`, ""]}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-col gap-2 mt-2">
            {DETECTION_DATA.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: DETECTION_COLORS[i] }}
                  />
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--neutral-700)" }}
                  >
                    {d.name}
                  </span>
                </div>
                <span
                  className="font-mono text-[12px] font-semibold tabular-nums"
                  style={{ color: "var(--neutral-900)" }}
                >
                  {d.v}%
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ── ROW 3 — Case Workspace ── */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        {/* Workspace header */}
        <div
          className="px-5 py-3 flex items-center justify-between gap-3"
          style={{
            backgroundColor: "var(--neutral-900)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle
              className="h-4 w-4 shrink-0"
              style={{ color: "var(--fail)" }}
            />
            <span
              className="font-mono text-[13px] font-semibold"
              style={{ color: "#fff" }}
            >
              Case Workspace — {alert.id}
            </span>
            <StatusBadge status={alert.sev}>
              {alert.sev === "failed"
                ? "High Severity"
                : alert.sev === "warning"
                ? "Medium"
                : "Resolved"}
            </StatusBadge>
          </div>
          <span
            className="font-mono text-[11px]"
            style={{ color: "var(--neutral-400)" }}
          >
            {alert.source} · {alert.ago} ago
          </span>
        </div>

        {/* 3-column layout */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: "256px 1fr 280px",
            backgroundColor: "var(--card)",
          }}
        >
          {/* ── Left: Case info ── */}
          <div
            className="flex flex-col gap-0"
            style={{ borderRight: "1px solid var(--border)" }}
          >
            <div
              className="px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--neutral-50)" }}
            >
              <span
                className="text-[11px] font-mono uppercase tracking-wider"
                style={{ color: "var(--neutral-400)" }}
              >
                Case Information
              </span>
            </div>

            <div className="p-4 flex flex-col gap-4">
              {/* Field group */}
              <div className="flex flex-col gap-3">
                <CaseField label="Alert ID" value={alert.id} mono />
                <CaseField label="Pattern Type" value={alert.kind} />
                <CaseField label="Amount" value={alert.amount} mono />
                <CaseField
                  label="Status"
                  value={
                    <StatusBadge status={alert.sev}>
                      {alert.status.charAt(0).toUpperCase() +
                        alert.status.slice(1)}
                    </StatusBadge>
                  }
                />
                <CaseField label="Assigned" value={alert.assigned} />
                <CaseField
                  label="Confidence"
                  value={
                    <span
                      className="font-mono text-[13px] font-semibold"
                      style={{ color: confidenceTone(alert.conf) }}
                    >
                      {(alert.conf * 100).toFixed(0)}%
                    </span>
                  }
                />
              </div>

              {/* Detection reason */}
              <div>
                <div
                  className="text-[11px] font-mono uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--neutral-400)" }}
                >
                  Detection Reason
                </div>
                <p
                  className="text-[12px] leading-relaxed"
                  style={{ color: "var(--neutral-700)" }}
                >
                  {alert.pattern}
                </p>
              </div>

              {/* Related alerts */}
              <div>
                <div
                  className="text-[11px] font-mono uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--neutral-400)" }}
                >
                  Related Alerts
                </div>
                {related.length === 0 ? (
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--neutral-400)" }}
                  >
                    None
                  </span>
                ) : (
                  <div className="flex flex-col gap-1">
                    {related.map((rid) => (
                      <button
                        key={rid}
                        onClick={() => setSelId(rid)}
                        className="text-left"
                        style={{ color: "var(--primary-500)" }}
                      >
                        <span className="font-mono text-[12px] underline underline-offset-2">
                          {rid}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Center: Evidence ── */}
          <div style={{ borderRight: "1px solid var(--border)" }}>
            <div
              className="px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--neutral-50)" }}
            >
              <span
                className="text-[11px] font-mono uppercase tracking-wider"
                style={{ color: "var(--neutral-400)" }}
              >
                Evidence — Linked Transactions
              </span>
            </div>

            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead
                    style={{
                      backgroundColor: "var(--neutral-100)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <tr>
                      {["Transaction", "Amount", "Time", "Channel"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                            style={{ color: "var(--neutral-500)" }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.map((row, i) => (
                      <tr
                        key={row.txn}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          backgroundColor:
                            i % 2 === 0
                              ? "transparent"
                              : "var(--neutral-50)",
                        }}
                      >
                        <td
                          className="px-4 py-3 font-mono text-[13px]"
                          style={{ color: "var(--neutral-900)" }}
                        >
                          {row.txn}
                        </td>
                        <td
                          className="px-4 py-3 font-mono text-[13px] tabular-nums font-semibold"
                          style={{ color: "var(--neutral-900)" }}
                        >
                          {row.amount}
                        </td>
                        <td
                          className="px-4 py-3 font-mono text-[13px] tabular-nums"
                          style={{ color: "var(--neutral-700)" }}
                        >
                          {row.time}
                        </td>
                        <td
                          className="px-4 py-3 text-[12px]"
                          style={{ color: "var(--neutral-500)" }}
                        >
                          {row.channel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Behavioral note */}
              <div
                className="mt-4 rounded-md p-3"
                style={{
                  backgroundColor: "var(--neutral-50)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  className="text-[11px] font-mono uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--neutral-400)" }}
                >
                  Behavioural Analysis
                </div>
                <p
                  className="text-[12px] leading-relaxed"
                  style={{ color: "var(--neutral-700)" }}
                >
                  {behavioral}
                </p>
              </div>
            </div>
          </div>

          {/* ── Right: Actions + Audit ── */}
          <div className="flex flex-col">
            <div
              className="px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--neutral-50)" }}
            >
              <span
                className="text-[11px] font-mono uppercase tracking-wider"
                style={{ color: "var(--neutral-400)" }}
              >
                Actions
              </span>
            </div>

            <div className="p-4 flex flex-col gap-4 flex-1">
              {/* Assign to me */}
              <SecondaryButton icon={<UserCheck className="h-3.5 w-3.5" />}>
                Assign to Me
              </SecondaryButton>

              {/* Decision form */}
              <div>
                <label
                  className="block text-[11px] font-mono uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--neutral-400)" }}
                >
                  Outcome
                </label>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  className="w-full h-9 px-3 text-[13px] rounded-md appearance-none"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: outcome ? "var(--neutral-900)" : "var(--neutral-400)",
                    outline: "none",
                  }}
                >
                  <option value="">Select outcome…</option>
                  <option value="confirmed">Confirm Fraud</option>
                  <option value="clean">Mark Clean — False Positive</option>
                  <option value="escalate">Escalate to Senior Analyst</option>
                  <option value="sar">File SAR</option>
                </select>
              </div>

              <div>
                <label
                  className="block text-[11px] font-mono uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--neutral-400)" }}
                >
                  Investigator Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Document your findings and reasoning…"
                  rows={4}
                  className="w-full text-[12px] leading-relaxed px-3 py-2.5 rounded-md resize-none"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: "var(--neutral-900)",
                    outline: "none",
                  }}
                />
              </div>

              <PrimaryButton
                disabled={!outcome}
                onClick={() => {
                  setOutcome("");
                  setNotes("");
                }}
              >
                Submit Decision
              </PrimaryButton>

              {/* Audit timeline */}
              <div
                className="mt-2 pt-4"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <div
                  className="text-[11px] font-mono uppercase tracking-wider mb-3"
                  style={{ color: "var(--neutral-400)" }}
                >
                  Action History
                </div>
                <ol className="relative pl-4 flex flex-col gap-4"
                  style={{ borderLeft: "1px solid var(--border)" }}>
                  {audit.map((entry, i) => (
                    <li key={i} className="relative">
                      <span
                        className="absolute"
                        style={{
                          left: "-20px",
                          top: "3px",
                          height: "8px",
                          width: "8px",
                          borderRadius: "50%",
                          backgroundColor: entry.color,
                          display: "inline-block",
                        }}
                      />
                      <div
                        className="text-[12px] leading-snug"
                        style={{ color: "var(--neutral-700)" }}
                      >
                        {entry.what}
                      </div>
                      <div
                        className="font-mono text-[10px] mt-0.5"
                        style={{ color: "var(--neutral-400)" }}
                      >
                        {entry.who} · {entry.when}
                      </div>
                    </li>
                  ))}
                </ol>
                <p
                  className="mt-4 font-mono text-[10px] leading-relaxed"
                  style={{ color: "var(--neutral-400)" }}
                >
                  BR-09 · SYS-10 — append-only audit log: source · reason · severity · status · owner · action.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ─── Small helpers ─── */

function CaseField({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[10px] font-mono uppercase tracking-wider mb-0.5"
        style={{ color: "var(--neutral-400)" }}
      >
        {label}
      </div>
      <div
        className={`text-[13px] ${mono ? "font-mono tabular-nums" : ""}`}
        style={{ color: "var(--neutral-900)" }}
      >
        {value}
      </div>
    </div>
  );
}
