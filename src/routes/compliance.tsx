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

type SubmissionStatus = "Pending" | "Submitted" | "Validation Failed" | "Under Review" | "Approved" | "Rejected" | "Overdue";

type RequirementEntry = {
  id: string;
  name: string;
  regulatoryRef: string;
  frequency: "Monthly" | "Quarterly" | "Annual" | "Ad hoc";
  institution: string;
  dueDate: string;
  status: SubmissionStatus;
  format: "CSV" | "XLSX" | "XML" | "PDF";
  submittedAt?: string;
  rejectionReason?: string;
};

type IncidentSeverity = "Critical" | "High" | "Medium" | "Low";
type IncidentStatus = "Open" | "Under Investigation" | "Remediation In Progress" | "Resolved" | "Closed";

type Incident = {
  id: string;
  institution: string;
  date: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  owner: string;
  remediationAction?: string;
  remediationDue?: string;
};

const INITIAL_REQUIREMENTS: RequirementEntry[] = [
  { id: "REQ-201", name: "Quarterly Prudential Risk Return", regulatoryRef: "BNR Directive 07/2024", frequency: "Quarterly", institution: "Bank of Kigali", dueDate: "2026-07-15", status: "Approved", format: "XML", submittedAt: "2026-07-10 14:20" },
  { id: "REQ-202", name: "AML Monthly Transaction Return", regulatoryRef: "FIU Regulation 03/2025", frequency: "Monthly", institution: "MTN Mobile Money", dueDate: "2026-07-22", status: "Under Review", format: "CSV", submittedAt: "2026-07-22 09:15" },
  { id: "REQ-203", name: "MFI Loan Portfolio Quality Return", regulatoryRef: "BNR Microfinance Act", frequency: "Quarterly", institution: "Inkomoko MFI", dueDate: "2026-07-20", status: "Overdue", format: "CSV" },
  { id: "REQ-204", name: "Annual Capital Adequacy Report", regulatoryRef: "Central Bank Act", frequency: "Annual", institution: "Equity Bank Rwanda", dueDate: "2026-07-31", status: "Pending", format: "PDF" },
  { id: "REQ-205", name: "SACCO Liquidity & Reserve Return", regulatoryRef: "BNR SACCO Standard", frequency: "Monthly", institution: "Zigama CSS SACCO", dueDate: "2026-07-25", status: "Submitted", format: "XLSX", submittedAt: "2026-07-24 16:30" },
];

const INITIAL_INCIDENTS: Incident[] = [
  { id: "INC-501", institution: "Inkomoko MFI", date: "2026-07-24", description: "Submission validation failure: row 42 PAR_30d value invalid format", severity: "Medium", status: "Open", owner: "Inkomoko Compliance", remediationAction: "Re-upload corrected loan portfolio CSV", remediationDue: "2026-07-28" },
  { id: "INC-502", institution: "MTN Mobile Money", date: "2026-07-24", description: "Unexplained API transaction submission error rate spike (+4.2%)", severity: "High", status: "Under Investigation", owner: "MTN Technical Lead", remediationAction: "Audit API payload serializer for corrupted records", remediationDue: "2026-07-27" },
  { id: "INC-503", institution: "Bank of Kigali", date: "2026-06-02", description: "API Gateway 504 Timeout during peak settlement window", severity: "Low", status: "Resolved", owner: "RSwitch Technical", remediationAction: "Scaled API Gateway worker instances", remediationDue: "2026-06-05" },
];

