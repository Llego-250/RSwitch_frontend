import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PrimaryButton, SecondaryButton, FilterChip, SectionCard } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
import { Scale, Shield, Database, AlertTriangle, CheckCircle2, TrendingUp, Plus, Eye, Pencil, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/governance")({
  component: Governance,
});

// ─── Data ────────────────────────────────────────────────────────────────────

const POLICIES = [
  { id: "POL-001", name: "PII Masking — Analyst Role",    owner: "Data Office", scope: "All sources",   status: "healthy" as const,  audited: "2025-06-20" },
  { id: "POL-002", name: "Retention Policy — 7 Years",    owner: "Legal",       scope: "Core Banking",  status: "healthy" as const,  audited: "2025-06-15" },
  { id: "POL-003", name: "Purpose Limitation — Credit",   owner: "Risk Team",   scope: "Credit Bureau", status: "warning" as const,  audited: "2025-06-10" },
  { id: "POL-004", name: "Cross-border Transfer Controls",owner: "Compliance",  scope: "All sources",   status: "healthy" as const,  audited: "2025-06-08" },
  { id: "POL-005", name: "AI Model Explainability",       owner: "AI Guild",    scope: "Fraud ML",      status: "warning" as const,  audited: "2025-05-30" },
  { id: "POL-006", name: "Consent Management Framework",  owner: "Legal",       scope: "Customer 360",  status: "healthy" as const,  audited: "2025-06-22" },
];

// Heatmap scores: [Completeness, Accuracy, Timeliness, Consistency, Uniqueness]
const QUALITY_SOURCES = [
  { name: "Core Banking",     scores: [97, 95, 91, 88, 96] },
  { name: "Mobile Money",     scores: [92, 89, 94, 85, 91] },
  { name: "Credit Bureau",    scores: [88, 91, 72, 90, 95] },
  { name: "ERP",              scores: [76, 83, 68, 79, 88] },
  { name: "Payment Gateway",  scores: [94, 92, 96, 93, 97] },
];

const QUALITY_DIMS = ["Completeness", "Accuracy", "Timeliness", "Consistency", "Uniqueness"];

