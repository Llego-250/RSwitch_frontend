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
  Check,
  AlertTriangle,
  X,
  Plus,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Pencil,
  Copy,
  Trash2,
  Search,
} from "lucide-react";

export const Route = createFileRoute("/mapping")({
  component: MappingWorkspace,
});

/* ─── DATA ─── */

type MappingRow = {
  id: string;
  name: string;
  src: string;
  target: string;
  version: string;
  status: "healthy" | "warning" | "draft";
  updated: string;
  fields: number;
  mapped: number;
  history: { version: string; date: string; author: string; note: string }[];
};

const MAPPING_DATA: MappingRow[] = [
  {
    id: "M-001",
    name: "Core Banking → ISO 20022",
    src: "Core Banking",
    target: "ISO 20022",
    version: "v3.1",
    status: "healthy",
    updated: "2025-06-20",
    fields: 42,
    mapped: 42,
    history: [
      { version: "v3.1", date: "2025-06-20", author: "A. Mwangi", note: "Added IBAN validation rule" },
      { version: "v3.0", date: "2025-05-12", author: "S. Kariuki", note: "Migrated to pacs.008 schema" },
      { version: "v2.9", date: "2025-03-01", author: "A. Mwangi", note: "Hotfix: currency decimals" },
    ],
  },
  {
    id: "M-002",
    name: "Mobile Money → JSON Canonical",
    src: "Mobile Money",
    target: "JSON",
    version: "v2.0",
    status: "healthy",
    updated: "2025-06-18",
    fields: 28,
    mapped: 28,
    history: [
      { version: "v2.0", date: "2025-06-18", author: "J. Oduya", note: "Full field coverage reached" },
      { version: "v1.5", date: "2025-04-07", author: "J. Oduya", note: "Added wallet_type enum" },
    ],
  },
  {
    id: "M-003",
    name: "Credit Bureau → Canonical",
    src: "Credit Bureau",
    target: "CSV",
    version: "v1.4",
    status: "warning",
    updated: "2025-06-15",
    fields: 31,
    mapped: 29,
    history: [
      { version: "v1.4", date: "2025-06-15", author: "M. Njeru", note: "2 fields pending bureau confirmation" },
      { version: "v1.3", date: "2025-05-20", author: "M. Njeru", note: "Added delinquency_score" },
      { version: "v1.2", date: "2025-04-01", author: "S. Kariuki", note: "Initial production release" },
    ],
  },
  {
    id: "M-004",
    name: "ERP Ledger → ISO 20022",
    src: "ERP",
    target: "ISO 20022",
    version: "v1.0-draft",
    status: "draft",
    updated: "2025-06-10",
    fields: 18,
    mapped: 14,
    history: [
      { version: "v1.0-draft", date: "2025-06-10", author: "A. Mwangi", note: "First draft — GL codes TBD" },
    ],
  },
  {
    id: "M-005",
    name: "Payment Gateway → JSON",
    src: "Payment GW",
    target: "JSON",
    version: "v2.1",
    status: "healthy",
    updated: "2025-06-22",
    fields: 22,
    mapped: 22,
    history: [
      { version: "v2.1", date: "2025-06-22", author: "J. Oduya", note: "3DS2 auth fields added" },
      { version: "v2.0", date: "2025-05-30", author: "J. Oduya", note: "Restructured response envelope" },
    ],
  },
  {
    id: "M-006",
    name: "Regulatory Feed → XML",
    src: "Regulatory",
    target: "XML",
    version: "v4.0",
    status: "healthy",
    updated: "2025-06-19",
    fields: 55,
    mapped: 55,
    history: [
      { version: "v4.0", date: "2025-06-19", author: "S. Kariuki", note: "Aligned with CBK Directive 2025-04" },
      { version: "v3.8", date: "2025-03-15", author: "M. Njeru", note: "AML field extensions" },
      { version: "v3.5", date: "2025-01-10", author: "S. Kariuki", note: "Baseline regulatory fields" },
    ],
  },
];

