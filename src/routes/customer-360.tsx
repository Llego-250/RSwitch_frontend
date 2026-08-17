import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import {
  Building2,
  Smartphone,
  Landmark,
  FileSpreadsheet,
  Search,
  ShieldAlert,
  ShieldCheck,
  Activity,
  AlertTriangle,
  Clock,
  FileText,
  MessageSquare,
  Plus,
  X,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/customer-360")({
  component: Participant360,
});

type InstitutionType = "Commercial Bank" | "E-money Issuer" | "MFI" | "SACCO";

type Participant = {
  id: string;
  name: string;
  shortName: string;
  type: InstitutionType;
  registrationDate: string;
  contactName: string;
  contactEmail: string;
  status: "Active" | "Inactive" | "Suspended";
  historyMonths: number;
  // Risk Breakdown (§5.6 REQ-P360-010)
  complianceRiskScore: number;
  operationalRiskScore: number;
  technicalRiskScore: number;
  compositeRiskScore: number;
  integrations: { name: string; type: string; status: "healthy" | "warning" | "failed"; lastSync: string }[];
  submissions: { id: string; date: string; docName: string; status: "Approved" | "Under Review" | "Validation Failed"; records: number; errors: number }[];
  incidents: { id: string; title: string; severity: "Critical" | "High" | "Medium" | "Low"; status: "Open" | "Under Investigation" | "Resolved"; date: string }[];
  performance: { uptime: string; failureRate: string; avgLatency: string };
  outstandingActions: { id: string; action: string; owner: string; due: string }[];
  notes: { id: string; date: string; author: string; note: string }[];
};

const PARTICIPANTS: Participant[] = [
  {
    id: "INST-001",
    name: "Bank of Kigali Plc",
    shortName: "BK",
    type: "Commercial Bank",
    registrationDate: "2024-01-15",
    contactName: "Jean-Claude Mugabo",
    contactEmail: "jcmugabo@bk.rw",
    status: "Active",
    historyMonths: 18,
    complianceRiskScore: 12,
    operationalRiskScore: 18,
    technicalRiskScore: 10,
    compositeRiskScore: 13.4,
    integrations: [
      { name: "Core Banking Data Exchange", type: "Automated API", status: "healthy", lastSync: "5m ago" },
      { name: "SWIFT & Card Switch Feed", type: "Automated API", status: "healthy", lastSync: "15m ago" },
    ],
    submissions: [
      { id: "SUB-102", date: "2026-07-20", docName: "Q2 Prudential Return", status: "Approved", records: 128400, errors: 0 },
      { id: "SUB-098", date: "2026-06-15", docName: "AML Monthly Return", status: "Approved", records: 124100, errors: 0 },
    ],
    incidents: [
      { id: "INC-204", title: "API Gateway 504 Timeout", severity: "Low", status: "Resolved", date: "2026-06-02" },
    ],
    performance: { uptime: "99.94%", failureRate: "0.06%", avgLatency: "142 ms" },
    outstandingActions: [
      { id: "ACT-01", action: "Submit updated ISO 20022 mapping release notes", owner: "RSwitch Tech", due: "Jul 30" },
    ],
    notes: [
      { id: "n1", date: "2026-07-02", author: "Compliance Officer", note: "Annual prudential audit signed off with no major discrepancies." },
    ],
  },
  {
    id: "INST-002",
    name: "MTN Mobile Money Rwanda Ltd",
    shortName: "MTN MoMo",
    type: "E-money Issuer",
    registrationDate: "2024-03-10",
    contactName: "Aline Uwase",
    contactEmail: "aline.uwase@mtn.co.rw",
    status: "Active",
    historyMonths: 14,
    complianceRiskScore: 28,
    operationalRiskScore: 42,
    technicalRiskScore: 34,
    compositeRiskScore: 33.6,
    integrations: [
      { name: "Mobile Money Switch Feed", type: "Automated API", status: "warning", lastSync: "12m ago" },
    ],
    submissions: [
      { id: "SUB-105", date: "2026-07-22", docName: "E-money Volume Report", status: "Under Review", records: 84201, errors: 14 },
    ],
    incidents: [
      { id: "INC-210", title: "Unexplained Submission Error Rate Spike (+4.2%)", severity: "High", status: "Under Investigation", date: "2026-07-24" },
    ],
    performance: { uptime: "99.20%", failureRate: "1.80%", avgLatency: "380 ms" },
    outstandingActions: [
      { id: "ACT-02", action: "Investigate transaction payload error rate spike", owner: "MTN Compliance", due: "Jul 27" },
    ],
    notes: [
      { id: "n2", date: "2026-07-24", author: "Compliance Lead", note: "Triggered AI Anomaly alert under investigation by team." },
    ],
  },
  {
    id: "INST-003",
    name: "Inkomoko Microfinance Ltd",
    shortName: "Inkomoko",
    type: "MFI",
    registrationDate: "2026-06-01",
    contactName: "David Ntaganda",
    contactEmail: "dntaganda@inkomoko.rw",
    status: "Active",
    historyMonths: 1.5, // Less than 3 months! (§5.6 REQ-P360-012)
    complianceRiskScore: 0,
    operationalRiskScore: 0,
    technicalRiskScore: 0,
    compositeRiskScore: 0,
    integrations: [
      { name: "Quarterly Regulatory Upload", type: "Manual Upload", status: "failed", lastSync: "3h ago" },
    ],
    submissions: [
      { id: "SUB-801", date: "2026-07-24", docName: "Inkomoko_Q2_Portfolio.csv", status: "Validation Failed", records: 0, errors: 3 },
    ],
    incidents: [
      { id: "INC-215", title: "Manual Upload Schema Validation Failure", severity: "Medium", status: "Open", date: "2026-07-24" },
    ],
    performance: { uptime: "—", failureRate: "100%", avgLatency: "—" },
    outstandingActions: [
      { id: "ACT-03", action: "Re-upload corrected loan portfolio CSV file", owner: "Inkomoko MFI", due: "Jul 28" },
    ],
    notes: [],
  },
];