const ISSUES = [
  { label: "Critical", count: 2,  color: "var(--fail)",    bg: "var(--fail-bg)",    max: 12 },
  { label: "High",     count: 4,  color: "#B45309",        bg: "#FDE68A",           max: 12 },
  { label: "Medium",   count: 6,  color: "var(--warn)",    bg: "var(--warn-bg)",    max: 12 },
  { label: "Low",      count: 0,  color: "var(--neutral-400)", bg: "var(--neutral-100)", max: 12 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number): { fg: string; bg: string } {
  if (score >= 90) return { fg: "#0D9488", bg: "#CCFBF1" };
  if (score >= 70) return { fg: "#D97706", bg: "#FEF3C7" };
  return { fg: "#E11D48", bg: "#FFE4E6" };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Component ───────────────────────────────────────────────────────────────

function Governance() {
  const { role } = useRole();
  const canEdit = canManage(role, "governance");

  const [sourceFilter, setSourceFilter] = useState("All Sources");
  const [ownerFilter, setOwnerFilter] = useState("All Owners");
  const [periodFilter, setPeriodFilter] = useState("Last 30d");

  return (
    <AppShell
      title="Governance Dashboard"
      breadcrumb="GOVERN › DATA GOVERNANCE"
      scope="org-wide"
      primaryAction={
        canEdit ? (
          <PrimaryButton icon={<Plus className="h-3.5 w-3.5" />}>
            Create Policy
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <>
          <FilterChip label="Source" value={sourceFilter} onClick={() => {}} />
          <FilterChip label="Owner" value={ownerFilter} onClick={() => {}} />
          <FilterChip label="Period" value={periodFilter} onClick={() => {}} />
        </>
      }
    >
      {/* ── ROW 1: KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Data Quality Score"
          value="94.2%"
          delta={{ dir: "up", text: "+1.3pp", tone: "good" }}
          context="Aggregate across all sources"
          freshness="live"
        />
        <KpiCard
          label="Open Issues"
          value="12"
          delta={{ dir: "down", text: "-4", tone: "good" }}
          context="Down from 16 last period"
          freshness="live"
        />
        <KpiCard
          label="Active Stewards"
          value="8"
          context="Assigned data owners"
          freshness="live"
        />
        <KpiCard
          label="Policies Enforced"
          value="24"
          delta={{ dir: "up", text: "+2", tone: "good" }}
          context="Across all data domains"
          freshness="live"
        />
      </div>

      {/* ── ROW 2: Quality Heatmap + Issue Summary ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-5">

        {/* Left: Heatmap */}
        <div className="lg:col-span-8">
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <Database className="h-4 w-4" style={{ color: "var(--neutral-400)" }} />
                Data Quality by Source
              </span>
            }
            noPad
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
                  <tr>
                    <th
                      className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)", minWidth: "140px" }}
                    >
                      Source
                    </th>
                    {QUALITY_DIMS.map((dim) => (
                      <th
                        key={dim}
                        className="text-center px-3 py-3 text-[11px] font-medium uppercase tracking-wide"
                        style={{ color: "var(--neutral-500)", minWidth: "104px" }}
                      >
                        {dim}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {QUALITY_SOURCES.map((src, i) => (
                    <tr
                      key={src.name}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-[13px]" style={{ color: "var(--neutral-700)" }}>
                        {src.name}
                      </td>
                      {src.scores.map((score, j) => {
                        const { fg, bg } = scoreColor(score);
                        return (
                          <td key={j} className="px-3 py-3 text-center">
                            <span
                              className="inline-flex items-center justify-center font-mono text-[12px] font-semibold"
                              style={{
                                color: fg,
                                backgroundColor: bg,
                                borderRadius: "4px",
                                padding: "3px 10px",
                                minWidth: "52px",
                                display: "inline-block",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {score}%
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div
              className="px-4 py-3 flex items-center gap-5 text-[11px] font-mono"
              style={{ borderTop: "1px solid var(--border)", color: "var(--neutral-500)" }}
            >
              <span className="uppercase tracking-wide">Score key</span>
              {[
                { label: "≥ 90 — Good",    fg: "#0D9488", bg: "#CCFBF1" },
                { label: "70–89 — Fair",   fg: "#D97706", bg: "#FEF3C7" },
                { label: "< 70 — At risk", fg: "#E11D48", bg: "#FFE4E6" },
              ].map(({ label, fg, bg }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: bg, border: `1px solid ${fg}` }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Right: Issue Summary */}
        <div className="lg:col-span-4">
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" style={{ color: "var(--neutral-400)" }} />
                Issue Summary
              </span>
            }
          >
            <div className="flex flex-col gap-4">
              {ISSUES.map(({ label, count, color, bg, max }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] font-medium" style={{ color: "var(--neutral-700)" }}>
                      {label}
                    </span>
                    <span
                      className="font-mono text-[13px] font-semibold"
                      style={{ color: count === 0 ? "var(--neutral-400)" : color, fontVariantNumeric: "tabular-nums" }}
                    >
                      {count}
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--neutral-100)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(count / max) * 100}%`,
                        backgroundColor: count === 0 ? "var(--neutral-200)" : color,
                        minWidth: count > 0 ? "4px" : "0",
                      }}
                    />
                  </div>
                </div>
              ))}

              {/* Total */}
              <div
                className="mt-2 pt-4 flex items-center justify-between"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <span className="text-[12px] font-mono uppercase tracking-wide" style={{ color: "var(--neutral-400)" }}>
                  Total open
                </span>
                <span
                  className="text-[20px] font-mono font-bold"
                  style={{ color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}
                >
                  12
                </span>
              </div>

              {/* Context note */}
              <div
                className="rounded-md px-3 py-2.5 text-[12px]"
                style={{ backgroundColor: "var(--warn-bg)", color: "var(--warn)" }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    2 critical issues require immediate attention from a data steward.
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── ROW 3: Policies Table ── */}
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4" style={{ color: "var(--neutral-400)" }} />
            Data Governance Policies
          </span>
        }
        action={
          <span className="font-mono text-[11px]" style={{ color: "var(--neutral-400)" }}>
            {POLICIES.length} policies
          </span>
        }
        noPad
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                <th className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)", width: "96px" }}>
                  ID
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>
                  Policy Name
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)", width: "130px" }}>
                  Owner
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)", width: "140px" }}>
                  Scope
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)", width: "110px" }}>
                  Status
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)", width: "130px" }}>
                  Last Audited
                </th>
                <th className="text-right px-4 py-3 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)", width: "120px" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {POLICIES.map((p, i) => (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                  }}
                >
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-500)" }}>
                    {p.id}
                  </td>
                  <td className="px-4 py-3 font-medium text-[13px]" style={{ color: "var(--neutral-900)" }}>
                    {p.name}
                  </td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neutral-700)" }}>
                    {p.owner}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center font-mono text-[11px] px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--neutral-100)",
                        color: "var(--neutral-500)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {p.scope}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-500)", fontVariantNumeric: "tabular-nums" }}>
                    {formatDate(p.audited)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        aria-label={`View ${p.id}`}
                        className="h-7 w-7 grid place-items-center rounded transition-colors"
                        style={{ color: "var(--neutral-400)" }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-100)";
                          (e.currentTarget as HTMLElement).style.color = "var(--primary-500)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                          (e.currentTarget as HTMLElement).style.color = "var(--neutral-400)";
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {canEdit && (
                        <button
                          aria-label={`Edit ${p.id}`}
                          className="h-7 w-7 grid place-items-center rounded transition-colors"
                          style={{ color: "var(--neutral-400)" }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-100)";
                            (e.currentTarget as HTMLElement).style.color = "var(--primary-500)";
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                            (e.currentTarget as HTMLElement).style.color = "var(--neutral-400)";
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        aria-label={`Audit ${p.id}`}
                        className="h-7 w-7 grid place-items-center rounded transition-colors"
                        style={{ color: "var(--neutral-400)" }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-100)";
                          (e.currentTarget as HTMLElement).style.color = "var(--primary-500)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                          (e.currentTarget as HTMLElement).style.color = "var(--neutral-400)";
                        }}
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                      </button>
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