const TARGET_STANDARDS = ["All", "ISO 20022", "JSON", "XML", "CSV", "Custom"];
const STATUS_OPTIONS = ["All", "Healthy", "Warning", "Draft"];

/* ─── SUB-COMPONENTS ─── */

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  const color = pct === 100 ? "var(--ok)" : pct >= 80 ? "var(--warn)" : "var(--fail)";
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--neutral-200)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="font-mono text-[11px] tabular w-[30px] text-right shrink-0"
        style={{ color: "var(--neutral-500)" }}
      >
        {pct}%
      </span>
    </div>
  );
}

function SummaryRow({ data }: { data: MappingRow[] }) {
  const total = data.length;
  const fullyMapped = data.filter((r) => r.mapped === r.fields).length;
  const withWarnings = data.filter((r) => r.status === "warning").length;
  const draft = data.filter((r) => r.status === "draft").length;

  const pills: { label: string; value: number; color: string; bg: string }[] = [
    { label: "Total mappings", value: total, color: "var(--neutral-700)", bg: "var(--neutral-100)" },
    { label: "Fully mapped", value: fullyMapped, color: "var(--ok)", bg: "var(--ok-bg)" },
    { label: "With warnings", value: withWarnings, color: "var(--warn)", bg: "var(--warn-bg)" },
    { label: "Draft", value: draft, color: "var(--neutral-500)", bg: "var(--neutral-100)" },
  ];

  return (
    <div
      className="flex flex-wrap gap-3 px-5 py-3"
      style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--neutral-50)" }}
    >
      {pills.map((p) => (
        <div
          key={p.label}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md"
          style={{ backgroundColor: p.bg }}
        >
          <span
            className="font-mono text-[15px] font-semibold tabular leading-none"
            style={{ color: p.color }}
          >
            {p.value}
          </span>
          <span className="text-[12px]" style={{ color: "var(--neutral-600)" }}>
            {p.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function HistorySubRow({ row }: { row: MappingRow }) {
  return (
    <tr>
      <td colSpan={7} style={{ padding: 0, backgroundColor: "var(--primary-50)" }}>
        <div className="px-12 py-3">
          <div
            className="text-[11px] font-mono uppercase tracking-wider mb-2"
            style={{ color: "var(--neutral-500)" }}
          >
            Version History — {row.name}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {["Version", "Published", "Author", "Change note"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-wide"
                      style={{
                        color: "var(--neutral-500)",
                        backgroundColor: "var(--primary-100)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {row.history.map((h, i) => (
                  <tr
                    key={h.version}
                    style={{
                      borderBottom: i < row.history.length - 1 ? "1px solid var(--border)" : "none",
                      backgroundColor: i === 0 ? "var(--primary-50)" : "var(--card)",
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-[12px]" style={{ color: "var(--primary-700)" }}>
                      {h.version}
                      {i === 0 && (
                        <span
                          className="ml-2 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "var(--primary-100)", color: "var(--primary-500)" }}
                        >
                          current
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px]" style={{ color: "var(--neutral-500)" }}>
                      {h.date}
                    </td>
                    <td className="px-3 py-2 text-[12px]" style={{ color: "var(--neutral-700)" }}>
                      {h.author}
                    </td>
                    <td className="px-3 py-2 text-[12px]" style={{ color: "var(--neutral-700)" }}>
                      {h.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ─── MAIN COMPONENT ─── */

function MappingWorkspace() {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const filtered = MAPPING_DATA.filter((r) => {
    const matchesSearch =
      search.trim() === "" ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.src.toLowerCase().includes(search.toLowerCase()) ||
      r.target.toLowerCase().includes(search.toLowerCase());
    const matchesTarget =
      targetFilter === "All" || r.target === targetFilter;
    const matchesStatus =
      statusFilter === "All" ||
      r.status === statusFilter.toLowerCase();
    return matchesSearch && matchesTarget && matchesStatus;
  });

  const COLS = [
    { label: "", width: "40px" },
    { label: "Mapping Name", width: "" },
    { label: "Source Type", width: "140px" },
    { label: "Target Standard", width: "140px" },
    { label: "Version", width: "110px" },
    { label: "Status", width: "110px" },
    { label: "Coverage", width: "130px" },
    { label: "Last Updated", width: "120px" },
    { label: "Actions", width: "100px" },
  ];

  return (
    <AppShell
      title="Standards & Mapping"
      breadcrumb="CONNECT › MAPPING"
      scope="all sources"
      primaryAction={
        <PrimaryButton icon={<Plus className="h-4 w-4" />}>
          New Mapping
        </PrimaryButton>
      }
      toolbar={
        <>
          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
              style={{ color: "var(--neutral-400)" }}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mappings…"
              className="h-8 pl-8 pr-3 rounded-md text-[13px] focus:outline-none"
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--neutral-900)",
                width: "220px",
              }}
            />
          </div>

          {/* Standard type select */}
          <div className="relative">
            <select
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value)}
              className="h-8 pl-3 pr-8 rounded-md text-[13px] appearance-none focus:outline-none cursor-pointer"
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--neutral-700)",
              }}
            >
              {TARGET_STANDARDS.map((s) => (
                <option key={s} value={s}>
                  {s === "All" ? "Standard: All" : s}
                </option>
              ))}
            </select>
            <ChevronDown
              className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
              style={{ color: "var(--neutral-400)" }}
            />
          </div>

          {/* Status select */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 pl-3 pr-8 rounded-md text-[13px] appearance-none focus:outline-none cursor-pointer"
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--neutral-700)",
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === "All" ? "Status: All" : s}
                </option>
              ))}
            </select>
            <ChevronDown
              className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
              style={{ color: "var(--neutral-400)" }}
            />
          </div>

          <span className="ml-auto font-mono text-[11px]" style={{ color: "var(--neutral-500)" }}>
            {filtered.length} of {MAPPING_DATA.length} mappings
          </span>
        </>
      }
    >
      {/* ─── TWO-COLUMN LAYOUT: table 70% + sidebar 30% ─── */}
      <div className="flex gap-5 items-start">

        {/* ─── LEFT: Field Mappings table ─── */}
        <div className="flex-1 min-w-0">
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" style={{ color: "var(--primary-500)" }} />
                Field Mappings
              </span>
            }
            action={
              <SecondaryButton icon={<Plus className="h-3.5 w-3.5" />}>
                Import
              </SecondaryButton>
            }
            noPad
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "780px" }}>
                <thead
                  style={{
                    backgroundColor: "var(--neutral-100)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <tr>
                    {/* expand toggle col */}
                    <th style={{ width: "40px" }} />
                    <th
                      className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)" }}
                    >
                      Mapping Name
                    </th>
                    <th
                      className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)", width: "130px" }}
                    >
                      Source Type
                    </th>
                    <th
                      className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)", width: "130px" }}
                    >
                      Target Standard
                    </th>
                    <th
                      className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)", width: "100px" }}
                    >
                      Version
                    </th>
                    <th
                      className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)", width: "100px" }}
                    >
                      Status
                    </th>
                    <th
                      className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)", width: "120px" }}
                    >
                      Coverage
                    </th>
                    <th
                      className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)", width: "110px" }}
                    >
                      Last Updated
                    </th>
                    <th
                      className="text-right px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)", width: "90px" }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-8 text-center text-sm"
                        style={{ color: "var(--neutral-500)" }}
                      >
                        No mappings match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row, i) => {
                      const expanded = expandedRows.has(row.id);
                      const coveragePct =
                        row.fields === 0
                          ? 0
                          : Math.round((row.mapped / row.fields) * 100);
                      return (
                        <>
                          <tr
                            key={row.id}
                            style={{
                              borderBottom: expanded ? "none" : "1px solid var(--border)",
                              backgroundColor:
                                expanded
                                  ? "var(--primary-50)"
                                  : i % 2 === 0
                                  ? "transparent"
                                  : "var(--neutral-50)",
                            }}
                          >
                            {/* Expand chevron */}
                            <td className="pl-4 pr-0 py-3 w-[40px]">
                              <button
                                onClick={() => toggleRow(row.id)}
                                aria-label={expanded ? "Collapse row" : "Expand row"}
                                className="h-6 w-6 rounded flex items-center justify-center transition-colors"
                                style={{ color: "var(--neutral-400)" }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.backgroundColor =
                                    "var(--neutral-200)";
                                  (e.currentTarget as HTMLElement).style.color =
                                    "var(--primary-500)";
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.backgroundColor =
                                    "transparent";
                                  (e.currentTarget as HTMLElement).style.color =
                                    "var(--neutral-400)";
                                }}
                              >
                                {expanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </td>

                            {/* Name */}
                            <td className="px-4 py-3">
                              <div
                                className="font-medium text-[13px]"
                                style={{ color: "var(--neutral-900)" }}
                              >
                                {row.name}
                              </div>
                              <div
                                className="font-mono text-[11px] mt-0.5"
                                style={{ color: "var(--neutral-400)" }}
                              >
                                {row.id} · {row.mapped}/{row.fields} fields
                              </div>
                            </td>

                            {/* Source */}
                            <td className="px-4 py-3">
                              <span
                                className="inline-block font-mono text-[11px] px-2 py-1 rounded"
                                style={{
                                  backgroundColor: "var(--neutral-100)",
                                  color: "var(--neutral-700)",
                                }}
                              >
                                {row.src}
                              </span>
                            </td>

                            {/* Target */}
                            <td className="px-4 py-3">
                              <span
                                className="inline-block font-mono text-[11px] px-2 py-1 rounded"
                                style={{
                                  backgroundColor: "var(--info-bg)",
                                  color: "var(--primary-700)",
                                }}
                              >
                                {row.target}
                              </span>
                            </td>

                            {/* Version */}
                            <td
                              className="px-4 py-3 font-mono text-[12px]"
                              style={{ color: "var(--neutral-500)" }}
                            >
                              {row.version}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <StatusBadge status={row.status} />
                            </td>

                            {/* Coverage bar */}
                            <td className="px-4 py-3" style={{ minWidth: "120px" }}>
                              <ProgressBar value={row.mapped} max={row.fields} />
                            </td>

                            {/* Updated */}
                            <td
                              className="px-4 py-3 font-mono text-[12px]"
                              style={{ color: "var(--neutral-500)" }}
                            >
                              {row.updated}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  aria-label="Edit mapping"
                                  title="Edit"
                                  className="h-7 w-7 rounded flex items-center justify-center transition-colors"
                                  style={{ color: "var(--neutral-400)" }}
                                  onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor =
                                      "var(--primary-100)";
                                    (e.currentTarget as HTMLElement).style.color =
                                      "var(--primary-500)";
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor =
                                      "transparent";
                                    (e.currentTarget as HTMLElement).style.color =
                                      "var(--neutral-400)";
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  aria-label="Duplicate mapping"
                                  title="Duplicate"
                                  className="h-7 w-7 rounded flex items-center justify-center transition-colors"
                                  style={{ color: "var(--neutral-400)" }}
                                  onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor =
                                      "var(--neutral-100)";
                                    (e.currentTarget as HTMLElement).style.color =
                                      "var(--neutral-700)";
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor =
                                      "transparent";
                                    (e.currentTarget as HTMLElement).style.color =
                                      "var(--neutral-400)";
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  aria-label="Delete mapping"
                                  title="Delete"
                                  className="h-7 w-7 rounded flex items-center justify-center transition-colors"
                                  style={{ color: "var(--neutral-400)" }}
                                  onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor =
                                      "var(--fail-bg)";
                                    (e.currentTarget as HTMLElement).style.color =
                                      "var(--fail)";
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor =
                                      "transparent";
                                    (e.currentTarget as HTMLElement).style.color =
                                      "var(--neutral-400)";
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expandable history sub-row */}
                          {expanded && <HistorySubRow key={`${row.id}-history`} row={row} />}
                        </>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary footer row */}
            <SummaryRow data={filtered} />
          </SectionCard>
        </div>

        {/* ─── RIGHT SIDEBAR: Standards Compliance ─── */}
        <aside style={{ width: "280px", flexShrink: 0 }}>
          <SectionCard title="Standards Compliance">
            <div className="space-y-4">
              {/* Pillar 1 */}
              <div
                className="flex items-start gap-3 p-3 rounded-md"
                style={{ backgroundColor: "var(--ok-bg)" }}
              >
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: "var(--ok)", color: "#fff" }}
                >
                  <Check className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-[13px]" style={{ color: "var(--neutral-900)" }}>
                    ISO 20022 Payment Messaging
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--ok)" }}>
                    Compliant
                  </div>
                  <div
                    className="font-mono text-[11px] mt-1"
                    style={{ color: "var(--neutral-500)" }}
                  >
                    pacs.008, pain.001, camt.053
                  </div>
                </div>
              </div>

              {/* Pillar 2 */}
              <div
                className="flex items-start gap-3 p-3 rounded-md"
                style={{ backgroundColor: "var(--ok-bg)" }}
              >
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: "var(--ok)", color: "#fff" }}
                >
                  <Check className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-[13px]" style={{ color: "var(--neutral-900)" }}>
                    FAPI 2.0 Security Profile
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--ok)" }}>
                    Compliant
                  </div>
                  <div
                    className="font-mono text-[11px] mt-1"
                    style={{ color: "var(--neutral-500)" }}
                  >
                    PAR + DPoP · last audited 2025-06-01
                  </div>
                </div>
              </div>

              {/* Pillar 3 — warning */}
              <div
                className="flex items-start gap-3 p-3 rounded-md"
                style={{ backgroundColor: "var(--warn-bg)" }}
              >
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: "var(--warn)", color: "#fff" }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-[13px]" style={{ color: "var(--neutral-900)" }}>
                    Open Banking API
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--warn)" }}>
                    1 warning
                  </div>
                  <div
                    className="font-mono text-[11px] mt-1"
                    style={{ color: "var(--neutral-600)" }}
                  >
                    Credit Bureau schema v1.4 not fully mapped — 2 fields pending
                  </div>
                </div>
              </div>

              {/* Divider + quick stats */}
              <div
                className="pt-3 mt-1"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <div
                  className="text-[11px] font-mono uppercase tracking-wider mb-3"
                  style={{ color: "var(--neutral-400)" }}
                >
                  Mapping Coverage
                </div>
                <div className="space-y-2.5">
                  {MAPPING_DATA.filter((r) => r.status !== "draft").map((r) => {
                    const pct = Math.round((r.mapped / r.fields) * 100);
                    return (
                      <div key={r.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="text-[12px] truncate"
                            style={{ color: "var(--neutral-700)", maxWidth: "160px" }}
                          >
                            {r.src}
                          </span>
                          <span
                            className="font-mono text-[11px] tabular shrink-0"
                            style={{
                              color:
                                pct === 100
                                  ? "var(--ok)"
                                  : "var(--warn)",
                            }}
                          >
                            {r.mapped}/{r.fields}
                          </span>
                        </div>
                        <div
                          className="h-1 rounded-full overflow-hidden"
                          style={{ backgroundColor: "var(--neutral-200)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct === 100 ? "var(--ok)" : "var(--warn)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </SectionCard>
        </aside>
      </div>
    </AppShell>
  );
}