function Participant360() {
  const { role } = useRole();
  const canAddNote = role === "compliance";

  const [selectedInstId, setSelectedInstId] = useState<string>("INST-001");
  const [search, setSearch]                 = useState("");
  const [newNoteText, setNewNoteText]       = useState("");

  const currentInst = PARTICIPANTS.find((p) => p.id === selectedInstId) || PARTICIPANTS[0];

  const filteredInsts = PARTICIPANTS.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.shortName.toLowerCase().includes(search.toLowerCase()) ||
      p.type.toLowerCase().includes(search.toLowerCase())
  );

  function handleAddNote() {
    if (!newNoteText.trim()) return;
    currentInst.notes.unshift({
      id: `note-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      author: "Compliance User",
      note: newNoteText.trim(),
    });
    setNewNoteText("");
  }

  return (
    <AppShell
      title="Participant 360 — Financial Institution Profiles (§5.6)"
      breadcrumb="GOVERN › PARTICIPANT 360"
      scope="Institutional Intelligence"
      toolbar={
        <div className="flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search participating bank, e-money issuer, MFI, SACCO…"
              className="h-8 pl-8 pr-3 rounded-lg text-xs w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>
          <div className="text-xs text-slate-500 font-mono">
            REQ-P360-013: Individual Customer Data Excluded (Institution Scope Only)
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Side: Institution Selector List */}
        <div className="lg:col-span-4 space-y-3">
          <h2 className="font-bold text-xs uppercase tracking-wider text-slate-400">Participating Institutions</h2>
          <div className="space-y-2">
            {filteredInsts.map((inst) => {
              const selected = inst.id === currentInst.id;
              return (
                <div
                  key={inst.id}
                  onClick={() => setSelectedInstId(inst.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    selected
                      ? "bg-[#56B4D3]/15 border-[#56B4D3] text-slate-900 dark:text-white shadow-xs"
                      : "bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm">{inst.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 font-semibold text-slate-600 dark:text-slate-300">
                      {inst.type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono mt-2">
                    <span>Contact: {inst.contactName}</span>
                    <span>Joined: {inst.registrationDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Consolidated Profile View (§5.6 & §8.1) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Institution Header Card */}
          <SectionCard noPad>
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-[#56B4D3] text-[#092E3D] font-bold text-lg flex items-center justify-center shadow-xs">
                    {currentInst.shortName.charAt(0)}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">{currentInst.name}</h1>
                    <p className="text-xs text-slate-500 font-mono">
                      {currentInst.id} · {currentInst.type} · Reg: {currentInst.registrationDate}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge status={currentInst.status === "Active" ? "healthy" : "failed"} />
                <div className="text-right text-xs font-mono">
                  <span className="block text-[10px] text-slate-400">Assigned Contact</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{currentInst.contactName}</span>
                </div>
              </div>
            </div>

            {/* Composite Risk Score Banner (§5.6 REQ-P360-009, REQ-P360-010, REQ-P360-012) */}
            <div className="p-6 bg-slate-50/80 dark:bg-slate-900/40">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3">
                Participant Risk Assessment (Release 2 Methodology)
              </h3>

              {currentInst.historyMonths < 3 ? (
                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 flex items-center gap-3">
                  <Clock className="h-5 w-5 text-amber-500 shrink-0" />
                  <div>
                    <span className="font-bold text-xs text-amber-700 dark:text-amber-300 block">Insufficient Data — Score Pending (REQ-P360-012)</span>
                    <span className="text-[11px] text-slate-600 dark:text-slate-300">
                      Minimum 3 months of submission history required to calculate risk score. Current history: {currentInst.historyMonths} months.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Composite Risk Score</span>
                    <span className="text-2xl font-bold font-mono text-[#56B4D3]">{currentInst.compositeRiskScore} / 100</span>
                    <span className="text-[10px] text-slate-500 block mt-1">Weighted Average Score</span>
                  </div>
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Compliance Risk (30%)</span>
                    <span className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100">{currentInst.complianceRiskScore} / 100</span>
                    <span className="text-[10px] text-emerald-500 block mt-1">Adherence & Deadlines</span>
                  </div>
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Operational Risk (20%)</span>
                    <span className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100">{currentInst.operationalRiskScore} / 100</span>
                    <span className="text-[10px] text-amber-500 block mt-1">Incidents & Severity</span>
                  </div>
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Technical Risk (30%)</span>
                    <span className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100">{currentInst.technicalRiskScore} / 100</span>
                    <span className="text-[10px] text-emerald-500 block mt-1">Uptime & Latency</span>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Profile Sections Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Section 1: Integration Status */}
            <SectionCard title="Connected Integration Status (§5.6 REQ-P360-003)">
              <div className="space-y-2">
                {currentInst.integrations.map((int, i) => (
                  <div key={i} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between text-xs font-mono">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">{int.name}</span>
                      <span className="text-[11px] text-slate-400">{int.type} · Sync: {int.lastSync}</span>
                    </div>
                    <StatusBadge status={int.status} />
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Section 2: Technical Performance (REQ-P360-007) */}
            <SectionCard title="Technical Performance (30d Rolling)">
              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Uptime</span>
                  <span className="font-bold text-sm text-emerald-500">{currentInst.performance.uptime}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Failure Rate</span>
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{currentInst.performance.failureRate}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Avg Latency</span>
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{currentInst.performance.avgLatency}</span>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Section 3: Data Submission History Log (REQ-P360-004) */}
          <SectionCard title="Chronological Data Submission Log" noPad>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Sub ID</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Document Name</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Records</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {currentInst.submissions.map((sub) => (
                    <tr key={sub.id}>
                      <td className="px-4 py-2.5 font-bold text-slate-700 dark:text-slate-300">{sub.id}</td>
                      <td className="px-4 py-2.5 text-slate-500">{sub.date}</td>
                      <td className="px-4 py-2.5 font-sans font-medium text-slate-900 dark:text-white">{sub.docName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          sub.status === "Approved" ? "bg-emerald-100 text-emerald-700" : sub.status === "Under Review" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        }`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold">{sub.records.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Section 4: Incidents & Remediation (REQ-P360-006) */}
          <SectionCard title="Associated Incidents & Remediation Items">
            <div className="space-y-2">
              {currentInst.incidents.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">No open or resolved incidents recorded for this institution.</p>
              ) : (
                currentInst.incidents.map((inc) => (
                  <div key={inc.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-500 mr-2">{inc.id}</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{inc.title}</span>
                      <span className="text-[11px] text-slate-400 block font-mono">Date: {inc.date}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                      inc.severity === "Critical" ? "bg-red-100 text-red-700" : inc.severity === "High" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {inc.severity} · {inc.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          {/* Section 5: Compliance Notes & Annotations (REQ-P360-014) */}
          <SectionCard title="Compliance Officer Notes & Annotations (§5.6 REQ-P360-014)">
            <div className="space-y-3">
              {canAddNote && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Add internal compliance note or observation…"
                    className="flex-1 h-9 px-3 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  />
                  <PrimaryButton onClick={handleAddNote}>Add Note</PrimaryButton>
                </div>
              )}

              <div className="space-y-2">
                {currentInst.notes.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">No notes recorded yet.</p>
                ) : (
                  currentInst.notes.map((n) => (
                    <div key={n.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span className="font-bold text-[#56B4D3]">{n.author}</span>
                        <span>{n.date}</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{n.note}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