function Compliance() {
  const { role } = useRole();
  const canManageComp = canManage(role, "compliance");

  const [reqs, setReqs]                   = useState<RequirementEntry[]>(INITIAL_REQUIREMENTS);
  const [incidents, setIncidents]         = useState<Incident[]>(INITIAL_INCIDENTS);
  const [statusFilter, setStatusFilter]   = useState<string>("All Status");

  // Review Drawer state (§8.4)
  const [reviewReq, setReviewReq]         = useState<RequirementEntry | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewError, setReviewError]     = useState<string | null>(null);

  // New Incident Modal state (§6.2)
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incInst, setIncInst]             = useState("Bank of Kigali");
  const [incDesc, setIncDesc]             = useState("");
  const [incSev, setIncSev]               = useState<IncidentSeverity>("Medium");
  const [incOwner, setIncOwner]           = useState("Compliance User");

  const filteredReqs = reqs.filter(
    (r) => statusFilter === "All Status" || r.status === statusFilter
  );

  // Review Actions (§8.4)
  function handleApprove(id: string) {
    setReqs((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "Approved" } : r))
    );
    setReviewReq(null);
  }

  function handleReject(id: string) {
    if (!rejectionReason.trim() || rejectionReason.trim().length < 20) {
      setReviewError("Rejection requires a non-empty reason note of at least 20 characters (§8.4).");
      return;
    }
    setReqs((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: "Rejected", rejectionReason: rejectionReason.trim() }
          : r
      )
    );
    setReviewReq(null);
    setRejectionReason("");
    setReviewError(null);
  }

  // Create Incident (§6.2)
  function handleCreateIncident() {
    if (!incDesc) return;
    const created: Incident = {
      id: `INC-50${incidents.length + 1}`,
      institution: incInst,
      date: new Date().toISOString().split("T")[0],
      description: incDesc,
      severity: incSev,
      status: "Open",
      owner: incOwner,
    };
    setIncidents([created, ...incidents]);
    setShowIncidentModal(false);
    setIncDesc("");
  }

  return (
    <AppShell
      title="Compliance Register"
      subtitle="Participant regulatory deadlines, submission returns, and incidents"
      breadcrumb="GOVERN › COMPLIANCE"
      scope="All Institutions"
      primaryAction={
        canManageComp ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowIncidentModal(true)}>
            Record New Incident
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#526174] font-sans font-medium">Submission Status:</span>
          {["All Status", "Pending", "Submitted", "Under Review", "Approved", "Rejected", "Overdue"].map((st) => (
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
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Overdue Compliance Submissions" value={reqs.filter(r => r.status === "Overdue").length.toString()} delta={{ dir: "up", text: "+1", tone: "bad" }} source="compliance-reg" freshness="live" />
        <KpiCard label="Submissions Under Review" value={reqs.filter(r => r.status === "Under Review").length.toString()} source="compliance-reg" freshness="live" />
        <KpiCard label="Open Incidents" value={incidents.filter(i => i.status !== "Closed" && i.status !== "Resolved").length.toString()} source="incidents-db" freshness="live" />
        <KpiCard label="12m Rolling Failure Rate" value="4.8%" delta={{ dir: "down", text: "-0.4pp", tone: "good" }} source="compliance-calc" freshness="live" />
      </div>

      {/* Main Table: Compliance Register (§5.8 REQ-COMP-001, REQ-COMP-002) */}
      <SectionCard title="Participant Compliance Register & Regulatory Directives" noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {["Requirement Name", "Regulatory Reference", "Institution", "Frequency", "Due Date", "Status", "Format", "Actions"].map((col) => (
                  <th key={col} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredReqs.map((req) => (
                <tr key={req.id} className={req.status === "Overdue" ? "bg-red-50/60 dark:bg-red-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}>
                  <td className="px-4 py-3 font-sans">
                    <div className="font-bold text-slate-900 dark:text-white">{req.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{req.id}</div>
                  </td>
                  <td className="px-4 py-3 text-[#56B4D3] font-semibold">{req.regulatoryRef}</td>
                  <td className="px-4 py-3 font-sans font-medium text-slate-800 dark:text-slate-200">{req.institution}</td>
                  <td className="px-4 py-3 text-slate-500">{req.frequency}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${req.status === "Overdue" ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}>
                      {req.dueDate}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      req.status === "Approved"
                        ? "bg-emerald-100 text-emerald-700"
                        : req.status === "Overdue"
                        ? "bg-red-100 text-red-700 font-extrabold"
                        : req.status === "Rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{req.format}</td>
                  <td className="px-4 py-3 font-sans">
                    {(req.status === "Under Review" || req.status === "Submitted") && canManageComp ? (
                      <button
                        onClick={() => {
                          setReviewReq(req);
                          setRejectionReason("");
                          setReviewError(null);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#56B4D3] text-[#092E3D] hover:bg-[#46A4C3] cursor-pointer"
                      >
                        Review Submission
                      </button>
                    ) : (
                      <button
                        onClick={() => alert(`Viewing record details for ${req.id}`)}
                        className="text-slate-400 hover:text-slate-600 text-xs font-medium"
                      >
                        View Record
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Incidents & Remediation Register (§5.8 REQ-COMP-006, REQ-COMP-007, §6.2) */}
      <div className="mt-6">
        <SectionCard title="Incident Register & Remediation Management (§6.2)" noPad>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {["Incident ID", "Institution", "Description", "Severity", "Status", "Owner", "Remediation Due"].map((col) => (
                    <th key={col} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {incidents.map((inc) => (
                  <tr key={inc.id}>
                    <td className="px-4 py-2.5 font-bold text-[#56B4D3]">{inc.id}</td>
                    <td className="px-4 py-2.5 font-sans font-medium text-slate-900 dark:text-white">{inc.institution}</td>
                    <td className="px-4 py-2.5 font-sans text-slate-700 dark:text-slate-300">{inc.description}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        inc.severity === "Critical" ? "bg-red-100 text-red-700 font-extrabold" : inc.severity === "High" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-sans">{inc.status}</td>
                    <td className="px-4 py-2.5 text-slate-500">{inc.owner}</td>
                    <td className="px-4 py-2.5 text-slate-500">{inc.remediationDue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* Submission Review Drawer (§8.4) */}
      {reviewReq && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-bold text-base text-slate-900 dark:text-white">Compliance Submission Review (§8.4)</h2>
                <p className="text-xs text-[#56B4D3] font-semibold">{reviewReq.institution} · {reviewReq.name}</p>
              </div>
              <button onClick={() => setReviewReq(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 font-mono space-y-1">
                <div>Requirement ID: <span className="font-bold text-slate-800 dark:text-slate-200">{reviewReq.id}</span></div>
                <div>Regulatory Ref: <span className="font-bold text-[#56B4D3]">{reviewReq.regulatoryRef}</span></div>
                <div>Submitted At: <span className="font-bold text-slate-700 dark:text-slate-300">{reviewReq.submittedAt ?? "Today"}</span></div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reviewer Notes / Rejection Reason (Mandatory min 20 chars if rejecting)
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide detailed compliance reviewer notes or explicit reasons for rejection…"
                  rows={3}
                  className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none"
                />
              </div>

              {reviewError && (
                <div className="text-red-500 font-bold text-xs p-2 rounded-lg bg-red-50 dark:bg-red-950/40">
                  {reviewError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setReviewReq(null)}>Cancel</SecondaryButton>
              <button
                onClick={() => handleReject(reviewReq.id)}
                className="px-4 py-2 rounded-full text-xs font-semibold bg-red-500 text-white hover:bg-red-600 cursor-pointer"
              >
                Reject Submission
              </button>
              <button
                onClick={() => handleApprove(reviewReq.id)}
                className="px-4 py-2 rounded-full text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer"
              >
                Approve Submission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Incident Modal (§6.2) */}
      {showIncidentModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Record Participant Incident (§6.2)</h2>
              <button onClick={() => setShowIncidentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Participant Institution</label>
                <select
                  value={incInst}
                  onChange={(e) => setIncInst(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Bank of Kigali">Bank of Kigali</option>
                  <option value="MTN Mobile Money">MTN Mobile Money</option>
                  <option value="Inkomoko MFI">Inkomoko MFI</option>
                  <option value="Zigama CSS SACCO">Zigama CSS SACCO</option>
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
                  onChange={(e) => setIncSev(e.target.value as IncidentSeverity)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Assigned Remediation Owner</label>
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
              <PrimaryButton onClick={handleCreateIncident}>Record Incident</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
