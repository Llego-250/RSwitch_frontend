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
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useIntegrations, useParticipants, useSubmissionRoster, useSubmissions } from "@/lib/queries";
import type { IntegrationRow, IntegrationStatus, Submission } from "@/lib/types";
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

const STATUS_BADGE: Record<IntegrationStatus, Status> = {
  Connected: "healthy",
  Degraded: "warning",
  Disconnected: "failed",
  Maintenance: "paused",
};

const TYPE_ICON: Record<string, { Icon: typeof Building2; color: string }> = {
  "Commercial bank": { Icon: Building2, color: "#172033" },
  "Mobile money": { Icon: Smartphone, color: "#168FA8" },
  Microfinance: { Icon: FileSpreadsheet, color: "#D97706" },
  SACCO: { Icon: Landmark, color: "#00A3E0" },
};

const STATUSES: IntegrationStatus[] = ["Connected", "Degraded", "Disconnected", "Maintenance"];

type ValidationError = { row: number; field: string; error: string };

function ago(iso: string | null | undefined) {
  if (!iso) return "Never";
  const mins = Math.floor((Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function IntegrationCatalog() {
  const { role } = useRole();
  const { user } = useAuth();
  const canEdit = canManage(role, "integrations");
  const queryClient = useQueryClient();

  const integrations = useIntegrations();
  const roster = useSubmissionRoster();
  const participants = useParticipants();

  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<string>("All Status");

  // Modals state
  const [showAddModal, setShowAddModal]     = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<IntegrationRow | null>(null);
  const [historySource, setHistorySource]   = useState<IntegrationRow | null>(null);
  const [statusSource, setStatusSource]     = useState<IntegrationRow | null>(null);
  const [errorReport, setErrorReport]       = useState<ValidationError[] | null>(null);
  const [formError, setFormError]           = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess]   = useState<string | null>(null);

  // New participant form (POST /participants also creates its Integration row)
  const [newInst, setNewInst]       = useState("");
  const [newCode, setNewCode]       = useState("");
  const [newType, setNewType]       = useState("Commercial bank");
  const [newFreq, setNewFreq]       = useState(30);

  // Status change form
  const [nextStatus, setNextStatus] = useState<IntegrationStatus>("Connected");
  const [statusNote, setStatusNote] = useState("");

  // Upload Form
  const [uploadPeriod, setUploadPeriod]   = useState(() => new Date().toISOString().slice(0, 7));
  const [uploadFile, setUploadFile]       = useState<File | null>(null);

  const history = useSubmissions(historySource?.participant_id);

  const filtered = useMemo(() => {
    return (integrations.data ?? []).filter((s) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        q === "" ||
        s.participant_name.toLowerCase().includes(q) ||
        s.participant_code.toLowerCase().includes(q) ||
        s.note.toLowerCase().includes(q);
      const matchStatus = statusFilter === "All Status" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [integrations.data, search, statusFilter]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["integrations"] });
    queryClient.invalidateQueries({ queryKey: ["submissions"] });
    queryClient.invalidateQueries({ queryKey: ["participants"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const createParticipant = useMutation({
    mutationFn: () =>
      api.post("/participants", {
        name: newInst.trim(),
        code: newCode.trim().toUpperCase(),
        type: newType,
        expected_frequency_days: newFreq,
      }),
    onSuccess: () => {
      invalidate();
      setShowAddModal(false);
      setNewInst("");
      setNewCode("");
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const changeStatus = useMutation({
    mutationFn: (s: IntegrationRow) =>
      api.patch(`/integrations/${s.id}/status`, { status: nextStatus, note: statusNote }),
    onSuccess: () => {
      invalidate();
      setStatusSource(null);
      setStatusNote("");
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const upload = useMutation({
    mutationFn: async (s: IntegrationRow) => {
      const form = new FormData();
      form.append("participant_id", String(s.participant_id));
      form.append("period", uploadPeriod);
      form.append("file", uploadFile!);
      return api.post<Submission>("/submissions/upload", form);
    },
    onSuccess: (sub) => {
      invalidate();
      if (sub.result === "Failed") {
        setErrorReport(sub.errors as ValidationError[]);
      } else {
        setUploadSuccess(`${sub.filename} accepted · ${sub.row_count.toLocaleString()} rows`);
        setUploadFile(null);
      }
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  function rosterFor(participantId: number) {
    return roster.data?.find((r) => r.participant_id === participantId);
  }

  // Submissions are uploaded by the participant themselves (backend rule).
  const canUploadFor = (s: IntegrationRow) => user?.participantId === s.participant_id;

  return (
    <AppShell
      title="Integrations"
      subtitle="Connections & Data Feeds"
      breadcrumb="CONNECT › INTEGRATIONS"
      scope="All Institutions"
      primaryAction={
        canEdit ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => { setFormError(null); setShowAddModal(true); }}>
            Add Participant
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
              placeholder="Search participant, code or note…"
              className="h-8 pl-8 pr-3 rounded-xl text-xs w-64 bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#172033] dark:text-white focus:outline-none font-sans"
            />
          </div>

          <div className="flex items-center gap-1">
            {["All Status", ...STATUSES].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer capitalize ${
                  statusFilter === st
                    ? "bg-[#168FA8] text-white font-bold border-[#168FA8]"
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
      {(integrations.error || participants.error) && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Couldn't load integrations: {errorMessage(integrations.error ?? participants.error)}
        </div>
      )}
      {integrations.isLoading && <div className="py-10 text-center text-sm text-slate-400">Loading integrations…</div>}
      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {filtered.map((s) => {
          const p = participants.data?.find((x) => x.id === s.participant_id);
          const { Icon, color } = TYPE_ICON[p?.type ?? ""] ?? { Icon: Database, color: "#374151" };
          const r = rosterFor(s.participant_id);
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
                      style={{ backgroundColor: color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">{s.participant_name}</h3>
                      <p className="text-xs font-semibold text-[#168FA8]">{s.participant_code} · {p?.type || "Participant"}</p>
                    </div>
                  </div>
                  <StatusBadge status={STATUS_BADGE[s.status]}>{s.status}</StatusBadge>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 line-clamp-2">
                  {s.note || "No status note."}
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 mb-4">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Cadence</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Every {p?.expected_frequency_days ?? "–"}d</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Last Submission</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{ago(r?.last_uploaded_at)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Submissions</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{r?.submission_count ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Last Result</span>
                    <span className={`font-semibold ${r?.last_result === "Failed" ? "text-red-500" : "text-emerald-500"}`}>
                      {r?.last_result ?? "–"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] text-slate-400 uppercase block">Status Set By</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {s.updated_by || "—"} · {s.source} · {ago(s.updated_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {canUploadFor(s) ? (
                  <button
                    onClick={() => {
                      setSelectedSource(s);
                      setShowUploadModal(true);
                      setErrorReport(null);
                      setFormError(null);
                      setUploadSuccess(null);
                    }}
                    className="flex-1 h-9 rounded-xl text-xs font-semibold bg-[#168FA8] text-white hover:bg-[#0F6F83] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload Data File
                  </button>
                ) : canEdit ? (
                  <button
                    onClick={() => {
                      setStatusSource(s);
                      setNextStatus(s.status);
                      setStatusNote("");
                      setFormError(null);
                    }}
                    className="flex-1 h-9 rounded-xl text-xs font-semibold bg-[#168FA8]/15 text-[#168FA8] hover:bg-[#168FA8]/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Change Status
                  </button>
                ) : (
                  <div className="flex-1" />
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
        {!integrations.isLoading && filtered.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-slate-400">No integrations match.</div>
        )}
      </div>

      {/* ── Change Status Modal (PATCH /integrations/{id}/status) ── */}
      {statusSource && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-bold text-base text-slate-900 dark:text-white">Change Integration Status</h2>
                <p className="text-xs text-[#168FA8] font-semibold">{statusSource.participant_name}</p>
              </div>
              <button onClick={() => setStatusSource(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as IntegrationStatus)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Note (required)</label>
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  rows={3}
                  placeholder="Why is the status changing?"
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
              {formError && <p className="text-red-600 font-medium">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setStatusSource(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                onClick={() => changeStatus.mutate(statusSource)}
                disabled={!statusNote.trim() || changeStatus.isPending}
              >
                {changeStatus.isPending ? "Saving…" : "Save Status"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Integration Modal (Technical/Admin REQ-INTG-005) ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Add Participant</h2>
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
                  placeholder="e.g. Bank of Kigali"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Participant Code</label>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="e.g. BKG"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono uppercase focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Institution Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  {Object.keys(TYPE_ICON).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Expected Reporting Cadence (days)</label>
                <input
                  type="number"
                  min={1}
                  value={newFreq}
                  onChange={(e) => setNewFreq(Number(e.target.value) || 1)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                />
              </div>
              {formError && <p className="text-red-600 font-medium">{formError}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowAddModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton
                onClick={() => { setFormError(null); createParticipant.mutate(); }}
                disabled={!newInst.trim() || !newCode.trim() || createParticipant.isPending}
              >
                {createParticipant.isPending ? "Saving…" : "Save Participant"}
              </PrimaryButton>
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
                <p className="text-xs text-[#168FA8] font-semibold">{selectedSource.participant_name} · {selectedSource.participant_code}</p>
              </div>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reporting Period</label>
                <input
                  type="month"
                  value={uploadPeriod}
                  onChange={(e) => setUploadPeriod(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select Data File (CSV or XLSX)
                </label>
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center bg-slate-50 dark:bg-slate-800/40">
                  <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                    id="file-upload-input"
                  />
                  <label htmlFor="file-upload-input" className="text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer">
                    {uploadFile ? uploadFile.name : "Click to select or drag and drop file"}
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1">Validated against this participant’s ingestion template.</p>
                </div>
              </div>

              {formError && <p className="text-red-600 font-medium">{formError}</p>}
              {uploadSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> {uploadSuccess}
                </div>
              )}
              {/* Line-by-Line Error Report Display (§6.4, REQ-INTG-008) */}
              {errorReport && (
                <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-xs">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Schema Validation Failed — Submission Rejected (No Partial Ingestion)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    The file failed schema checks. Partial ingestion is not allowed. Please correct the errors below and re-upload.
                  </p>
                  <div className="divide-y divide-red-200 dark:divide-red-900/40 text-[11px] font-mono">
                    {errorReport.map((err, idx) => (
                      <div key={idx} className="py-1.5 flex items-start justify-between gap-2">
                        <span className="font-bold text-red-700 dark:text-red-300 shrink-0">{err.row ? `Row ${err.row}:` : "Header:"}</span>
                        <span className="text-slate-700 dark:text-slate-200 flex-1">[{err.field}] {err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowUploadModal(false)}>Close</SecondaryButton>
              <PrimaryButton
                onClick={() => { setFormError(null); setErrorReport(null); setUploadSuccess(null); upload.mutate(selectedSource); }}
                disabled={!uploadFile || upload.isPending}
              >
                {upload.isPending ? "Validating Schema…" : "Validate & Upload"}
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
                  <p className="text-xs text-[#168FA8] font-semibold">{historySource.participant_name} · {historySource.participant_code}</p>
                </div>
                <button onClick={() => setHistorySource(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3">
                {history.isLoading && <div className="text-xs text-slate-400">Loading…</div>}
                {history.error && <div className="text-xs text-red-600">{errorMessage(history.error)}</div>}
                {history.data?.length === 0 && <div className="text-xs text-slate-400">No submissions yet.</div>}
                {history.data?.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">SUB-{log.id} · {log.period}</span>
                      <StatusBadge status={log.result === "Passed" ? "healthy" : "failed"}>{log.result}</StatusBadge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300 font-medium">{log.filename}</span>
                      <button
                        onClick={() => api.download(`/submissions/${log.id}/download`, log.filename)}
                        className="text-[11px] font-semibold text-[#168FA8] hover:underline cursor-pointer"
                      >
                        Download
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span>Date: {new Date(log.uploaded_at).toLocaleDateString()}</span>
                      <span>{log.result === "Passed" ? `Rows: ${log.row_count.toLocaleString()}` : `Errors: ${log.error_count}`}</span>
                      <span>By: {log.uploaded_by}</span>
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
