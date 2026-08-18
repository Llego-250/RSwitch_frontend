import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
} from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import type { Status } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
import {
  Building2,
  Smartphone,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  Database,
  Plus,
  RefreshCw,
  Search,
  X,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Clock,
  History,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/integrations")({
  component: IntegrationCatalog,
});

type IntegrationMode = "Manual Upload" | "Automated API";

type Source = {
  id: string;
  name: string;
  institution: string;
  Icon: typeof Building2;
  color: string;
  mode: IntegrationMode;
  status: Status;
  sync: string;
  records: string;
  errors: number;
  desc: string;
  cron?: string;
  endpointUrl?: string;
};

const INITIAL_SOURCES: Source[] = [
  {
    id: "int-001",
    name: "Core Banking Data Exchange",
    institution: "Bank of Kigali",
    Icon: Building2,
    color: "#2D6A9F",
    mode: "Automated API",
    status: "healthy",
    sync: "5m ago",
    records: "128,400",
    errors: 0,
    desc: "Automated transaction summary & liquidity metrics pull",
    cron: "0 */2 * * *",
    endpointUrl: "https://api.bk.rw/v1/rdip/feed",
  },
  {
    id: "int-002",
    name: "Mobile Money Switch Feed",
    institution: "MTN Mobile Money",
    Icon: Smartphone,
    color: "#0D9488",
    mode: "Automated API",
    status: "warning",
    sync: "12m ago",
    records: "84,201",
    errors: 14,
    desc: "Real-time e-money wallet transaction stream",
    cron: "0 * * * *",
    endpointUrl: "https://momo.mtn.co.rw/api/rdip/transactions",
  },
  {
    id: "int-003",
    name: "Card Switch & POS Stream",
    institution: "Equity Bank Rwanda",
    Icon: CreditCard,
    color: "#7C3AED",
    mode: "Automated API",
    status: "healthy",
    sync: "1h ago",
    records: "45,890",
    errors: 0,
    desc: "ATM & POS switching summary feed",
    cron: "0 0 * * *",
    endpointUrl: "https://api.equitybank.co.rw/rdip/v2",
  },
  {
    id: "int-004",
    name: "Quarterly Regulatory Upload",
    institution: "Inkomoko MFI",
    Icon: FileSpreadsheet,
    color: "#D97706",
    mode: "Manual Upload",
    status: "failed",
    sync: "3h ago",
    records: "0",
    errors: 3,
    desc: "Manual CSV/XLSX submission for MFI loan portfolio return",
  },
  {
    id: "int-005",
    name: "SACCO Monthly Financial Return",
    institution: "Zigama CSS SACCO",
    Icon: Landmark,
    color: "#0891B2",
    mode: "Manual Upload",
    status: "healthy",
    sync: "1d ago",
    records: "18,900",
    errors: 0,
    desc: "Manual XML/CSV monthly regulatory submission",
  },
  {
    id: "int-006",
    name: "Microfinance Ingestion API",
    institution: "Umwalimu SACCO",
    Icon: Database,
    color: "#374151",
    mode: "Automated API",
    status: "healthy",
    sync: "2h ago",
    records: "32,110",
    errors: 0,
    desc: "Automated API pull for teacher savings & credit data",
    cron: "0 12 * * *",
    endpointUrl: "https://api.umwalimusacco.rw/v1/ingest",
  },
];

type SubmissionLog = {
  id: string;
  date: string;
  fileName: string;
  mode: IntegrationMode;
  status: "Passed" | "Validation Failed" | "Rejected";
  records: number;
  errorsCount: number;
  uploadedBy: string;
};

