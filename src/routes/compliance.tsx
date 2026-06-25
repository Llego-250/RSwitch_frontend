import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  FilterChip,
  SectionCard,
} from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  FileCheck2,
  Calendar,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Upload,
} from "lucide-react";

export const Route = createFileRoute("/compliance")({
  component: Compliance,
});

// ─── DATA ───────────────────────────────────────────────────────────────────

const OBLIGATIONS = [
  {
    id: "FSA-Q2-2025",
    name: "FSA Quarterly Risk Report",
    reg: "FSA",
    period: "Q2 2025",
    due: "Jul 15",
    dueSoon: true,
    status: "warning" as const,
    format: "XML",
  },
  {
    id: "AML-JUN-2025",
    name: "AML Monthly Return",
    reg: "FIU",
    period: "Jun 2025",
    due: "Jul 22",
    dueSoon: true,
    status: "draft" as const,
    format: "CSV",
  },
  {
    id: "CBK-ANN-2025",
    name: "CBK Annual Compliance",
    reg: "Central Bank",
    period: "2024",
    due: "Jul 31",
    dueSoon: false,
    status: "healthy" as const,
    format: "PDF",
  },
  {
    id: "IFRS9-Q2",
    name: "IFRS 9 ECL Disclosure",
    reg: "Auditors",
    period: "Q2 2025",
    due: "Aug 05",
    dueSoon: false,
    status: "draft" as const,
    format: "Excel",
  },
  {
    id: "GDPR-Q2",
    name: "GDPR Processing Record",
    reg: "Data Authority",
    period: "Q2 2025",
    due: "Jul 30",
    dueSoon: false,
    status: "healthy" as const,
    format: "PDF",
  },
  {
    id: "BASEL-Q2",
    name: "Basel III Capital Adequacy",
    reg: "BIS",
    period: "Q2 2025",
    due: "Aug 15",
    dueSoon: false,
    status: "draft" as const,
    format: "XML",
  },
];

const HEALTH_PILLARS = [
  { name: "AML/CFT Monitoring",  status: "healthy"  as const, checked: "Jun 30" },
  { name: "GDPR Data Handling",  status: "healthy"  as const, checked: "Jun 28" },
  { name: "IFRS 9 Reporting",    status: "warning"  as const, checked: "Jun 25" },
  { name: "Basel III Capital",   status: "healthy"  as const, checked: "Jun 20" },
  { name: "Open Banking API",    status: "healthy"  as const, checked: "Jun 18" },
];

// ─── CALENDAR ────────────────────────────────────────────────────────────────

// Jul 2025 starts on Tuesday (index 2 in Mon–Sun week)
const JULY_DEADLINES: Record<number, { label: string; color: string; bg: string }> = {
  15: { label: "FSA Quarterly",  color: "#E11D48", bg: "#FFE4E6" },
  22: { label: "AML Monthly",    color: "#D97706", bg: "#FEF3C7" },
  31: { label: "CBK Annual",     color: "#2D6A9F", bg: "#E8F1FA" },
};

