import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, SecondaryButton, SectionCard } from "@/components/AppShell";
import { StatusBadge, type Status } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import { canManage, canUploadOnBehalf } from "@/lib/roles";
import { api, errorMessage } from "@/lib/api";
import { useIntegrations, useIssues, useParticipants, useSubmissions } from "@/lib/queries";
import type { ParticipantDocumentRow } from "@/lib/types";
import { INTEGRATION_BADGE } from "@/lib/integrations";
import { Search, Clock, Download, Upload } from "lucide-react";

export const Route = createFileRoute("/participant")({
  component: Participant360,
});

function monthsSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / (30 * 86_400_000);
}

export function Participant360() {
  const { role } = useRole();
  const { user } = useAuth();
  const canEdit = canManage(role, "compliance") || canManage(role, "integrations");
  const queryClient = useQueryClient();

  const participants = useParticipants();
  const integrations = useIntegrations();
  const issues = useIssues();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const list = participants.data ?? [];
  const current = list.find((p) => p.id === selectedId) ?? list[0];

  const submissions = useSubmissions(current?.id);
  const documents = useQuery({
    queryKey: ["documents", "participant", current?.id],
    queryFn: () => api.get<ParticipantDocumentRow[]>(`/documents/participant/${current!.id}`),
    enabled: current !== undefined,
  });

  const toggleActive = useMutation({
    mutationFn: () => api.patch(`/participants/${current!.id}`, { is_active: !current!.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["participants"] }),
    onError: (e) => setError(errorMessage(e)),
  });

  const filtered = list.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.type.toLowerCase().includes(search.toLowerCase()),
  );

  const integration = integrations.data?.find((i) => i.participant_id === current?.id);
  const subs = submissions.data ?? [];
  const passed = subs.filter((s) => s.result === "Passed");
  const passRate = subs.length ? (passed.length / subs.length) * 100 : null;
  const avgRows = passed.length ? Math.round(passed.reduce((n, s) => n + s.row_count, 0) / passed.length) : null;
  const myIssues = (issues.data ?? []).filter((i) => i.participant_id === current?.id);
  const openIssues = myIssues.filter((i) => i.status === "Open" || i.status === "In Progress");
  const docsAttention = (documents.data ?? []).filter((d) => d.status !== "On File").length;
  const historyMonths = current ? monthsSince(current.created_at) : 0;

  // Documents arrive from the participant offline; Compliance or Technical/Admin
  // staff upload them on the participant's behalf (enforced by the API).
  const canUploadDocs = canUploadOnBehalf(user?.role);

  const loadError = participants.error ?? integrations.error ?? issues.error;

  return (
    <AppShell
      title="Participant 360"
      subtitle="Institution Profiles & Compliance"
      breadcrumb="GOVERN › PARTICIPANT 360"
      scope="Institutional Intelligence"
      toolbar={
        <div className="flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7B8798]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search participant name, code or type…"
              className="h-8 pl-8 pr-3 rounded-xl text-xs w-full bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#172033] dark:text-white focus:outline-none font-sans"
            />
          </div>
          <div className="text-xs text-[#526174] font-sans">Institution scope only — no individual customer data</div>
        </div>
      }
    >
      {(loadError || error) && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {loadError ? `Couldn't load participants: ${errorMessage(loadError)}` : error}
        </div>
      )}
      {participants.isLoading && <div className="py-10 text-center text-sm text-slate-400">Loading participants…</div>}
      {current && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Side: Institution Selector List */}
          <div className="lg:col-span-4 space-y-3">
            <h2 className="font-semibold text-xs uppercase tracking-wider text-[#526174] font-sans">Participating Institutions</h2>
            <div className="space-y-2">
              {filtered.map((inst) => {
                const selected = inst.id === current.id;
                const intg = integrations.data?.find((i) => i.participant_id === inst.id);
                return (
                  <div
                    key={inst.id}
                    onClick={() => setSelectedId(inst.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      selected
                        ? "bg-[#E7F5F8] border-[#168FA8] text-[#172033] dark:bg-slate-800 dark:border-[#168FA8] shadow-2xs font-semibold"
                        : "bg-white dark:bg-slate-900 border-[#DCE3E8] dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-[#172033] dark:text-white">{inst.name}</span>
                      <span className="text-xs font-sans px-2.5 py-0.5 rounded-full bg-[#E7F5F8] dark:bg-slate-800 font-semibold text-[#168FA8]">
                        {inst.type || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#526174] font-sans mt-2">
                      <span>Integration: {intg?.status ?? "—"}</span>
                      <span className="font-mono text-[11px]">Joined: {inst.created_at.slice(0, 10)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Side: Consolidated Profile View */}
          <div className="lg:col-span-8 space-y-5">
            <SectionCard noPad>
              <div className="p-6 border-b border-[#DCE3E8] dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-[#168FA8] text-white font-bold text-lg flex items-center justify-center shadow-2xs font-sans">
                    {current.code.charAt(0)}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-[#172033] dark:text-white font-sans">{current.name}</h1>
                    <p className="text-xs text-[#526174] dark:text-slate-400 font-sans mt-0.5">
                      <span className="font-mono">{current.code}</span> · {current.type || "Participant"} · Reports every{" "}
                      <span className="font-mono">{current.expected_frequency_days}d</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge status={current.is_active ? "active" : "paused"}>
                    {current.is_active ? "Trading: Active" : "Trading: Inactive"}
                  </StatusBadge>
                  {canEdit && (
                    <SecondaryButton onClick={() => toggleActive.mutate()}>
                      {toggleActive.isPending ? "Saving…" : current.is_active ? "Deactivate" : "Activate"}
                    </SecondaryButton>
                  )}
                </div>
              </div>

              <div className="p-6 bg-slate-50/80 dark:bg-slate-900/40">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3">Operational Summary</h3>
                {historyMonths < 3 && (
                  <div className="mb-3 p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 flex items-center gap-3">
                    <Clock className="h-5 w-5 text-amber-500 shrink-0" />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300">
                      Less than 3 months of history ({historyMonths.toFixed(1)} months) — treat trends with caution.
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    ["Submission Pass Rate", passRate === null ? "–" : `${passRate.toFixed(0)}%`, `${subs.length} submissions`],
                    ["Open Issues", String(openIssues.length), `${myIssues.length} total`],
                    ["Docs Needing Attention", String(docsAttention), `${documents.data?.length ?? 0} required`],
                    ["Avg Rows / Submission", avgRows === null ? "–" : avgRows.toLocaleString(), "passed only"],
                  ].map(([label, value, sub]) => (
                    <div key={label} className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] font-mono text-slate-400 block uppercase">{label}</span>
                      <span className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100">{value}</span>
                      <span className="text-[10px] text-slate-500 block mt-1">{sub}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SectionCard title="Integration Status">
                {integration ? (
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{integration.status}</span>
                      <StatusBadge status={INTEGRATION_BADGE[integration.status]}>{integration.status}</StatusBadge>
                    </div>
                    <div className="text-[11px] text-slate-500 font-sans">{integration.note || "No status note."}</div>
                    <div className="text-[11px] text-slate-400">
                      {integration.source} · {integration.updated_by || "—"} · {integration.updated_at.slice(0, 10)}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No integration record.</p>
                )}
              </SectionCard>

              <SectionCard title="Compliance Documents">
                <div className="space-y-2">
                  {documents.isLoading && <p className="text-xs text-slate-400">Loading…</p>}
                  {documents.data?.map((row) => (
                    <div key={row.doc_type.id} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{row.doc_type.name}</span>
                        <StatusBadge status={row.status === "On File" ? "healthy" : row.status === "Expiring Soon" ? "warning" : "failed"}>
                          {row.status}
                        </StatusBadge>
                      </div>
                      {row.document && (
                        <button
                          onClick={() => api.download(`/documents/${row.document!.id}/download`, row.document!.filename).catch((e) => setError(errorMessage(e)))}
                          className="text-[11px] font-mono text-[#168FA8] hover:underline inline-flex items-center gap-1 cursor-pointer break-all text-left"
                        >
                          <Download className="h-3 w-3 shrink-0" /> {row.document.filename}
                          {row.document.expiry_date && <span className="text-slate-400"> · exp. {row.document.expiry_date}</span>}
                        </button>
                      )}
                      {canUploadDocs && (
                        <DocumentUpload
                          participantId={current.id}
                          docTypeId={row.doc_type.id}
                          renews={row.doc_type.renewal_months != null}
                          onError={setError}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Submission Log" noPad>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Sub ID</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Uploaded</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Period / File</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Result</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Rows</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {submissions.isLoading && (
                      <tr><td colSpan={5} className="px-4 py-4 text-center text-slate-400">Loading…</td></tr>
                    )}
                    {!submissions.isLoading && subs.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-4 text-center text-slate-400">No submissions yet.</td></tr>
                    )}
                    {subs.map((sub) => (
                      <tr key={sub.id}>
                        <td className="px-4 py-2.5 font-bold text-slate-700 dark:text-slate-300">SUB-{sub.id}</td>
                        <td className="px-4 py-2.5 text-slate-500">{sub.uploaded_at.slice(0, 10)}</td>
                        <td className="px-4 py-2.5 font-sans font-medium text-slate-900 dark:text-white">
                          {sub.period} <span className="font-mono text-[10px] text-slate-400">{sub.filename}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            sub.result === "Passed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          }`}>
                            {sub.result}{sub.error_count ? ` · ${sub.error_count} err` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold">{sub.row_count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title="Issues & Remediation">
              <div className="space-y-2">
                {myIssues.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">No issues recorded for this institution.</p>
                ) : (
                  myIssues.map((inc) => (
                    <div key={inc.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-bold text-slate-500 mr-2">ISS-{inc.id}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{inc.description}</span>
                        <span className="text-[11px] text-slate-400 block font-mono">
                          Raised: {inc.created_at.slice(0, 10)} · {inc.assignee || "Unassigned"}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        inc.severity === "Critical" ? "bg-red-100 text-red-700" : inc.severity === "High" ? "bg-amber-100 text-amber-700" : "bg-[#E7F5F8] text-[#168FA8]"
                      }`}>
                        {inc.severity} · {inc.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function DocumentUpload({
  participantId,
  docTypeId,
  renews,
  onError,
}: {
  participantId: number;
  docTypeId: number;
  renews: boolean;
  onError: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [expiry, setExpiry] = useState("");
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("participant_id", String(participantId));
      form.append("doc_type_id", String(docTypeId));
      if (expiry) form.append("expiry_date", expiry);
      form.append("file", file);
      return api.post("/documents/upload", form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
    onError: (e) => onError(errorMessage(e)),
  });
  const inputId = `doc-upload-${docTypeId}`;
  return (
    <div className="flex items-center gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
      {renews && (
        <input
          type="date"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          title="Expiry date of the new document"
          className="h-6 px-1 rounded-md text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
        />
      )}
      <input
        id={inputId}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />
      <label htmlFor={inputId} className="text-[11px] font-semibold text-[#168FA8] hover:underline cursor-pointer inline-flex items-center gap-1">
        <Upload className="h-3 w-3" /> {upload.isPending ? "Uploading…" : "Upload"}
      </label>
    </div>
  );
}
