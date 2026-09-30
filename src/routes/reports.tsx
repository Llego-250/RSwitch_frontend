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
import { useRole } from "@/context/RoleContext";
import { visible } from "@/lib/roles";
import { api, errorMessage } from "@/lib/api";
import { useOverview, useParticipants } from "@/lib/queries";
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
  Calendar,
  X,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: Reports,
});

type ReportKind = "compliance_status" | "integration_status" | "submission_history" | "issues";

const REPORT_KINDS: { id: ReportKind; title: string; desc: string; dated: boolean }[] = [
  { id: "compliance_status", title: "Compliance Status", desc: "Compliance documents on file per participant, with expiry dates", dated: false },
  { id: "integration_status", title: "Integration Health", desc: "Current integration status, notes and who set them", dated: false },
  { id: "submission_history", title: "Submission History", desc: "Every data submission with validation result and error count", dated: true },
  { id: "issues", title: "Issue Report", desc: "Issue log with severity, assignee and status", dated: false },
];

type ReportItem = {
  id: string;
  kind: ReportKind;
  name: string;
  generatedDate: string;
  format: "pdf" | "xlsx";
  participantId: number | "";
  dateFrom: string;
  dateTo: string;
};

function exportPath(r: Pick<ReportItem, "kind" | "format" | "participantId" | "dateFrom" | "dateTo">) {
  const q = new URLSearchParams({ report: r.kind, format: r.format });
  if (r.participantId) q.set("participant_id", String(r.participantId));
  if (r.dateFrom) q.set("date_from", r.dateFrom);
  if (r.dateTo) q.set("date_to", r.dateTo);
  return `/reports/export?${q}`;
}

function Reports() {
  const { role } = useRole();
  // Every staff role may export (the API only requires a staff login).
  const canGenerateReports = visible(role, "reports");
  const participants = useParticipants();
  const overview = useOverview();

  // Exports generated in this browser session (the API streams files; it
  // doesn't keep a report archive).
  const [reports, setReports]             = useState<ReportItem[]>([]);
  const [search, setSearch]               = useState("");
  const [error, setError]                 = useState<string | null>(null);
  const [busy, setBusy]                   = useState(false);

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Generate Form
  const [genKind, setGenKind]         = useState<ReportKind>("compliance_status");
  const [genFormat, setGenFormat]     = useState<"pdf" | "xlsx">("pdf");
  const [genParticipant, setGenParticipant] = useState<number | "">("");
  const [genFrom, setGenFrom]         = useState("");
  const [genTo, setGenTo]             = useState("");

  const kindTitle = (k: ReportKind) => REPORT_KINDS.find((r) => r.id === k)!.title;
  const participantLabel = (id: number | "") =>
    id ? participants.data?.find((p) => p.id === id)?.name ?? `#${id}` : "All participants";

  const filtered = reports.filter((r) => search.trim() === "" || r.name.toLowerCase().includes(search.toLowerCase()));

  async function download(r: Pick<ReportItem, "kind" | "format" | "participantId" | "dateFrom" | "dateTo">) {
    setError(null);
    setBusy(true);
    try {
      await api.download(exportPath(r), `${r.kind}.${r.format}`);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateSubmit() {
    const item: ReportItem = {
      id: `RPT-${String(reports.length + 1).padStart(3, "0")}`,
      kind: genKind,
      name: `${kindTitle(genKind)} · ${participantLabel(genParticipant)}`,
      generatedDate: new Date().toLocaleString(),
      format: genFormat,
      participantId: genParticipant,
      dateFrom: genFrom,
      dateTo: genTo,
    };
    if (await download(item)) {
      setReports([item, ...reports]);
      setShowGenerateModal(false);
    }
  }

  function openGenerate(kind: ReportKind) {
    setGenKind(kind);
    setError(null);
    setShowGenerateModal(true);
  }

  return (
    <AppShell
      title="Reports"
      subtitle="Export Reports"
      breadcrumb="INTELLIGENCE › REPORTS"
      scope="Official Reporting Engine"
      primaryAction={
        canGenerateReports ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => openGenerate("compliance_status")}>
            Generate New Report
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7B8798]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search generated reports…"
              className="h-8 pl-8 pr-3 rounded-xl text-xs w-64 bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#172033] dark:text-white focus:outline-none font-sans"
            />
          </div>

        </div>
      }
    >
      {overview.data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-xs font-mono">
          {[
            ["Participants", overview.data.participants_total],
            ["Connected", overview.data.participants_connected],
            ["Docs needing attention", overview.data.documents_needing_attention],
            ["Open issues", overview.data.open_issues_total],
          ].map(([label, value]) => (
            <div key={label} className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase text-slate-400 block">{label}</span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">{value}</span>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
      )}
      {/* Report types offered by /reports/export */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {REPORT_KINDS.map((cat) => (
          <div
            key={cat.id}
            onClick={() => canGenerateReports && openGenerate(cat.id)}
            className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#168FA8] transition-all cursor-pointer shadow-xs space-y-1"
          >
            <span className="font-mono text-[10px] font-bold text-[#168FA8] block">{cat.id}</span>
            <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-snug">{cat.title}</h4>
            <p className="text-[11px] text-slate-500 line-clamp-2">{cat.desc}</p>
          </div>
        ))}
      </div>

      {/* Reports generated this session */}
      <SectionCard title="Generated This Session" noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {["Report Name & ID", "Type", "Generated", "Filters", "Format", "Actions"].map((col) => (
                  <th key={col} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400 font-sans">No reports generated yet — pick a report type above.</td></tr>
              )}
              {filtered.map((rpt) => (
                <tr key={rpt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-sans">
                    <div className="font-bold text-slate-900 dark:text-white">{rpt.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{rpt.id}</div>
                  </td>
                  <td className="px-4 py-3 text-[#168FA8] font-bold">{kindTitle(rpt.kind)}</td>
                  <td className="px-4 py-3 text-slate-500">{rpt.generatedDate}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {participantLabel(rpt.participantId)}
                    {(rpt.dateFrom || rpt.dateTo) && ` · ${rpt.dateFrom || "…"} → ${rpt.dateTo || "…"}`}
                  </td>
                  <td className="px-4 py-3 font-bold uppercase">{rpt.format}</td>
                  <td className="px-4 py-3 font-sans">
                    <button
                      onClick={() => download(rpt)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 font-semibold text-[#168FA8] hover:underline cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download again
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Generate Report Modal (§14) */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Generate Report</h2>
              <button onClick={() => setShowGenerateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Report Type</label>
                <select
                  value={genKind}
                  onChange={(e) => setGenKind(e.target.value as ReportKind)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  {REPORT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Participant</label>
                <select
                  value={genParticipant}
                  onChange={(e) => setGenParticipant(e.target.value ? Number(e.target.value) : "")}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="">All participants</option>
                  {participants.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {REPORT_KINDS.find((k) => k.id === genKind)?.dated && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">From</label>
                    <input type="date" value={genFrom} onChange={(e) => setGenFrom(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">To</label>
                    <input type="date" value={genTo} onChange={(e) => setGenTo(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none" />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Export Format</label>
                <select
                  value={genFormat}
                  onChange={(e) => setGenFormat(e.target.value as "pdf" | "xlsx")}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="pdf">PDF Document</option>
                  <option value="xlsx">Excel Spreadsheet (XLSX)</option>
                </select>
              </div>
              {error && <p className="text-red-600 font-medium">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowGenerateModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={handleGenerateSubmit} disabled={busy}>{busy ? "Generating…" : "Generate & Download"}</PrimaryButton>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  );
}