function ReportingCalendar() {
  const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Jul 1, 2025 is a Tuesday → offset 1 (Mon=0)
  const OFFSET = 1;
  const DAYS_IN_MONTH = 31;

  // Build a 5-row × 7-col grid of day numbers (0 = empty)
  const cells: number[] = [];
  for (let i = 0; i < OFFSET; i++) cells.push(0);
  for (let d = 1; d <= DAYS_IN_MONTH; d++) cells.push(d);
  // Pad to a full grid (5 × 7 = 35)
  while (cells.length < 35) cells.push(0);

  return (
    <div>
      {/* Day-of-week header */}
      <div
        className="grid grid-cols-7 gap-px mb-1"
        style={{ fontSize: "11px", fontWeight: 500, letterSpacing: "0.05em" }}
      >
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="text-center py-1.5"
            style={{
              color: "var(--neutral-400)",
              fontFamily: "monospace",
              textTransform: "uppercase",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        className="grid grid-cols-7 gap-px"
        style={{ backgroundColor: "var(--border)" }}
      >
        {cells.map((day, idx) => {
          const deadline = day > 0 ? JULY_DEADLINES[day] : undefined;
          const isToday = day === 25; // Current date in demo context (Jun 25 → next month context)
          return (
            <div
              key={idx}
              style={{
                backgroundColor: day === 0 ? "var(--neutral-50)" : "var(--card)",
                minHeight: "56px",
                padding: "4px 5px",
                position: "relative",
              }}
            >
              {day > 0 && (
                <>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: deadline ? 700 : 400,
                      color: deadline
                        ? deadline.color
                        : isToday
                        ? "var(--primary-500)"
                        : "var(--neutral-700)",
                      lineHeight: 1,
                      marginBottom: "3px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {day}
                  </div>
                  {deadline && (
                    <div
                      style={{
                        fontSize: "10px",
                        lineHeight: 1.3,
                        fontWeight: 600,
                        color: deadline.color,
                        backgroundColor: deadline.bg,
                        borderRadius: "3px",
                        padding: "2px 4px",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {deadline.label}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {Object.entries(JULY_DEADLINES).map(([day, d]) => (
          <div
            key={day}
            className="flex items-center gap-1.5"
            style={{ fontSize: "11px", color: "var(--neutral-500)" }}
          >
            <span
              style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "2px",
                backgroundColor: d.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontVariantNumeric: "tabular-nums" }}>Jul {day}</span>
            <span style={{ color: d.color, fontWeight: 600 }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HEALTH PILLAR ROW ───────────────────────────────────────────────────────

function PillarRow({
  name,
  status,
  checked,
}: {
  name: string;
  status: "healthy" | "warning" | "failed";
  checked: string;
}) {
  const stripeColor =
    status === "healthy"
      ? "var(--ok)"
      : status === "warning"
      ? "var(--warn)"
      : "var(--fail)";

  return (
    <div
      className="flex items-center gap-3 py-3"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Status stripe */}
      <span
        style={{
          display: "inline-block",
          width: "3px",
          height: "32px",
          borderRadius: "2px",
          backgroundColor: stripeColor,
          flexShrink: 0,
        }}
      />
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--neutral-900)",
            marginBottom: "2px",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: "11px",
            fontFamily: "monospace",
            color: "var(--neutral-400)",
          }}
        >
          Checked: {checked}
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

// ─── FORMAT CHIP ─────────────────────────────────────────────────────────────

function FormatChip({ fmt }: { fmt: string }) {
  const fmtColors: Record<string, { fg: string; bg: string }> = {
    XML:   { fg: "#2D6A9F", bg: "#E8F1FA" },
    CSV:   { fg: "#0D9488", bg: "#CCFBF1" },
    PDF:   { fg: "#E11D48", bg: "#FFE4E6" },
    Excel: { fg: "#D97706", bg: "#FEF3C7" },
  };
  const c = fmtColors[fmt] ?? { fg: "var(--neutral-500)", bg: "var(--neutral-100)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "10px",
        fontFamily: "monospace",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: c.fg,
        backgroundColor: c.bg,
        borderRadius: "3px",
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {fmt}
    </span>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

function Compliance() {
  const [_regFilter, setRegFilter] = useState("All Regulators");
  const [_periodFilter, setPeriodFilter] = useState("Q2 2025");
  const [_statusFilter, setStatusFilter] = useState("All Status");

  return (
    <AppShell
      title="Regulatory Compliance"
      breadcrumb="GOVERN › COMPLIANCE"
      scope="FDIF · Compliance Module"
      primaryAction={
        <PrimaryButton icon={<Upload className="h-3.5 w-3.5" />}>
          Submit Report
        </PrimaryButton>
      }
      toolbar={
        <>
          <FilterChip
            label="Regulator"
            value={_regFilter}
            onClick={() => setRegFilter("All Regulators")}
          />
          <FilterChip
            label="Period"
            value={_periodFilter}
            onClick={() => setPeriodFilter("Q2 2025")}
          />
          <FilterChip
            label="Status"
            value={_statusFilter}
            onClick={() => setStatusFilter("All Status")}
          />
        </>
      }
    >
      {/* ── ROW 1: KPI CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Reports Due (This Month)"
          value="4"
          delta={{ dir: "up", text: "+1", tone: "bad" }}
          freshness="live"
          updated="08:00"
        />
        <KpiCard
          label="Submitted On Time"
          value="12/14"
          context="last quarter"
          freshness="live"
          updated="08:00"
        />
        <KpiCard
          label="Open Remediation Items"
          value="3"
          delta={{ dir: "down", text: "-2", tone: "good" }}
          freshness="live"
          updated="08:00"
        />
        <KpiCard
          label="Next Deadline"
          value="Jul 15"
          context="FSA Quarterly"
          freshness="live"
          updated="08:00"
        />
      </div>

      {/* ── ROW 2: CALENDAR + HEALTH ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-5">

        {/* Reporting Calendar (8 cols) */}
        <div className="xl:col-span-8">
          <SectionCard
            title={
              <div className="flex items-center gap-2">
                <Calendar
                  className="h-4 w-4"
                  style={{ color: "var(--neutral-400)" }}
                />
                <span>Reporting Calendar</span>
                <span
                  style={{
                    fontSize: "11px",
                    fontFamily: "monospace",
                    fontWeight: 500,
                    color: "var(--neutral-400)",
                    marginLeft: "4px",
                  }}
                >
                  July 2025
                </span>
              </div>
            }
          >
            <ReportingCalendar />
          </SectionCard>
        </div>

        {/* Compliance Health (4 cols) */}
        <div className="xl:col-span-4">
          <SectionCard
            title={
              <div className="flex items-center gap-2">
                <FileCheck2
                  className="h-4 w-4"
                  style={{ color: "var(--neutral-400)" }}
                />
                <span>Compliance Health</span>
              </div>
            }
          >
            <div>
              {HEALTH_PILLARS.map((p) => (
                <PillarRow
                  key={p.name}
                  name={p.name}
                  status={p.status as "healthy" | "warning" | "failed"}
                  checked={p.checked}
                />
              ))}
              {/* Summary line */}
              <div
                className="flex items-center justify-between mt-3 pt-2"
                style={{ borderTop: "none" }}
              >
                <div className="flex items-center gap-1.5">
                  <CheckCircle2
                    className="h-3.5 w-3.5"
                    style={{ color: "var(--ok)" }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--ok)",
                      fontWeight: 600,
                    }}
                  >
                    4 passing
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <AlertTriangle
                    className="h-3.5 w-3.5"
                    style={{ color: "var(--warn)" }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--warn)",
                      fontWeight: 600,
                    }}
                  >
                    1 needs attention
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── ROW 3: SUBMISSIONS TABLE ── */}
      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <Clock
              className="h-4 w-4"
              style={{ color: "var(--neutral-400)" }}
            />
            <span>Regulatory Submissions</span>
          </div>
        }
        action={
          <SecondaryButton icon={<Download className="h-3.5 w-3.5" />}>
            Export All
          </SecondaryButton>
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
                {[
                  "Report Name",
                  "Regulator",
                  "Period",
                  "Due Date",
                  "Status",
                  "Format",
                  "Actions",
                ].map((col) => (
                  <th
                    key={col}
                    className="text-left px-4 py-3"
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--neutral-500)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OBLIGATIONS.map((row, i) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    backgroundColor: row.dueSoon
                      ? "rgba(217,119,6,0.04)"
                      : i % 2 === 0
                      ? "transparent"
                      : "var(--neutral-50)",
                  }}
                >
                  {/* Report Name */}
                  <td className="px-4 py-3">
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--neutral-900)",
                      }}
                    >
                      {row.name}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontFamily: "monospace",
                        color: "var(--neutral-400)",
                        marginTop: "1px",
                      }}
                    >
                      {row.id}
                    </div>
                  </td>

                  {/* Regulator */}
                  <td
                    className="px-4 py-3"
                    style={{
                      fontSize: "13px",
                      color: "var(--neutral-700)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.reg}
                  </td>

                  {/* Period */}
                  <td
                    className="px-4 py-3"
                    style={{
                      fontSize: "12px",
                      fontFamily: "monospace",
                      color: "var(--neutral-500)",
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {row.period}
                  </td>

                  {/* Due Date */}
                  <td className="px-4 py-3" style={{ whiteSpace: "nowrap" }}>
                    <div className="flex items-center gap-1.5">
                      {row.dueSoon && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: "var(--warn)" }}
                        />
                      )}
                      <span
                        style={{
                          fontSize: "13px",
                          fontFamily: "monospace",
                          fontWeight: row.dueSoon ? 700 : 400,
                          color: row.dueSoon
                            ? "var(--warn)"
                            : "var(--neutral-700)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {row.due}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>

                  {/* Format */}
                  <td className="px-4 py-3">
                    <FormatChip fmt={row.format} />
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        style={{
                          height: "28px",
                          padding: "0 10px",
                          fontSize: "12px",
                          fontWeight: 500,
                          borderRadius: "5px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--card)",
                          color: "var(--neutral-700)",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            "var(--neutral-100)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            "var(--card)";
                        }}
                      >
                        Preview
                      </button>
                      <button
                        style={{
                          height: "28px",
                          padding: "0 10px",
                          fontSize: "12px",
                          fontWeight: 500,
                          borderRadius: "5px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--card)",
                          color: "var(--neutral-700)",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            "var(--neutral-100)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            "var(--card)";
                        }}
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </button>
                      <button
                        style={{
                          height: "28px",
                          padding: "0 10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          borderRadius: "5px",
                          border: "none",
                          backgroundColor:
                            row.status === "healthy"
                              ? "var(--ok-bg)"
                              : "var(--primary-500)",
                          color:
                            row.status === "healthy"
                              ? "var(--ok)"
                              : "#ffffff",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          opacity: row.status === "healthy" ? 0.6 : 1,
                        }}
                        disabled={row.status === "healthy"}
                        onMouseEnter={(e) => {
                          if (row.status !== "healthy") {
                            (
                              e.currentTarget as HTMLElement
                            ).style.backgroundColor = "var(--primary-700)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (row.status !== "healthy") {
                            (
                              e.currentTarget as HTMLElement
                            ).style.backgroundColor = "var(--primary-500)";
                          }
                        }}
                      >
                        <Upload className="h-3 w-3" />
                        Submit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{
            borderTop: "1px solid var(--border)",
            backgroundColor: "var(--neutral-50)",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              fontFamily: "monospace",
              color: "var(--neutral-400)",
            }}
          >
            {OBLIGATIONS.length} obligations · 2 due soon
          </span>
          <div className="flex items-center gap-3">
            <span
              style={{
                fontSize: "11px",
                fontFamily: "monospace",
                color: "var(--neutral-400)",
              }}
            >
              FR-CMP-01 · SYS-08 · BR-04 · NFR-AUD-01
            </span>
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
