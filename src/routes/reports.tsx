import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  FilterChip,
  SectionCard,
} from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import {
  FileText,
  Download,
  Share2,
  Trash2,
  Eye,
  Plus,
  BarChart2,
  Clock,
  Search,
  AlertTriangle,
  ShieldCheck,
  Activity,
  Layers,
  Cpu,
} from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: Reports,
});

// ─── DATA ────────────────────────────────────────────────────────────────────

type ReportStatus = "completed" | "running" | "queued";
type ReportFormat = "PDF" | "XML" | "Excel" | "CSV";

interface Report {
  id: string;
  name: string;
  type: string;
  author: string;
  generated: string;
  status: ReportStatus;
  format: ReportFormat;
}

const REPORTS: Report[] = [
  {
    id: "RPT-001",
    name: "Q2 2025 Portfolio Risk Summary",
    type: "Risk",
    author: "You",
    generated: "Jun 25, 2025 09:14",
    status: "completed",
    format: "PDF",
  },
  {
    id: "RPT-002",
    name: "FSA Quarterly Regulatory Return",
    type: "Compliance",
    author: "You",
    generated: "Jun 24, 2025 14:32",
    status: "completed",
    format: "XML",
  },
  {
    id: "RPT-003",
    name: "Fraud Detection Monthly Report",
    type: "Operations",
    author: "J. Okello",
    generated: "Jun 23, 2025 11:00",
    status: "completed",
    format: "Excel",
  },
  {
    id: "RPT-004",
    name: "Financial Inclusion Impact Q2",
    type: "Analytics",
    author: "A. Mbeki",
    generated: "Jun 22, 2025 16:44",
    status: "completed",
    format: "PDF",
  },
  {
    id: "RPT-005",
    name: "Credit Bureau Reconciliation",
    type: "Risk",
    author: "You",
    generated: "Running...",
    status: "running",
    format: "CSV",
  },
  {
    id: "RPT-006",
    name: "AML Monthly Transaction Report",
    type: "Compliance",
    author: "Compliance",
    generated: "Scheduled",
    status: "queued",
    format: "CSV",
  },
  {
    id: "RPT-007",
    name: "Pipeline Throughput Report",
    type: "Operations",
    author: "System",
    generated: "Jun 20, 2025 08:00",
    status: "completed",
    format: "PDF",
  },
];

const TEMPLATES = [
  {
    id: "tpl-risk",
    icon: AlertTriangle,
    iconColor: "#E11D48",
    iconBg: "#FFE4E6",
    name: "Risk Summary",
    description:
      "Portfolio-wide risk exposure, credit quality breakdown, and VaR metrics across all active positions.",
  },
  {
    id: "tpl-compliance",
    icon: ShieldCheck,
    iconColor: "#2D6A9F",
    iconBg: "#E8F1FA",
    name: "Compliance Return",
    description:
      "Regulatory submission template pre-mapped to FSA/CBK schema requirements with validation checks.",
  },
  {
    id: "tpl-fraud",
    icon: Activity,
    iconColor: "#D97706",
    iconBg: "#FEF3C7",
    name: "Fraud Report",
    description:
      "Monthly fraud detection summary with case counts, typology breakdown, and resolution status.",
  },
  {
    id: "tpl-inclusion",
    icon: Layers,
    iconColor: "#0D9488",
    iconBg: "#CCFBF1",
    name: "Inclusion Impact",
    description:
      "Financial inclusion KPIs: account penetration, active usage rates, and underserved segment reach.",
  },
  {
    id: "tpl-ops",
    icon: Cpu,
    iconColor: "#7C3AED",
    iconBg: "#EDE9FE",
    name: "Operational Health",
    description:
      "Pipeline throughput, SLA adherence, data freshness indicators, and integration uptime across sources.",
  },
  {
    id: "tpl-custom",
    icon: FileText,
    iconColor: "#6B7280",
    iconBg: "#F3F4F6",
    name: "Custom",
    description:
      "Start from a blank canvas — select data sources, metrics, and layout sections to build your own.",
  },
];

const SCHEDULED = [
  {
    id: "SCH-001",
    name: "FSA Quarterly Regulatory Return",
    type: "Compliance",
    frequency: "Quarterly",
    nextRun: "Jul 01, 2025 06:00",
    status: "active" as const,
    format: "XML" as ReportFormat,
  },
  {
    id: "SCH-002",
    name: "AML Monthly Transaction Report",
    type: "Compliance",
    frequency: "Monthly",
    nextRun: "Jul 01, 2025 05:30",
    status: "active" as const,
    format: "CSV" as ReportFormat,
  },
  {
    id: "SCH-003",
    name: "Credit Bureau Reconciliation",
    type: "Risk",
    frequency: "Weekly",
    nextRun: "Jun 30, 2025 07:00",
    status: "running" as const,
    format: "CSV" as ReportFormat,
  },
  {
    id: "SCH-004",
    name: "Pipeline Throughput Report",
    type: "Operations",
    frequency: "Weekly",
    nextRun: "Jun 27, 2025 08:00",
    status: "active" as const,
    format: "PDF" as ReportFormat,
  },
];

