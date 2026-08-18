import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
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
  CheckCircle2,
  Lock,
} from "lucide-react";

export const Route = createFileRoute("/mapping")({
  component: MappingPage,
});

type VersionEntry = { v: string; date: string; by: string };

type FieldRule = {
  id: string;
  sourceField: string;
  targetField: string;
  transform: string;
  mapped: boolean;
};

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
  versions: VersionEntry[];
  rules: FieldRule[];
};

const INITIAL_MAPPINGS: MappingRow[] = [
  {
    id: "M-001",
    name: "Core Banking → ISO 20022 Canonical",
    src: "Bank of Kigali Core",
    target: "ISO 20022 XML",
    version: "v3.1",
    status: "healthy",
    updated: "2026-07-20",
    fields: 42,
    mapped: 42,
    versions: [
      { v: "v3.1", date: "2026-07-20", by: "Technical Lead" },
      { v: "v3.0", date: "2026-04-10", by: "Technical Lead" },
      { v: "v2.9", date: "2026-01-15", by: "Data Architect" },
    ],
    rules: [
      { id: "r1", sourceField: "account_no", targetField: "DbtrAcct.Id.Othr.Id", transform: "Direct Copy", mapped: true },
      { id: "r2", sourceField: "tx_amount", targetField: "IntrBkSttlmAmt", transform: "Decimal(18,2)", mapped: true },
      { id: "r3", sourceField: "currency_code", targetField: "IntrBkSttlmAmt.Ccy", transform: "Uppercase ISO-4217", mapped: true },
    ],
  },
  {
    id: "M-002",
    name: "Mobile Money → JSON Canonical",
    src: "MTN MoMo Feed",
    target: "JSON Canonical",
    version: "v2.0",
    status: "healthy",
    updated: "2026-07-18",
    fields: 28,
    mapped: 28,
    versions: [
      { v: "v2.0", date: "2026-07-18", by: "Integration Engineer" },
    ],
    rules: [
      { id: "r4", sourceField: "msisdn", targetField: "payer_phone_hash", transform: "SHA-256 Masked", mapped: true },
      { id: "r5", sourceField: "transaction_id", targetField: "switch_tx_id", transform: "UUID Prefix", mapped: true },
    ],
  },
  {
    id: "M-003",
    name: "Inkomoko MFI → RDIP Standard",
    src: "Inkomoko MFI",
    target: "CSV Canonical",
    version: "v1.4",
    status: "warning",
    updated: "2026-07-15",
    fields: 31,
    mapped: 29,
    versions: [{ v: "v1.4", date: "2026-07-15", by: "Data Architect" }],
    rules: [
      { id: "r6", sourceField: "tin_no", targetField: "tax_id", transform: "Regex 9-digit", mapped: true },
      { id: "r7", sourceField: "par_30", targetField: "portfolio_at_risk", transform: "Percentage", mapped: true },
      { id: "r8", sourceField: "collateral_type", targetField: "collateral_category", transform: "Unmapped", mapped: false },
      { id: "r9", sourceField: "guarantor_id", targetField: "guarantor_ref", transform: "Unmapped", mapped: false },
    ],
  },
  {
    id: "M-004",
    name: "Zigama SACCO → ISO 20022",
    src: "Zigama SACCO GL",
    target: "ISO 20022 XML",
    version: "v1.0-draft",
    status: "draft",
    updated: "2026-07-10",
    fields: 18,
    mapped: 12,
    versions: [{ v: "v1.0-draft", date: "2026-07-10", by: "Integration Engineer" }],
    rules: [
      { id: "r10", sourceField: "member_no", targetField: "member_id", transform: "Direct", mapped: true },
      { id: "r11", sourceField: "monthly_contrib", targetField: "monthly_amount", transform: "Decimal", mapped: false },
    ],
  },
];

