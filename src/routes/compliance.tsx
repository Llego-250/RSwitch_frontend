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
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useDocumentRoster, useIssues, useParticipants } from "@/lib/queries";
import type { DocumentStatus, Issue, IssueSeverity, IssueStatus, ParticipantDocumentRow } from "@/lib/types";
import {
  FileCheck2,
  Calendar,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Upload,
  Plus,
  X,
  FileText,
  AlertCircle,
  Check,
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/compliance")({
  component: Compliance,
});

const DOC_STATUSES: DocumentStatus[] = ["Expired", "Expiring Soon", "Missing"];
const ISSUE_STATUSES: IssueStatus[] = ["Open", "In Progress", "Resolved", "Closed"];

function Compliance() {
  const { role } = useRole();
  const { user } = useAuth();
  const canManageComp = canManage(role, "compliance");
  const queryClient = useQueryClient();

  const docRoster = useDocumentRoster();
  const issues = useIssues();
  const participants = useParticipants();

  const [statusFilter, setStatusFilter] = useState<string>("All Status");
  const [error, setError]               = useState<string | null>(null);

  // Participant documents drawer
  const [docsFor, setDocsFor] = useState<{ id: number; name: string } | null>(null);
  const participantDocs = useQuery({
    queryKey: ["documents", "participant", docsFor?.id],
    queryFn: () => api.get<ParticipantDocumentRow[]>(`/documents/participant/${docsFor!.id}`),
    enabled: docsFor !== null,
  });

  // New Issue Modal state
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incInst, setIncInst]   = useState<number | "">("");
  const [incDesc, setIncDesc]   = useState("");
  const [incSev, setIncSev]     = useState<IssueSeverity>("Medium");
  const [incOwner, setIncOwner] = useState(user?.fullName ?? "");
  const [incDue, setIncDue]     = useState("");

  const participantName = (id: number) => participants.data?.find((p) => p.id === id)?.name ?? `Participant #${id}`;

  const filteredReqs = (docRoster.data ?? []).filter(
    (r) => statusFilter === "All Status" || r.status === statusFilter
  );
  const allIssues = [...(issues.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const openIssues = allIssues.filter((i) => i.status === "Open" || i.status === "In Progress");
  const count = (st: DocumentStatus) => (docRoster.data ?? []).filter((r) => r.status === st).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["issues"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const createIssue = useMutation({
    mutationFn: () =>
      api.post<Issue>("/issues", {
        participant_id: Number(incInst),
        description: incDesc.trim(),
        severity: incSev,
        assignee: incOwner.trim(),
        due_date: incDue || null,
      }),
    onSuccess: () => {
      invalidate();
      setShowIncidentModal(false);
      setIncDesc("");
      setIncDue("");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, status }: { id: number; status: IssueStatus }) => api.patch<Issue>(`/issues/${id}`, { status }),
    onSuccess: invalidate,
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <AppShell
      title="Compliance Register"
      subtitle="Compliance Documents & Issues"
      breadcrumb="GOVERN › COMPLIANCE"
      scope="All Institutions"
      primaryAction={
        canManageComp ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => { setError(null); setShowIncidentModal(true); }}>
            Record New Issue
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#526174] font-sans font-medium">Document Status:</span>
          {["All Status", ...DOC_STATUSES].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`h-7 px-3 rounded-lg text-xs font-sans font-medium border transition-colors cursor-pointer ${
                statusFilter === st
                  ? "bg-[#168FA8] text-white font-semibold border-[#168FA8]"
                  : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      }
    >
      {(docRoster.error || issues.error || error) && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 flex items-center justify-between">
          <span>{docRoster.error || issues.error ? `Couldn't load compliance data: ${errorMessage(docRoster.error ?? issues.error)}` : error}</span>
          {error && <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>}
        </div>
      )}
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Expired Documents" value={count("Expired").toString()} source="documents" freshness="live" />
        <KpiCard label="Expiring Soon" value={count("Expiring Soon").toString()} source="documents" freshness="live" />
        <KpiCard label="Missing Documents" value={count("Missing").toString()} source="documents" freshness="live" />
        <KpiCard
          label="Open Issues"
          value={openIssues.length.toString()}
          context={`${openIssues.filter((i) => i.severity === "Critical").length} Critical`}
          source="issues"
          freshness="live"
        />
      </div>

      {/* Main Table: documents needing attention across the roster */}
      <SectionCard title="Documents Needing Attention" noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {["Document", "Institution", "Expiry Date", "Status", "Actions"].map((col) => (
                  <th key={col} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {docRoster.isLoading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 font-sans">Loading…</td></tr>
              )}
              {!docRoster.isLoading && filteredReqs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 font-sans">All documents on file.</td></tr>
              )}
              {filteredReqs.map((req) => (
                <tr key={`${req.participant_id}-${req.doc_type}`} className={req.status === "Expired" ? "bg-red-50/60 dark:bg-red-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}>
                  <td className="px-4 py-3 font-sans">
                    <div className="font-bold text-slate-900 dark:text-white">{req.doc_type}</div>
                  </td>
                  <td className="px-4 py-3 font-sans font-medium text-slate-800 dark:text-slate-200">{req.participant_name}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${req.status === "Expired" ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}>
                      {req.expiry_date ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      req.status === "Expired"
                        ? "bg-red-100 text-red-700 font-extrabold"
                        : req.status === "Missing"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <button
                      onClick={() => setDocsFor({ id: req.participant_id, name: req.participant_name })}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#168FA8] text-white hover:bg-[#0F6F83] cursor-pointer"
                    >
                      View Documents
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Issues & Remediation" noPad>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {["Issue ID", "Institution", "Description", "Severity", "Status", "Assignee", "Due"].map((col) => (
                    <th key={col} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {allIssues.map((inc) => (
                  <tr key={inc.id}>
                    <td className="px-4 py-2.5 font-bold text-[#168FA8]">ISS-{inc.id}</td>
                    <td className="px-4 py-2.5 font-sans font-medium text-slate-900 dark:text-white">{participantName(inc.participant_id)}</td>
                    <td className="px-4 py-2.5 font-sans text-slate-700 dark:text-slate-300">{inc.description}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        inc.severity === "Critical" ? "bg-red-100 text-red-700 font-extrabold" : inc.severity === "High" ? "bg-amber-100 text-amber-700" : "bg-[#E7F5F8] text-[#168FA8]"
                      }`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-sans">
                      {canManageComp ? (
                        <select
                          value={inc.status}
                          onChange={(e) => updateIssue.mutate({ id: inc.id, status: e.target.value as IssueStatus })}
                          className="h-7 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none"
                        >
                          {ISSUE_STATUSES.map((st) => <option key={st}>{st}</option>)}
                        </select>
                      ) : (
                        inc.status
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{inc.assignee || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{inc.due_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* Participant Documents Drawer */}
      {docsFor && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-end">
          <div className="w-full max-w-xl h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 p-6 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
                <div>
                  <h2 className="font-bold text-base text-slate-900 dark:text-white">Compliance Documents</h2>
                  <p className="text-xs text-[#168FA8] font-semibold">{docsFor.name}</p>
                </div>
                <button onClick={() => setDocsFor(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3">
                {participantDocs.isLoading && <div className="text-xs text-slate-400">Loading…</div>}
                {participantDocs.error && <div className="text-xs text-red-600">{errorMessage(participantDocs.error)}</div>}
                {participantDocs.data?.map((row) => (
                  <div key={row.doc_type.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{row.doc_type.name}</span>
                      <StatusBadge status={row.status === "On File" ? "healthy" : row.status === "Expiring Soon" ? "warning" : "failed"}>
                        {row.status}
                      </StatusBadge>
                    </div>
                    {row.document ? (
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                        <span>{row.document.filename} · expires {row.document.expiry_date ?? "never"}</span>
                        <button
                          onClick={() => api.download(`/documents/${row.document!.id}/download`, row.document!.filename).catch((e) => setError(errorMessage(e)))}
                          className="inline-flex items-center gap-1 font-semibold text-[#168FA8] hover:underline cursor-pointer"
                        >
                          <Download className="h-3 w-3" /> Download
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400">No document on file.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <SecondaryButton onClick={() => setDocsFor(null)}>Close</SecondaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Record Incident Modal (§6.2) */}
      {showIncidentModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Record Participant Issue</h2>
              <button onClick={() => setShowIncidentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Participant Institution</label>
                <select
                  value={incInst}
                  onChange={(e) => setIncInst(e.target.value ? Number(e.target.value) : "")}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="">Select participant…</option>
                  {participants.data?.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Incident Description</label>
                <textarea
                  value={incDesc}
                  onChange={(e) => setIncDesc(e.target.value)}
                  placeholder="Describe the compliance or operational incident in detail…"
                  rows={3}
                  className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Severity</label>
                <select
                  value={incSev}
                  onChange={(e) => setIncSev(e.target.value as IssueSeverity)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Due Date</label>
                <input
                  type="date"
                  value={incDue}
                  onChange={(e) => setIncDue(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Assignee</label>
                <input
                  type="text"
                  value={incOwner}
                  onChange={(e) => setIncOwner(e.target.value)}
                  placeholder="e.g. Inkomoko Compliance Lead"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowIncidentModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={() => createIssue.mutate()} disabled={!incInst || !incDesc.trim() || createIssue.isPending}>
                {createIssue.isPending ? "Saving…" : "Record Issue"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