// ─── TABS ─────────────────────────────────────────────────────────────────────

const TABS = ["My Reports", "Shared", "Templates", "Scheduled"] as const;
type Tab = (typeof TABS)[number];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const FORMAT_COLORS: Record<ReportFormat, { fg: string; bg: string }> = {
  PDF:   { fg: "#E11D48", bg: "#FFE4E6" },
  XML:   { fg: "#2D6A9F", bg: "#E8F1FA" },
  Excel: { fg: "#0D9488", bg: "#CCFBF1" },
  CSV:   { fg: "#D97706", bg: "#FEF3C7" },
};

const TYPE_COLORS: Record<string, { fg: string; bg: string }> = {
  Risk:       { fg: "#E11D48", bg: "#FFE4E6" },
  Compliance: { fg: "#2D6A9F", bg: "#E8F1FA" },
  Operations: { fg: "#7C3AED", bg: "#EDE9FE" },
  Analytics:  { fg: "#0D9488", bg: "#CCFBF1" },
};

function FormatChip({ fmt }: { fmt: ReportFormat }) {
  const c = FORMAT_COLORS[fmt] ?? { fg: "var(--neutral-500)", bg: "var(--neutral-100)" };
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

function TypeChip({ type }: { type: string }) {
  const c = TYPE_COLORS[type] ?? { fg: "var(--neutral-500)", bg: "var(--neutral-100)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "11px",
        fontWeight: 500,
        color: c.fg,
        backgroundColor: c.bg,
        borderRadius: "4px",
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {type}
    </span>
  );
}

function IconBtn({
  icon: Icon,
  label,
  danger,
}: {
  icon: typeof Eye;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: "28px",
        width: "28px",
        borderRadius: "5px",
        border: "1px solid var(--border)",
        backgroundColor: "var(--card)",
        color: danger ? "var(--fail)" : "var(--neutral-500)",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background-color 0.12s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = danger
          ? "var(--fail-bg)"
          : "var(--neutral-100)";
        (e.currentTarget as HTMLElement).style.color = danger
          ? "var(--fail)"
          : "var(--neutral-700)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "var(--card)";
        (e.currentTarget as HTMLElement).style.color = danger
          ? "var(--fail)"
          : "var(--neutral-500)";
      }}
    >
      <Icon style={{ width: "13px", height: "13px" }} />
    </button>
  );
}

// ─── TAB BAR ─────────────────────────────────────────────────────────────────

function TabBar({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0",
        borderBottom: "1px solid var(--border)",
        marginBottom: "20px",
      }}
    >
      {TABS.map((t) => {
        const isActive = t === active;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            style={{
              padding: "10px 16px",
              fontSize: "13.5px",
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--primary-500)" : "var(--neutral-500)",
              backgroundColor: "transparent",
              border: "none",
              borderBottom: isActive
                ? "2px solid var(--primary-500)"
                : "2px solid transparent",
              cursor: "pointer",
              transition: "color 0.12s",
              whiteSpace: "nowrap",
              marginBottom: "-1px",
            }}
            onMouseEnter={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLElement).style.color =
                  "var(--neutral-700)";
            }}
            onMouseLeave={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLElement).style.color =
                  "var(--neutral-500)";
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

// ─── MY REPORTS TAB ──────────────────────────────────────────────────────────