function MappingPage() {
  const { role } = useRole();
  const canManageMapping = canManage(role, "mapping");

  const [mappings, setMappings]         = useState<MappingRow[]>(INITIAL_MAPPINGS);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals state
  const [editingMapping, setEditingMapping] = useState<MappingRow | null>(null);
  const [historySource, setHistorySource]   = useState<MappingRow | null>(null);
  const [publishWarning, setPublishWarning] = useState<MappingRow | null>(null);

  const filtered = useMemo(() => {
    return mappings.filter((m) => {
      const matchSearch =
        search.trim() === "" ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.src.toLowerCase().includes(search.toLowerCase()) ||
        m.target.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || m.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [mappings, search, statusFilter]);

  // Clone mapping (§5.5 REQ-MAP-006)
  function handleClone(mapping: MappingRow) {
    const cloned: MappingRow = {
      ...mapping,
      id: `M-00${mappings.length + 1}`,
      name: `${mapping.name} (Copy)`,
      version: `${mapping.version}-clone`,
      status: "draft",
      updated: new Date().toISOString().split("T")[0],
      versions: [{ v: `${mapping.version}-clone`, date: new Date().toISOString().split("T")[0], by: role }],
    };
    setMappings([cloned, ...mappings]);
  }

  // Publish version (§5.5 REQ-MAP-004, REQ-MAP-008)
  function handlePublishClick(mapping: MappingRow) {
    if (mapping.mapped < mapping.fields) {
      setPublishWarning(mapping);
    } else {
      executePublish(mapping.id);
    }
  }

  function executePublish(id: string) {
    setMappings((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          const nextV = `v${(parseFloat(m.version.replace(/[^0-9.]/g, "")) + 0.1).toFixed(1)}`;
          return {
            ...m,
            version: nextV,
            status: "healthy",
            updated: new Date().toISOString().split("T")[0],
            versions: [{ v: nextV, date: new Date().toISOString().split("T")[0], by: role }, ...m.versions],
          };
        }
        return m;
      })
    );
    setPublishWarning(null);
  }

  // If business user attempts access, show access control note per §5.5 REQ-MAP-009
  if (role === "business") {
    return (
      <AppShell title="Standards & Mapping" breadcrumb="CONNECT › MAPPING" scope="Technical Only">
        <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg mx-auto mt-10 space-y-3">
          <Lock className="h-10 w-10 text-amber-500 mx-auto" />
          <h2 className="font-bold text-base text-slate-800 dark:text-white">Technical Configuration Restricted (§5.5)</h2>
          <p className="text-xs text-slate-500">
            Per SRS §5.5, Standards & Mapping is exposed strictly as a Technical/Admin configuration interface. Business users have no operational need to access raw field translation schemas.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Standards & Mapping"
      subtitle="ISO 20022 schema definitions, field transformations, and versioning"
      breadcrumb="CONNECT › STANDARDS & MAPPING"
      scope="Technical Configuration"
      primaryAction={
        canManageMapping ? (
          <PrimaryButton
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              const newM: MappingRow = {
                id: `M-00${mappings.length + 1}`,
                name: "New Data Field Mapping",
                src: "Source System",
                target: "ISO 20022",
                version: "v1.0-draft",
                status: "draft",
                updated: new Date().toISOString().split("T")[0],
                fields: 10,
                mapped: 5,
                versions: [{ v: "v1.0-draft", date: new Date().toISOString().split("T")[0], by: role }],
                rules: [],
              };
              setMappings([newM, ...mappings]);
            }}
          >
            Create New Field Mapping
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7B8798]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search field mappings…"
              className="h-8 pl-8 pr-3 rounded-xl text-xs w-60 bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#172033] dark:text-white focus:outline-none font-sans"
            />
          </div>

          <div className="flex items-center gap-1">
            {["all", "healthy", "warning", "draft"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`h-8 px-3 rounded-xl text-xs font-sans font-medium border capitalize transition-colors cursor-pointer ${
                  statusFilter === st
                    ? "bg-[#168FA8] text-white font-semibold border-[#168FA8]"
                    : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </>
      }
    >
      {/* Mapping Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4 mb-6">
        {filtered.map((m) => (
          <div key={m.id} className="rounded-2xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-xs">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300">{m.id}</span>
                  <span className="font-mono text-[11px] font-bold text-[#56B4D3]">{m.version}</span>
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{m.name}</h3>
                <p className="text-xs text-slate-500">{m.src} → {m.target}</p>
              </div>
              <StatusBadge status={m.status} />
            </div>

            <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-400 block">Total Fields</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{m.fields}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Mapped Fields</span>
                <span className={`font-bold ${m.mapped < m.fields ? "text-amber-500" : "text-emerald-500"}`}>
                  {m.mapped} / {m.fields}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Last Updated</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{m.updated}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setEditingMapping(m)}
                className="flex-1 h-9 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit Mapping Rules
              </button>

              {canManageMapping && (
                <>
                  <button
                    onClick={() => handlePublishClick(m)}
                    className="h-9 px-3 rounded-xl text-xs font-semibold bg-[#56B4D3] text-[#092E3D] hover:bg-[#46A4C3] flex items-center gap-1 transition-all cursor-pointer"
                    title="Publish Versioned Release (REQ-MAP-004)"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Publish
                  </button>

                  <button
                    onClick={() => handleClone(m)}
                    className="h-9 px-3 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-all cursor-pointer"
                    title="Clone Mapping Baseline (REQ-MAP-006)"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Clone
                  </button>
                </>
              )}

              <button
                onClick={() => setHistorySource(m)}
                className="h-9 px-3 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-all cursor-pointer"
                title="Version History Log (REQ-MAP-005)"
              >
                <GitBranch className="h-3.5 w-3.5" />
                History
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Field Mapping Rules Editor Drawer */}
      {editingMapping && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-bold text-base text-slate-900 dark:text-white">Field Mapping Definition Rules</h2>
                <p className="text-xs text-[#56B4D3] font-semibold">{editingMapping.name} ({editingMapping.version})</p>
              </div>
              <button onClick={() => setEditingMapping(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Source Field</th>
                      <th className="px-3 py-2 text-left font-semibold">Target Canonical Field</th>
                      <th className="px-3 py-2 text-left font-semibold">Transformation Rule</th>
                      <th className="px-3 py-2 text-center font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {editingMapping.rules.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200">{r.sourceField}</td>
                        <td className="px-3 py-2.5 text-[#56B4D3]">{r.targetField}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{r.transform}</td>
                        <td className="px-3 py-2.5 text-center">
                          {r.mapped ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 font-bold">Mapped</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-bold">Unmapped</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setEditingMapping(null)}>Close Editor</SecondaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Unmapped Fields Warning Modal (§5.5 REQ-MAP-008) */}
      {publishWarning && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-500 font-bold text-base pb-2 border-b border-slate-200 dark:border-slate-800">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <span>Warning: Unmapped Fields Present</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Mapping <strong className="text-slate-900 dark:text-white">{publishWarning.name}</strong> contains{" "}
              <strong className="text-amber-500">{publishWarning.fields - publishWarning.mapped} unmapped fields</strong>.
              Publishing will flag incoming missing target fields as warnings during pipeline ingestion.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton onClick={() => setPublishWarning(null)}>Cancel & Review</SecondaryButton>
              <PrimaryButton onClick={() => executePublish(publishWarning.id)}>Publish Version Anyway</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Version History Drawer (REQ-MAP-005) */}
      {historySource && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-end">
          <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 p-6 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
                <div>
                  <h2 className="font-bold text-base text-slate-900 dark:text-white">Mapping Version History</h2>
                  <p className="text-xs text-[#56B4D3] font-semibold">{historySource.name}</p>
                </div>
                <button onClick={() => setHistorySource(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 font-mono text-xs">
                {historySource.versions.map((ver, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#56B4D3]">{ver.v}</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">Published by {ver.by}</span>
                    </div>
                    <span className="text-slate-500 font-semibold">{ver.date}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <SecondaryButton onClick={() => setHistorySource(null)}>Close History</SecondaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
