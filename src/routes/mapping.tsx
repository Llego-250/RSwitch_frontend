import { createFileRoute } from "@tanstack/react-router"
import { useState, useMemo } from "react"
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "@/components/AppShell"
import { StatusBadge } from "@/components/StatusBadge"
import {
  Plus,
  Edit2,
  Copy,
  Trash2,
  ChevronDown,
  ChevronRight,
  Check,
  AlertTriangle,
  GitBranch,
  Search,
  X,
  RotateCcw,
} from "lucide-react"

export const Route = createFileRoute("/mapping")({
  component: MappingPage,
})

/* ─── TYPES ─── */

type VersionEntry = { v: string; date: string; by: string }

type MappingRow = {
  id: string
  name: string
  src: string
  target: string
  version: string
  status: "healthy" | "warning" | "draft"
  updated: string
  fields: number
  mapped: number
  versions: VersionEntry[]
}

/* ─── STATIC DATA ─── */

const MAPPINGS: MappingRow[] = [
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
    versions: [
      { v: "v3.1", date: "2025-06-20", by: "architect" },
      { v: "v3.0", date: "2025-04-10", by: "architect" },
      { v: "v2.9", date: "2025-01-15", by: "lead-dev" },
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
    versions: [
      { v: "v2.0", date: "2025-06-18", by: "dev-1" },
      { v: "v1.9", date: "2025-03-22", by: "dev-1" },
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
    versions: [{ v: "v1.4", date: "2025-06-15", by: "analyst" }],
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
    versions: [],
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
    versions: [
      { v: "v2.1", date: "2025-06-22", by: "dev-2" },
      { v: "v2.0", date: "2025-04-01", by: "dev-2" },
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
    versions: [{ v: "v4.0", date: "2025-06-19", by: "compliance" }],
  },
]

const SOURCE_OPTIONS = [
  "Core Banking",
  "Mobile Money",
  "Credit Bureau",
  "ERP",
  "Payment GW",
  "Regulatory",
  "Custom",
]

const TARGET_OPTIONS = ["JSON", "ISO 20022", "XML", "CSV", "Custom"]

/* ─── MAIN COMPONENT ─── */

function MappingPage() {
  /* filter state */
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [standardFilter, setStandardFilter] = useState("All")

  /* expand state — only one row open at a time */
  const [expandedId, setExpandedId] = useState<string | null>(null)

  /* modal state */
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  /* new mapping form */
  const [newMapping, setNewMapping] = useState({
    name: "",
    src: "Core Banking",
    target: "JSON",
    version: "v1.0",
  })

  /* derived data */
  const filtered = useMemo(() => {
    return MAPPINGS.filter((r) => {
      const q = search.toLowerCase()
      const matchSearch =
        q === "" ||
        r.name.toLowerCase().includes(q) ||
        r.src.toLowerCase().includes(q) ||
        r.target.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      const matchStatus =
        statusFilter === "All" ||
        r.status === statusFilter.toLowerCase()
      const matchStandard =
        standardFilter === "All" || r.target === standardFilter
      return matchSearch && matchStatus && matchStandard
    })
  }, [search, statusFilter, standardFilter])

  const total = filtered.length
  const fullyMapped = filtered.filter((r) => r.mapped === r.fields).length
  const warnings = filtered.filter((r) => r.status === "warning").length
  const drafts = filtered.filter((r) => r.status === "draft").length

  const editingRow = editingId ? MAPPINGS.find((r) => r.id === editingId) : null
  const deleteRow = deleteId ? MAPPINGS.find((r) => r.id === deleteId) : null

  return (
    <AppShell
      title="Standards & Mapping"
      breadcrumb="CONNECT › MAPPING"
      primaryAction={
        <PrimaryButton
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setNewMapping({ name: "", src: "Core Banking", target: "JSON", version: "v1.0" })
            setShowNewModal(true)
          }}
        >
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

          {/* Standard select */}
          <div className="relative">
            <select
              value={standardFilter}
              onChange={(e) => setStandardFilter(e.target.value)}
              className="h-8 pl-3 pr-8 rounded-md text-[13px] appearance-none focus:outline-none cursor-pointer"
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--neutral-700)",
              }}
            >
              {["All", "ISO 20022", "JSON", "XML", "CSV"].map((s) => (
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
              {["All", "Healthy", "Warning", "Draft"].map((s) => (
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

          <span
            className="ml-auto font-mono text-[11px]"
            style={{ color: "var(--neutral-500)" }}
          >
            {filtered.length} of {MAPPINGS.length} shown
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-5">

        {/* ─── FIELD MAPPINGS TABLE ─── */}
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" style={{ color: "var(--primary-500)" }} />
              Field Mappings
            </span>
          }
          noPad
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "820px" }}>
              <thead
                style={{
                  backgroundColor: "var(--neutral-100)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <tr>
                  <th style={{ width: "40px" }} />
                  <th
                    className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)" }}
                  >
                    Name
                  </th>
                  <th
                    className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)", width: "130px" }}
                  >
                    Source
                  </th>
                  <th
                    className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)", width: "120px" }}
                  >
                    Target
                  </th>
                  <th
                    className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)", width: "100px" }}
                  >
                    Version
                  </th>
                  <th
                    className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)", width: "100px" }}
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)", width: "110px" }}
                  >
                    Mapped Fields
                  </th>
                  <th
                    className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)", width: "110px" }}
                  >
                    Updated
                  </th>
                  <th
                    className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)", width: "96px" }}
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
                      className="px-4 py-10 text-center text-sm"
                      style={{ color: "var(--neutral-400)" }}
                    >
                      No mappings match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const isExpanded = expandedId === row.id
                    const allMapped = row.mapped === row.fields
                    const mappedColor = allMapped ? "var(--ok)" : "var(--warn)"
                    const mappedBg = allMapped ? "var(--ok-bg)" : "var(--warn-bg)"

                    return (
                      <>
                        <tr
                          key={row.id}
                          className="hover:bg-(--neutral-50) cursor-pointer"
                          style={{
                            borderBottom: isExpanded
                              ? "none"
                              : "1px solid var(--border)",
                            backgroundColor: isExpanded
                              ? "var(--primary-50)"
                              : undefined,
                          }}
                        >
                          {/* Expand chevron */}
                          <td className="pl-3 py-3 w-10">
                            <button
                              onClick={() =>
                                setExpandedId(isExpanded ? null : row.id)
                              }
                              aria-label={
                                isExpanded ? "Collapse row" : "Expand row"
                              }
                              className="h-6 w-6 rounded flex items-center justify-center transition-colors"
                              style={{ color: "var(--neutral-400)" }}
                              onMouseEnter={(e) => {
                                ;(
                                  e.currentTarget as HTMLElement
                                ).style.backgroundColor = "var(--neutral-200)"
                                ;(
                                  e.currentTarget as HTMLElement
                                ).style.color = "var(--primary-500)"
                              }}
                              onMouseLeave={(e) => {
                                ;(
                                  e.currentTarget as HTMLElement
                                ).style.backgroundColor = "transparent"
                                ;(
                                  e.currentTarget as HTMLElement
                                ).style.color = "var(--neutral-400)"
                              }}
                            >
                              {isExpanded ? (
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
                              {row.id}
                            </div>
                          </td>

                          {/* Source */}
                          <td className="px-4 py-3">
                            <span
                              className="font-mono text-[11px] px-2 py-1 rounded inline-block"
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
                              className="font-mono text-[11px] px-2 py-1 rounded inline-block"
                              style={{
                                backgroundColor: "var(--primary-100)",
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

                          {/* Mapped fields */}
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center gap-1 font-mono text-[12px] font-semibold px-2 py-0.5 rounded"
                              style={{
                                color: mappedColor,
                                backgroundColor: mappedBg,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {allMapped && (
                                <Check
                                  className="h-3 w-3 shrink-0"
                                  style={{ color: mappedColor }}
                                />
                              )}
                              {row.mapped}/{row.fields}
                            </span>
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
                                title="Edit"
                                aria-label="Edit mapping"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingId(row.id)
                                }}
                                className="h-7 w-7 rounded flex items-center justify-center transition-colors"
                                style={{ color: "var(--neutral-400)" }}
                                onMouseEnter={(e) => {
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.backgroundColor =
                                    "var(--primary-100)"
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.color = "var(--primary-500)"
                                }}
                                onMouseLeave={(e) => {
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.backgroundColor = "transparent"
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.color = "var(--neutral-400)"
                                }}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>

                              <button
                                title="Duplicate"
                                aria-label="Duplicate mapping"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  alert(`Duplicated: ${row.name}`)
                                }}
                                className="h-7 w-7 rounded flex items-center justify-center transition-colors"
                                style={{ color: "var(--neutral-400)" }}
                                onMouseEnter={(e) => {
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.backgroundColor =
                                    "var(--neutral-100)"
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.color = "var(--neutral-700)"
                                }}
                                onMouseLeave={(e) => {
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.backgroundColor = "transparent"
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.color = "var(--neutral-400)"
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>

                              <button
                                title="Delete"
                                aria-label="Delete mapping"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteId(row.id)
                                }}
                                className="h-7 w-7 rounded flex items-center justify-center transition-colors"
                                style={{ color: "var(--neutral-400)" }}
                                onMouseEnter={(e) => {
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.backgroundColor = "var(--fail-bg)"
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.color = "var(--fail)"
                                }}
                                onMouseLeave={(e) => {
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.backgroundColor = "transparent"
                                  ;(
                                    e.currentTarget as HTMLElement
                                  ).style.color = "var(--neutral-400)"
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* ─── EXPANDED VERSION HISTORY ─── */}
                        {isExpanded && (
                          <tr
                            key={`${row.id}-expanded`}
                            style={{ borderBottom: "1px solid var(--border)" }}
                          >
                            <td
                              colSpan={9}
                              style={{
                                padding: 0,
                                backgroundColor: "var(--primary-50)",
                              }}
                            >
                              <div className="px-12 py-4">
                                <div
                                  className="text-[11px] font-mono uppercase tracking-wider mb-3"
                                  style={{ color: "var(--primary-500)" }}
                                >
                                  Version History — {row.name}
                                </div>
                                {row.versions.length === 0 ? (
                                  <p
                                    className="text-[12px] italic"
                                    style={{ color: "var(--neutral-400)" }}
                                  >
                                    No published versions yet.
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table
                                      className="w-full text-sm"
                                      style={{ minWidth: "520px" }}
                                    >
                                      <thead>
                                        <tr>
                                          {[
                                            "Version",
                                            "Date",
                                            "Author",
                                            "Actions",
                                          ].map((h) => (
                                            <th
                                              key={h}
                                              className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-wide"
                                              style={{
                                                color: "var(--neutral-500)",
                                                backgroundColor:
                                                  "var(--primary-100)",
                                                borderBottom:
                                                  "1px solid var(--border)",
                                              }}
                                            >
                                              {h}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.versions.map((ver, vi) => (
                                          <tr
                                            key={ver.v}
                                            style={{
                                              borderBottom:
                                                vi < row.versions.length - 1
                                                  ? "1px solid var(--border)"
                                                  : "none",
                                              backgroundColor:
                                                vi === 0
                                                  ? "var(--primary-50)"
                                                  : "var(--card)",
                                            }}
                                          >
                                            <td className="px-3 py-2">
                                              <span
                                                className="font-mono text-[12px]"
                                                style={{
                                                  color:
                                                    "var(--primary-700)",
                                                }}
                                              >
                                                {ver.v}
                                              </span>
                                              {vi === 0 && (
                                                <span
                                                  className="ml-2 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
                                                  style={{
                                                    backgroundColor:
                                                      "var(--primary-100)",
                                                    color:
                                                      "var(--primary-500)",
                                                  }}
                                                >
                                                  current
                                                </span>
                                              )}
                                            </td>
                                            <td
                                              className="px-3 py-2 font-mono text-[12px]"
                                              style={{
                                                color: "var(--neutral-500)",
                                              }}
                                            >
                                              {ver.date}
                                            </td>
                                            <td
                                              className="px-3 py-2 text-[12px]"
                                              style={{
                                                color: "var(--neutral-700)",
                                              }}
                                            >
                                              {ver.by}
                                            </td>
                                            <td className="px-3 py-2">
                                              <button
                                                onClick={() =>
                                                  alert(
                                                    `Restored to ${ver.v}`
                                                  )
                                                }
                                                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded transition-colors"
                                                style={{
                                                  color:
                                                    "var(--primary-500)",
                                                  backgroundColor:
                                                    "var(--primary-100)",
                                                  border:
                                                    "1px solid var(--primary-300)",
                                                }}
                                                onMouseEnter={(e) => {
                                                  ;(
                                                    e.currentTarget as HTMLElement
                                                  ).style.backgroundColor =
                                                    "var(--primary-500)"
                                                  ;(
                                                    e.currentTarget as HTMLElement
                                                  ).style.color = "#fff"
                                                }}
                                                onMouseLeave={(e) => {
                                                  ;(
                                                    e.currentTarget as HTMLElement
                                                  ).style.backgroundColor =
                                                    "var(--primary-100)"
                                                  ;(
                                                    e.currentTarget as HTMLElement
                                                  ).style.color =
                                                    "var(--primary-500)"
                                                }}
                                              >
                                                <RotateCcw className="h-3 w-3" />
                                                Restore
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ─── SUMMARY FOOTER ─── */}
          <div
            className="px-5 py-3 flex flex-wrap items-center gap-4 font-mono text-[12px]"
            style={{
              borderTop: "1px solid var(--border)",
              backgroundColor: "var(--neutral-50)",
              color: "var(--neutral-500)",
            }}
          >
            <span>
              <strong
                style={{
                  color: "var(--neutral-900)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {total}
              </strong>{" "}
              mappings
            </span>
            <span
              className="flex items-center gap-1"
              style={{ color: "var(--ok)" }}
            >
              <Check className="h-3 w-3" />
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                {fullyMapped}
              </strong>{" "}
              fully mapped
            </span>
            {warnings > 0 && (
              <span
                className="flex items-center gap-1"
                style={{ color: "var(--warn)" }}
              >
                <AlertTriangle className="h-3 w-3" />
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                  {warnings}
                </strong>{" "}
                with warnings
              </span>
            )}
            {drafts > 0 && (
              <span style={{ color: "var(--neutral-400)" }}>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                  {drafts}
                </strong>{" "}
                draft
              </span>
            )}
          </div>
        </SectionCard>

        {/* ─── STANDARDS COMPLIANCE PANEL ─── */}
        <SectionCard title="Standards Compliance">
          <div className="flex flex-col gap-3">
            {/* ISO 20022 */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-md"
              style={{ backgroundColor: "var(--ok-bg)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--ok)", color: "#fff" }}
                >
                  <Check className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div
                    className="font-semibold text-[13px]"
                    style={{ color: "var(--neutral-900)" }}
                  >
                    ISO 20022
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: "var(--ok)" }}
                  >
                    Compliant
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  alert("Compliance details for ISO 20022")
                }
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
                Details
              </button>
            </div>

            {/* FAPI 2.0 */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-md"
              style={{ backgroundColor: "var(--ok-bg)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--ok)", color: "#fff" }}
                >
                  <Check className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div
                    className="font-semibold text-[13px]"
                    style={{ color: "var(--neutral-900)" }}
                  >
                    FAPI 2.0
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: "var(--ok)" }}
                  >
                    Compliant
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  alert("Compliance details for FAPI 2.0")
                }
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
                Details
              </button>
            </div>

            {/* Open Banking API */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-md"
              style={{ backgroundColor: "var(--warn-bg)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--warn)", color: "#fff" }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div
                    className="font-semibold text-[13px]"
                    style={{ color: "var(--neutral-900)" }}
                  >
                    Open Banking API
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: "var(--warn)" }}
                  >
                    1 issue
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  alert("Compliance details for Open Banking API")
                }
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
                Details
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ═══════════════════════════════════
          NEW MAPPING MODAL
      ═══════════════════════════════════ */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2
                className="text-lg font-semibold"
                style={{ color: "var(--neutral-900)" }}
              >
                New Mapping
              </h2>
              <button
                onClick={() => setShowNewModal(false)}
                className="rounded-md p-1 transition-colors"
                style={{ color: "var(--neutral-400)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.color =
                    "var(--neutral-700)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.color =
                    "var(--neutral-400)")
                }
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Name */}
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Mapping Name
                </label>
                <input
                  type="text"
                  value={newMapping.name}
                  onChange={(e) =>
                    setNewMapping((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Savings Core → ISO 20022"
                  className="w-full h-9 px-3 rounded-md text-[13px] focus:outline-none focus:ring-2"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--neutral-900)",
                  }}
                />
              </div>

              {/* Source */}
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Source System
                </label>
                <div className="relative">
                  <select
                    value={newMapping.src}
                    onChange={(e) =>
                      setNewMapping((p) => ({ ...p, src: e.target.value }))
                    }
                    className="w-full h-9 pl-3 pr-8 rounded-md text-[13px] appearance-none focus:outline-none focus:ring-2 cursor-pointer"
                    style={{
                      border: "1px solid var(--border)",
                      color: "var(--neutral-900)",
                    }}
                  >
                    {SOURCE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
                    style={{ color: "var(--neutral-400)" }}
                  />
                </div>
              </div>

              {/* Target Standard */}
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Target Standard
                </label>
                <div className="relative">
                  <select
                    value={newMapping.target}
                    onChange={(e) =>
                      setNewMapping((p) => ({ ...p, target: e.target.value }))
                    }
                    className="w-full h-9 pl-3 pr-8 rounded-md text-[13px] appearance-none focus:outline-none focus:ring-2 cursor-pointer"
                    style={{
                      border: "1px solid var(--border)",
                      color: "var(--neutral-900)",
                    }}
                  >
                    {TARGET_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
                    style={{ color: "var(--neutral-400)" }}
                  />
                </div>
              </div>

              {/* Version */}
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Initial Version
                </label>
                <input
                  type="text"
                  value={newMapping.version}
                  onChange={(e) =>
                    setNewMapping((p) => ({ ...p, version: e.target.value }))
                  }
                  placeholder="v1.0"
                  className="w-full h-9 px-3 rounded-md font-mono text-[13px] focus:outline-none focus:ring-2"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--neutral-900)",
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <SecondaryButton onClick={() => setShowNewModal(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                onClick={() => {
                  setShowNewModal(false)
                  alert(
                    `Mapping created: ${newMapping.name || "(unnamed)"} · ${newMapping.src} → ${newMapping.target} · ${newMapping.version}`
                  )
                }}
              >
                Create Mapping
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          EDIT MODAL
      ═══════════════════════════════════ */}
      {editingId && editingRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setEditingId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--neutral-900)" }}
                >
                  Edit Mapping
                </h2>
                <div
                  className="font-mono text-[11px] mt-0.5"
                  style={{ color: "var(--neutral-400)" }}
                >
                  {editingRow.id}
                </div>
              </div>
              <button
                onClick={() => setEditingId(null)}
                className="rounded-md p-1 transition-colors"
                style={{ color: "var(--neutral-400)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.color =
                    "var(--neutral-700)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.color =
                    "var(--neutral-400)")
                }
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Mapping Name
                </label>
                <input
                  type="text"
                  defaultValue={editingRow.name}
                  className="w-full h-9 px-3 rounded-md text-[13px] focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--neutral-900)",
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="block text-[12px] font-medium mb-1.5 uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)" }}
                  >
                    Source
                  </label>
                  <input
                    type="text"
                    defaultValue={editingRow.src}
                    className="w-full h-9 px-3 rounded-md text-[13px] focus:outline-none"
                    style={{
                      border: "1px solid var(--border)",
                      color: "var(--neutral-900)",
                    }}
                  />
                </div>
                <div>
                  <label
                    className="block text-[12px] font-medium mb-1.5 uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)" }}
                  >
                    Version
                  </label>
                  <input
                    type="text"
                    defaultValue={editingRow.version}
                    className="w-full h-9 px-3 font-mono rounded-md text-[13px] focus:outline-none"
                    style={{
                      border: "1px solid var(--border)",
                      color: "var(--neutral-900)",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <SecondaryButton onClick={() => setEditingId(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                onClick={() => {
                  setEditingId(null)
                  alert(`Changes saved for ${editingRow.name}`)
                }}
              >
                Save Changes
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          DELETE CONFIRM MODAL
      ═══════════════════════════════════ */}
      {deleteId && deleteRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeleteId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-lg font-semibold"
                style={{ color: "var(--neutral-900)" }}
              >
                Delete mapping?
              </h2>
              <button
                onClick={() => setDeleteId(null)}
                className="rounded-md p-1 transition-colors"
                style={{ color: "var(--neutral-400)" }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="flex items-start gap-3 p-4 rounded-lg mb-5"
              style={{ backgroundColor: "var(--fail-bg)" }}
            >
              <AlertTriangle
                className="h-5 w-5 shrink-0 mt-0.5"
                style={{ color: "var(--fail)" }}
              />
              <div>
                <p
                  className="font-semibold text-[13px]"
                  style={{ color: "var(--neutral-900)" }}
                >
                  {deleteRow.name}
                </p>
                <p
                  className="text-[12px] mt-1"
                  style={{ color: "var(--neutral-600)" }}
                >
                  This cannot be undone. All {deleteRow.versions.length} version
                  {deleteRow.versions.length !== 1 ? "s" : ""} will be
                  permanently removed.
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <SecondaryButton onClick={() => setDeleteId(null)}>
                Cancel
              </SecondaryButton>
              <button
                onClick={() => {
                  setDeleteId(null)
                  alert(`Deleted: ${deleteRow.name}`)
                }}
                className="h-9 px-4 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 transition-opacity"
                style={{ backgroundColor: "var(--fail)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.opacity = "0.85")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.opacity = "1")
                }
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