function MyReportsTab({
  typeFilter,
  statusFilter,
  search,
}: {
  typeFilter: string;
  statusFilter: string;
  search: string;
}) {
  const filtered = REPORTS.filter((r) => {
    const matchType =
      typeFilter === "All" || r.type === typeFilter;
    const matchStatus =
      statusFilter === "All" ||
      r.status === statusFilter.toLowerCase();
    const matchSearch =
      search === "" ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.id.toLowerCase().includes(search.toLowerCase());
    return matchType && matchStatus && matchSearch;
  });

  return (
    <SectionCard
      title={
        <div className="flex items-center gap-2">
          <FileText
            className="h-4 w-4"
            style={{ color: "var(--neutral-400)" }}
          />
          <span>My Reports</span>
          <span
            style={{
              fontSize: "11px",
              fontFamily: "monospace",
              color: "var(--neutral-400)",
              marginLeft: "2px",
            }}
          >
            {filtered.length} of {REPORTS.length}
          </span>
        </div>
      }
      action={
        <SecondaryButton icon={<Download style={{ width: "13px", height: "13px" }} />}>
          Export List
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
                "Type",
                "Created By",
                "Generated",
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
            {filtered.map((row, i) => (
              <tr
                key={row.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  backgroundColor:
                    i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                }}
              >
                {/* Report Name */}
                <td className="px-4 py-3" style={{ minWidth: "220px" }}>
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

                {/* Type */}
                <td className="px-4 py-3" style={{ whiteSpace: "nowrap" }}>
                  <TypeChip type={row.type} />
                </td>

                {/* Created By */}
                <td
                  className="px-4 py-3"
                  style={{
                    fontSize: "13px",
                    color:
                      row.author === "You"
                        ? "var(--primary-500)"
                        : "var(--neutral-700)",
                    fontWeight: row.author === "You" ? 500 : 400,
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.author}
                </td>

                {/* Generated */}
                <td
                  className="px-4 py-3"
                  style={{
                    fontSize: "12px",
                    fontFamily: "monospace",
                    color:
                      row.status === "running"
                        ? "var(--primary-500)"
                        : row.status === "queued"
                        ? "var(--warn)"
                        : "var(--neutral-500)",
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {row.generated}
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
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <IconBtn icon={Eye} label="Preview" />
                    <IconBtn icon={Download} label="Download" />
                    <IconBtn icon={Share2} label="Share" />
                    <IconBtn icon={Trash2} label="Delete" danger />
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: "40px 16px",
                    textAlign: "center",
                    color: "var(--neutral-400)",
                    fontSize: "13px",
                  }}
                >
                  No reports match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Table footer */}
      <div
        style={{
          padding: "10px 20px",
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--neutral-50)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontFamily: "monospace",
            color: "var(--neutral-400)",
          }}
        >
          {filtered.length} report{filtered.length !== 1 ? "s" : ""} ·{" "}
          {REPORTS.filter((r) => r.status === "completed").length} completed ·{" "}
          {REPORTS.filter((r) => r.status === "running").length} running ·{" "}
          {REPORTS.filter((r) => r.status === "queued").length} queued
        </span>
        <span
          style={{
            fontSize: "11px",
            fontFamily: "monospace",
            color: "var(--neutral-400)",
          }}
        >
          FR-REP-01 · SYS-14 · BR-09
        </span>
      </div>
    </SectionCard>
  );
}

// ─── SHARED TAB ──────────────────────────────────────────────────────────────

function SharedTab() {
  const sharedReports = REPORTS.filter((r) => r.author !== "You" && r.author !== "System");

  return (
    <SectionCard
      title={
        <div className="flex items-center gap-2">
          <Share2
            className="h-4 w-4"
            style={{ color: "var(--neutral-400)" }}
          />
          <span>Shared With Me</span>
          <span
            style={{
              fontSize: "11px",
              fontFamily: "monospace",
              color: "var(--neutral-400)",
              marginLeft: "2px",
            }}
          >
            {sharedReports.length}
          </span>
        </div>
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
              {["Report Name", "Type", "Shared By", "Generated", "Status", "Format", "Actions"].map(
                (col) => (
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
                )
              )}
            </tr>
          </thead>
          <tbody>
            {sharedReports.map((row, i) => (
              <tr
                key={row.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  backgroundColor:
                    i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                }}
              >
                <td className="px-4 py-3" style={{ minWidth: "220px" }}>
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
                <td className="px-4 py-3">
                  <TypeChip type={row.type} />
                </td>
                <td
                  className="px-4 py-3"
                  style={{
                    fontSize: "13px",
                    color: "var(--neutral-700)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.author}
                </td>
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
                  {row.generated}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3">
                  <FormatChip fmt={row.format} />
                </td>
                <td className="px-4 py-3">
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <IconBtn icon={Eye} label="Preview" />
                    <IconBtn icon={Download} label="Download" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── TEMPLATES TAB ───────────────────────────────────────────────────────────

function TemplatesTab() {
  return (
    <div>
      <div
        style={{
          marginBottom: "16px",
          fontSize: "13px",
          color: "var(--neutral-500)",
        }}
      >
        Start from a pre-built template to accelerate report creation. Each
        template is pre-wired to the relevant data sources and regulatory
        schemas.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "16px",
        }}
      >
        {TEMPLATES.map((tpl) => {
          const Icon = tpl.icon;
          return (
            <div
              key={tpl.id}
              style={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {/* Icon + Name */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "8px",
                    backgroundColor: tpl.iconBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon
                    style={{
                      width: "18px",
                      height: "18px",
                      color: tpl.iconColor,
                    }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--neutral-900)",
                      lineHeight: 1.3,
                    }}
                  >
                    {tpl.name}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p
                style={{
                  fontSize: "12.5px",
                  color: "var(--neutral-500)",
                  lineHeight: 1.55,
                  margin: 0,
                  flexGrow: 1,
                }}
              >
                {tpl.description}
              </p>

              {/* Use Template button */}
              <button
                style={{
                  height: "32px",
                  paddingLeft: "14px",
                  paddingRight: "14px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  fontSize: "12.5px",
                  fontWeight: 500,
                  color: "var(--primary-500)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  alignSelf: "flex-start",
                  transition: "background-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "var(--primary-50)";
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "var(--primary-500)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "var(--card)";
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "var(--border)";
                }}
              >
                <Plus style={{ width: "12px", height: "12px" }} />
                Use Template
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SCHEDULED TAB ───────────────────────────────────────────────────────────

function ScheduledTab() {
  return (
    <SectionCard
      title={
        <div className="flex items-center gap-2">
          <Clock
            className="h-4 w-4"
            style={{ color: "var(--neutral-400)" }}
          />
          <span>Scheduled Reports</span>
          <span
            style={{
              fontSize: "11px",
              fontFamily: "monospace",
              color: "var(--neutral-400)",
              marginLeft: "2px",
            }}
          >
            {SCHEDULED.length} active schedules
          </span>
        </div>
      }
      action={
        <PrimaryButton icon={<Plus style={{ width: "13px", height: "13px" }} />}>
          New Schedule
        </PrimaryButton>
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
                "Type",
                "Frequency",
                "Next Run",
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
            {SCHEDULED.map((row, i) => (
              <tr
                key={row.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  backgroundColor:
                    i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                }}
              >
                {/* Report Name */}
                <td className="px-4 py-3" style={{ minWidth: "220px" }}>
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

                {/* Type */}
                <td className="px-4 py-3">
                  <TypeChip type={row.type} />
                </td>

                {/* Frequency */}
                <td
                  className="px-4 py-3"
                  style={{
                    fontSize: "12px",
                    fontFamily: "monospace",
                    color: "var(--neutral-700)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.frequency}
                </td>

                {/* Next Run */}
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
                  {row.nextRun}
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
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <IconBtn icon={Eye} label="Preview" />
                    <IconBtn icon={BarChart2} label="History" />
                    <IconBtn icon={Trash2} label="Remove schedule" danger />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 20px",
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--neutral-50)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontFamily: "monospace",
            color: "var(--neutral-400)",
          }}
        >
          {SCHEDULED.length} scheduled · all times in UTC
        </span>
        <span
          style={{
            fontSize: "11px",
            fontFamily: "monospace",
            color: "var(--neutral-400)",
          }}
        >
          FR-REP-02 · SYS-15
        </span>
      </div>
    </SectionCard>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

function Reports() {
  const [activeTab, setActiveTab] = useState<Tab>("My Reports");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const typeOptions = ["All", "Risk", "Compliance", "Operations", "Custom"];
  const statusOptions = ["All", "Completed", "Running", "Queued"];

  return (
    <AppShell
      title="Reports Workspace"
      breadcrumb="DECIDE › REPORTS"
      scope="FDIF · Reports Module"
      primaryAction={
        <PrimaryButton icon={<Plus style={{ width: "13px", height: "13px" }} />}>
          Create Report
        </PrimaryButton>
      }
      toolbar={
        <>
          {/* Search */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search
              style={{
                position: "absolute",
                left: "10px",
                width: "14px",
                height: "14px",
                color: "var(--neutral-400)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              placeholder="Search reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                height: "32px",
                paddingLeft: "30px",
                paddingRight: "10px",
                width: "220px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                fontSize: "13px",
                color: "var(--neutral-900)",
                outline: "none",
              }}
            />
          </div>

          {/* Type filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "monospace",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--neutral-400)",
              }}
            >
              Type
            </span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                height: "32px",
                paddingLeft: "8px",
                paddingRight: "24px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                fontSize: "13px",
                color: "var(--neutral-900)",
                cursor: "pointer",
                appearance: "none",
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 7px center",
                outline: "none",
              }}
            >
              {typeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "monospace",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--neutral-400)",
              }}
            >
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                height: "32px",
                paddingLeft: "8px",
                paddingRight: "24px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                fontSize: "13px",
                color: "var(--neutral-900)",
                cursor: "pointer",
                appearance: "none",
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 7px center",
                outline: "none",
              }}
            >
              {statusOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </>
      }
    >
      {/* Tab switcher */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      {activeTab === "My Reports" && (
        <MyReportsTab
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          search={search}
        />
      )}
      {activeTab === "Shared" && <SharedTab />}
      {activeTab === "Templates" && <TemplatesTab />}
      {activeTab === "Scheduled" && <ScheduledTab />}
    </AppShell>
  );
}