const MOCK_HISTORY: Record<string, SubmissionLog[]> = {
  "int-004": [
    { id: "SUB-801", date: "2026-07-24 14:30", fileName: "Inkomoko_Q2_Portfolio.csv", mode: "Manual Upload", status: "Validation Failed", records: 0, errorsCount: 3, uploadedBy: "Compliance User" },
    { id: "SUB-744", date: "2026-04-12 11:15", fileName: "Inkomoko_Q1_Portfolio_v2.csv", mode: "Manual Upload", status: "Passed", records: 14200, errorsCount: 0, uploadedBy: "Compliance User" },
  ],
  "int-001": [
    { id: "SUB-902", date: "2026-07-24 16:00", fileName: "API_AutoSync_BK.json", mode: "Automated API", status: "Passed", records: 128400, errorsCount: 0, uploadedBy: "System Cron" },
    { id: "SUB-881", date: "2026-07-24 14:00", fileName: "API_AutoSync_BK.json", mode: "Automated API", status: "Passed", records: 124100, errorsCount: 0, uploadedBy: "System Cron" },
  ],
};

function IntegrationCatalog() {
  const { role } = useRole();
  const canEdit = canManage(role, "integrations");

  const [sources, setSources]             = useState<Source[]>(INITIAL_SOURCES);
  const [search, setSearch]               = useState("");
  const [modeFilter, setModeFilter]       = useState<string>("All Modes");
  const [statusFilter, setStatusFilter]   = useState<string>("All Status");
  const [refreshing, setRefreshing]       = useState<Set<string>>(new Set());

  // Modals state
  const [showAddModal, setShowAddModal]     = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [historySource, setHistorySource]   = useState<Source | null>(null);
  const [errorReport, setErrorReport]       = useState<{ row: number; field: string; error: string }[] | null>(null);

  // New Integration Form
  const [newInst, setNewInst]       = useState("");
  const [newName, setNewName]       = useState("");
  const [newMode, setNewMode]       = useState<IntegrationMode>("Automated API");
  const [newEndpoint, setNewEndpoint] = useState("");
  const [newCron, setNewCron]       = useState("0 0 * * *");

  // Upload Form
  const [uploadReqType, setUploadReqType] = useState("Quarterly Prudential Return");
  const [uploadPeriod, setUploadPeriod]   = useState("Q2 2026");
  const [uploadFile, setUploadFile]       = useState<File | null>(null);
  const [uploading, setUploading]         = useState(false);

  const filtered = useMemo(() => {
    return sources.filter((s) => {
      const matchSearch =
        search.trim() === "" ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.institution.toLowerCase().includes(search.toLowerCase()) ||
        s.desc.toLowerCase().includes(search.toLowerCase());
      const matchMode = modeFilter === "All Modes" || s.mode === modeFilter;
      const matchStatus = statusFilter === "All Status" || s.status === statusFilter;
      return matchSearch && matchMode && matchStatus;
    });
  }, [sources, search, modeFilter, statusFilter]);

  // Manual Sync Action (§5.3 REQ-INTG-006)
  function handleSyncNow(id: string) {
    setRefreshing((prev) => new Set([...prev, id]));
    setTimeout(() => {
      setRefreshing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSources((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, sync: "Just now", status: "healthy", errors: 0 } : s
        )
      );
    }, 2000);
  }

  // Create New Integration (§5.3 REQ-INTG-005)
  function handleCreateIntegration() {
    if (!newInst || !newName) return;
    const newEntry: Source = {
      id: `int-00${sources.length + 1}`,
      name: newName,
      institution: newInst,
      Icon: newMode === "Automated API" ? Building2 : FileSpreadsheet,
      color: "#2D6A9F",
      mode: newMode,
      status: "healthy",
      sync: "Pending first run",
      records: "0",
      errors: 0,
      desc: `${newMode} for ${newInst}`,
      cron: newMode === "Automated API" ? newCron : undefined,
      endpointUrl: newMode === "Automated API" ? newEndpoint : undefined,
    };
    setSources([newEntry, ...sources]);
    setShowAddModal(false);
    setNewInst("");
    setNewName("");
  }

  // File Upload with Schema Validation & Error Report (§6.4, REQ-INTG-008)
  function handleUploadSubmit() {
    if (!selectedSource || !uploadFile) return;
    setUploading(true);
    setErrorReport(null);

    setTimeout(() => {
      setUploading(false);

      // Simulate line-by-line validation failure for test CSV files with errors or failed institutions
      if (selectedSource.id === "int-004" || uploadFile.name.includes("error")) {
        setErrorReport([
          { row: 14, field: "tax_identification_number", error: "Missing required TIN number format (MUST be 9 digits)" },
          { row: 42, field: "portfolio_at_risk_30d", error: "Value '-5.2%' is negative; must be positive percentage" },
          { row: 108, field: "reporting_date", error: "Date '2026-13-45' invalid ISO-8601 date string" },
        ]);
      } else {
        // Success upload
        setSources((prev) =>
          prev.map((s) =>
            s.id === selectedSource.id
              ? { ...s, sync: "Just now", status: "healthy", records: "14,800", errors: 0 }
              : s
          )
        );
        setShowUploadModal(false);
        setUploadFile(null);
      }
    }, 1500);
  }

  return (
    <AppShell
      title="Integrations"
      subtitle="Connections & Data Feeds"
      breadcrumb="CONNECT › INTEGRATIONS"
      scope="All Institutions"
      primaryAction={
        canEdit ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddModal(true)}>
            Add Participant Integration
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
              placeholder="Search integrations or institution…"
              className="h-8 pl-8 pr-3 rounded-xl text-xs w-64 bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#172033] dark:text-white focus:outline-none font-sans"
            />
          </div>

          <div className="flex items-center gap-1">
            {["All Modes", "Automated API", "Manual Upload"].map((m) => (
              <button
                key={m}
                onClick={() => setModeFilter(m)}
                className={`h-8 px-3 rounded-xl text-xs font-sans font-medium border transition-colors cursor-pointer ${
                  modeFilter === m
                    ? "bg-[#168FA8] text-white font-semibold border-[#168FA8]"
                    : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {["All Status", "healthy", "warning", "failed"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer capitalize ${
                  statusFilter === st
                    ? "bg-[#56B4D3] text-[#092E3D] font-bold border-[#56B4D3]"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </>
      }
    >
      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {filtered.map((s) => {
          const Icon = s.Icon;
          const isSyncing = refreshing.has(s.id);
          return (
            <div
              key={s.id}
              className="rounded-2xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                      style={{ backgroundColor: s.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">{s.name}</h3>
                      <p className="text-xs font-semibold text-[#56B4D3]">{s.institution}</p>
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 line-clamp-2">{s.desc}</p>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 mb-4">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Mode</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{s.mode}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Last Sync</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{s.sync}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Records Ingested</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{s.records}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Errors</span>
                    <span className={`font-semibold ${s.errors > 0 ? "text-red-500" : "text-emerald-500"}`}>
                      {s.errors} {s.errors > 0 ? "Validation Error" : "None"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {s.mode === "Automated API" ? (
                  <button
                    onClick={() => handleSyncNow(s.id)}
                    disabled={isSyncing}
                    className="flex-1 h-9 rounded-xl text-xs font-semibold bg-[#56B4D3]/15 text-[#56B4D3] hover:bg-[#56B4D3]/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "Syncing API…" : "Trigger Manual Sync"}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedSource(s);
                      setShowUploadModal(true);
                      setErrorReport(null);
                    }}
                    className="flex-1 h-9 rounded-xl text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload Data File
                  </button>
                )}

                <button
                  onClick={() => setHistorySource(s)}
                  className="h-9 px-3 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-all cursor-pointer"
                  title="View Submission History Log"
                >
                  <History className="h-3.5 w-3.5" />
                  History
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Add Integration Modal (Technical/Admin REQ-INTG-005) ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Add Participant Integration Config</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Institution Name</label>
                <input
                  type="text"
                  value={newInst}
                  onChange={(e) => setNewInst(e.target.value)}
                  placeholder="e.g. Bank of Kigali / MTN Mobile Money"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Integration Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Core Banking Data Exchange"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Integration Mode</label>
                <select
                  value={newMode}
                  onChange={(e) => setNewMode(e.target.value as IntegrationMode)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Automated API">Automated API (Scheduled Endpoint Pull)</option>
                  <option value="Manual Upload">Manual Upload (CSV, XLSX, XML)</option>
                </select>
              </div>

              {newMode === "Automated API" && (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Endpoint URL</label>
                    <input
                      type="url"
                      value={newEndpoint}
                      onChange={(e) => setNewEndpoint(e.target.value)}
                      placeholder="https://api.institution.rw/v1/feed"
                      className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Schedule Cron Expression</label>
                    <input
                      type="text"
                      value={newCron}
                      onChange={(e) => setNewCron(e.target.value)}
                      placeholder="0 0 * * *"
                      className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowAddModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={handleCreateIntegration}>Save Integration</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual File Upload & Line-by-Line Error Report Drawer (§6.4, REQ-INTG-007, REQ-INTG-008) ── */}
      {showUploadModal && selectedSource && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-bold text-base text-slate-900 dark:text-white">Manual Data File Upload</h2>
                <p className="text-xs text-[#56B4D3] font-semibold">{selectedSource.institution} · {selectedSource.name}</p>
              </div>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Requirement Type</label>
                <select
                  value={uploadReqType}
                  onChange={(e) => setUploadReqType(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Quarterly Prudential Return">Quarterly Prudential Return (BNR Directive 07/2024)</option>
                  <option value="AML Monthly Return">AML Monthly Transaction Return</option>
                  <option value="Financial Inclusion Metric Feed">Financial Inclusion Metric Feed</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reporting Period</label>
                <input
                  type="text"
                  value={uploadPeriod}
                  onChange={(e) => setUploadPeriod(e.target.value)}
                  placeholder="e.g. Q2 2026 / July 2026"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select Data File (CSV, XLSX, XML — Max 50MB)
                </label>
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center bg-slate-50 dark:bg-slate-800/40">
                  <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xml"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                    id="file-upload-input"
                  />
                  <label htmlFor="file-upload-input" className="text-xs font-semibold text-[#56B4D3] hover:underline cursor-pointer">
                    {uploadFile ? uploadFile.name : "Click to select or drag and drop file"}
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1">UTF-8 required for CSV files. Max 50MB.</p>
                </div>
              </div>

              {/* Line-by-Line Error Report Display (§6.4, REQ-INTG-008) */}
              {errorReport && (
                <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-xs">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Schema Validation Failed — Submission Rejected (No Partial Ingestion)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    The file failed schema checks. Per RDIP Data Quality Rule §6.4, partial ingestion is not allowed. Please correct the errors below and re-upload.
                  </p>
                  <div className="divide-y divide-red-200 dark:divide-red-900/40 text-[11px] font-mono">
                    {errorReport.map((err, idx) => (
                      <div key={idx} className="py-1.5 flex items-start justify-between gap-2">
                        <span className="font-bold text-red-700 dark:text-red-300 shrink-0">Row {err.row}:</span>
                        <span className="text-slate-700 dark:text-slate-200 flex-1">[{err.field}] {err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowUploadModal(false)}>Close</SecondaryButton>
              <PrimaryButton onClick={handleUploadSubmit} disabled={!uploadFile || uploading}>
                {uploading ? "Validating Schema…" : "Validate & Upload"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Submission History Drawer (REQ-INTG-011) ── */}
      {historySource && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-end">
          <div className="w-full max-w-xl h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 p-6 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
                <div>
                  <h2 className="font-bold text-base text-slate-900 dark:text-white">Submission History Log</h2>
                  <p className="text-xs text-[#56B4D3] font-semibold">{historySource.institution} · {historySource.name}</p>
                </div>
                <button onClick={() => setHistorySource(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3">
                {(MOCK_HISTORY[historySource.id] ?? [
                  { id: "SUB-101", date: "2026-07-20 10:00", fileName: "Automated_Sync.json", mode: historySource.mode, status: "Passed", records: 18900, errorsCount: 0, uploadedBy: "System API" }
                ]).map((log) => (
                  <div key={log.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{log.id}</span>
                      <StatusBadge status={log.status === "Passed" ? "healthy" : "failed"} />
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 font-medium">{log.fileName}</div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span>Date: {log.date}</span>
                      <span>Records: {log.records.toLocaleString()}</span>
                      <span>By: {log.uploadedBy}</span>
                    </div>
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
