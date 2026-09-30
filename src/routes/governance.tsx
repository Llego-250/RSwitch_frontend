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
import { canManage } from "@/lib/roles";
import {
  Scale,
  Calendar,
  FileText,
  Plus,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Upload,
  X,
  Filter,
  UserCheck,
} from "lucide-react";

export const Route = createFileRoute("/governance")({
  component: Governance,
});

type DocCategory = "Policy" | "Minutes" | "Decision" | "Working Paper" | "Other";

type GovDocument = {
  id: string;
  title: string;
  category: DocCategory;
  committee: string;
  version: string;
  uploadedBy: string;
  uploadDate: string;
  accessLevel: "Internal" | "Restricted";
};

type ActionItemStatus = "Open" | "In Progress" | "Completed" | "Overdue";

type ActionItem = {
  id: string;
  description: string;
  owner: string;
  committee: string;
  dueDate: string;
  status: ActionItemStatus;
};

type MeetingRecord = {
  id: string;
  title: string;
  committee: string;
  date: string;
  attendeesCount: number;
  decisionsCount: number;
  minutesDoc?: string;
};

const INITIAL_DOCS: GovDocument[] = [
  { id: "DOC-101", title: "National Switch Governance Charter 2026", category: "Policy", committee: "Board", version: "v2.0", uploadedBy: "Compliance Officer", uploadDate: "2026-06-15", accessLevel: "Internal" },
  { id: "DOC-102", title: "Steering Committee Meeting Minutes - Q2", category: "Minutes", committee: "Steering Committee", version: "v1.0", uploadedBy: "Board Secretary", uploadDate: "2026-07-01", accessLevel: "Restricted" },
  { id: "DOC-103", title: "API Interoperability Technical Standard", category: "Working Paper", committee: "Technical Working Group", version: "v3.1", uploadedBy: "Technical Lead", uploadDate: "2026-07-10", accessLevel: "Internal" },
  { id: "DOC-104", title: "Resolution on Mobile Money Settlement Window", category: "Decision", committee: "Operations Working Group", version: "v1.2", uploadedBy: "Compliance User", uploadDate: "2026-07-18", accessLevel: "Internal" },
];

const INITIAL_ACTIONS: ActionItem[] = [
  { id: "ACT-801", description: "Submit corrected schema mapping for MFI ingestion", owner: "Inkomoko MFI", committee: "Technical Working Group", dueDate: "2026-07-20", status: "Overdue" },
  { id: "ACT-802", description: "Review BNR Directive 07/2024 compliance deadline extension", owner: "RSwitch Compliance", committee: "Steering Committee", dueDate: "2026-07-28", status: "In Progress" },
  { id: "ACT-803", description: "Update e-money settlement risk weights in Settings", owner: "Risk Manager", committee: "Operations Working Group", dueDate: "2026-08-05", status: "Open" },
  { id: "ACT-804", description: "Finalize ISO 20022 message specs for SACCOs", owner: "Data Architect", committee: "Technical Working Group", dueDate: "2026-07-15", status: "Completed" },
];

const MEETINGS: MeetingRecord[] = [
  { id: "MTG-401", title: "Board Quarterly Governance Session", committee: "Board", date: "2026-08-12 10:00", attendeesCount: 9, decisionsCount: 4, minutesDoc: "Board_Minutes_Q2.pdf" },
  { id: "MTG-402", title: "Technical Working Group Bi-Weekly Sync", committee: "Technical Working Group", date: "2026-07-30 14:00", attendeesCount: 14, decisionsCount: 2 },
  { id: "MTG-403", title: "Steering Committee Interoperability Review", committee: "Steering Committee", date: "2026-07-15 09:30", attendeesCount: 11, decisionsCount: 3, minutesDoc: "Steering_Minutes_Jul.pdf" },
];

const WORKING_GROUPS = [
  { name: "Board of Directors", chair: "RSwitch Chairman", members: "9 RSwitch & Board Members" },
  { name: "Steering Committee", chair: "Head of Compliance", members: "12 Participant Executives" },
  { name: "Technical Working Group", chair: "Chief Technology Officer", members: "18 IT Leads & Architects" },
  { name: "Operations Working Group", chair: "Head of Operations", members: "15 Settlement Officers" },
];

function Governance() {
  const { role } = useRole();
  const canManageGov = canManage(role, "governance"); // Compliance manages, Business/Tech view (§5.7 REQ-GOV-011)

  const [docs, setDocs]                     = useState<GovDocument[]>(INITIAL_DOCS);
  const [actions, setActions]               = useState<ActionItem[]>(INITIAL_ACTIONS);
  const [categoryFilter, setCategoryFilter] = useState<string>("All Categories");

  // Modals state
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);
  const [showMeetingModal, setShowMeetingModal]     = useState(false);

  // New Doc Form
  const [newTitle, setNewTitle]     = useState("");
  const [newCat, setNewCat]         = useState<DocCategory>("Policy");
  const [newCommittee, setNewCommittee] = useState("Board");
  const [newVersion, setNewVersion] = useState("v1.0");

  // New Meeting Form
  const [mtgTitle, setMtgTitle]     = useState("");
  const [mtgCommittee, setMtgCommittee] = useState("Steering Committee");
  const [mtgDate, setMtgDate]           = useState("2026-08-10 10:00");

  const filteredDocs = docs.filter(
    (d) => categoryFilter === "All Categories" || d.category === categoryFilter
  );

  const overdueActions = actions.filter((a) => a.status === "Overdue");

  function handleUploadDoc() {
    if (!newTitle) return;
    const doc: GovDocument = {
      id: `DOC-10${docs.length + 1}`,
      title: newTitle,
      category: newCat,
      committee: newCommittee,
      version: newVersion,
      uploadedBy: role === "compliance" ? "Compliance User" : "Authorized User",
      uploadDate: new Date().toISOString().split("T")[0],
      accessLevel: "Internal",
    };
    setDocs([doc, ...docs]);
    setShowUploadDocModal(false);
    setNewTitle("");
  }

  function handleCompleteAction(id: string) {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "Completed" } : a))
    );
  }

  return (
    <AppShell
      title="Governance Center"
      subtitle="Board & Committee Management"
      breadcrumb="GOVERN › GOVERNANCE"
      scope="Board & Working Groups"
      primaryAction={
        canManageGov ? (
          <div className="flex items-center gap-2">
            <SecondaryButton icon={<Calendar className="h-4 w-4" />} onClick={() => setShowMeetingModal(true)}>
              Schedule Meeting
            </SecondaryButton>
            <PrimaryButton icon={<Upload className="h-4 w-4" />} onClick={() => setShowUploadDocModal(true)}>
              Upload Governance Document
            </PrimaryButton>
          </div>
        ) : undefined
      }
      toolbar={
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#526174] font-sans font-medium">Category Filter:</span>
          {["All Categories", "Policy", "Minutes", "Decision", "Working Paper"].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`h-7 px-3 rounded-lg text-xs font-sans font-medium border transition-colors cursor-pointer ${
                categoryFilter === cat
                  ? "bg-[#168FA8] text-white font-semibold border-[#168FA8]"
                  : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
              }`}
            >
              {cat}
            </button>
          ))}
          <div className="ml-auto text-xs font-sans text-[#7B8798]">
            REQ-GOV-011: Business & Tech View Only · Compliance Manage
          </div>
        </div>
      }
    >
      {/* Overdue Action Items Banner (§5.7 REQ-GOV-007) */}
      {overdueActions.length > 0 && (
        <div className="mb-5 p-4 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div>
              <span className="font-bold text-xs text-red-700 dark:text-red-300 block">
                {overdueActions.length} Overdue Governance Action Items (§5.7 REQ-GOV-007)
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-300">
                Automated escalation notifications delivered to Committee Chair.
              </span>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-red-600">Action Required</span>
        </div>
      )}

      {/* Main Grid: Document Repository & Meetings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
        {/* Left 7 cols: Document Repository (§5.7 REQ-GOV-002, REQ-GOV-003) */}
        <div className="lg:col-span-7 space-y-4">
          <SectionCard title="Documents" noPad>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Title & Category</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Committee</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Version</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Uploaded</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {filteredDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-sans">
                        <div className="font-bold text-slate-900 dark:text-white">{doc.title}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {doc.id} · <span className="text-[#168FA8] font-bold">{doc.category}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{doc.committee}</td>
                      <td className="px-4 py-2.5 font-bold text-[#168FA8]">{doc.version}</td>
                      <td className="px-4 py-2.5 text-slate-500">{doc.uploadDate}</td>
                      <td className="px-4 py-2.5 text-right font-sans">
                        <button
                          onClick={() => alert(`Simulated download for ${doc.title}`)}
                          className="inline-flex items-center gap-1 font-semibold text-[#168FA8] hover:underline cursor-pointer"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Right 5 cols: Scheduled Meetings & Calendar (§5.7 REQ-GOV-004) */}
        <div className="lg:col-span-5 space-y-4">
          <SectionCard title="Meetings">
            <div className="space-y-3">
              {MEETINGS.map((mtg) => (
                <div key={mtg.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">{mtg.title}</span>
                    <span className="font-mono text-[10px] font-semibold text-[#168FA8] px-2 py-0.5 rounded bg-[#168FA8]/15">
                      {mtg.committee}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400" />{mtg.date}</span>
                    <span>{mtg.attendeesCount} Attendees</span>
                    <span>{mtg.decisionsCount} Decisions Recorded</span>
                  </div>
                  {mtg.minutesDoc && (
                    <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px]">
                      <span className="font-mono text-slate-400 flex items-center gap-1"><FileText className="h-3 w-3" />{mtg.minutesDoc}</span>
                      <button onClick={() => alert(`Opening minutes for ${mtg.title}`)} className="text-[#168FA8] hover:underline font-semibold">View Minutes</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Bottom Grid: Action Items Register & Working Group Membership */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Action Items (7 cols REQ-GOV-006) */}
        <div className="lg:col-span-7">
          <SectionCard title="Action Items" noPad>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Assigned Owner</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Due Date</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {actions.map((act) => (
                    <tr key={act.id} className={act.status === "Overdue" ? "bg-red-50/50 dark:bg-red-950/20" : ""}>
                      <td className="px-4 py-2.5 font-sans font-medium text-slate-900 dark:text-white">{act.description}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{act.owner}</td>
                      <td className="px-4 py-2.5 text-slate-500">{act.dueDate}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          act.status === "Completed" ? "bg-emerald-100 text-emerald-700" : act.status === "Overdue" ? "bg-red-100 text-red-700 font-bold" : "bg-amber-100 text-amber-700"
                        }`}>
                          {act.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-sans">
                        {act.status !== "Completed" && canManageGov && (
                          <button
                            onClick={() => handleCompleteAction(act.id)}
                            className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
                          >
                            Mark Complete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Working Group Register (5 cols REQ-GOV-008) */}
        <div className="lg:col-span-5">
          <SectionCard title="Working Groups">
            <div className="space-y-3">
              {WORKING_GROUPS.map((wg, idx) => (
                <div key={idx} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                    <span>{wg.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">{wg.members}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">Chairperson: <span className="font-semibold text-slate-700 dark:text-slate-300">{wg.chair}</span></div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Upload Document Modal */}
      {showUploadDocModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Upload Governance Document</h2>
              <button onClick={() => setShowUploadDocModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Document Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. National Switch Security Policy 2026"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <select
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value as DocCategory)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Policy">Policy</option>
                  <option value="Minutes">Minutes</option>
                  <option value="Decision">Decision</option>
                  <option value="Working Paper">Working Paper</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Associated Committee</label>
                <select
                  value={newCommittee}
                  onChange={(e) => setNewCommittee(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Board">Board of Directors</option>
                  <option value="Steering Committee">Steering Committee</option>
                  <option value="Technical Working Group">Technical Working Group</option>
                  <option value="Operations Working Group">Operations Working Group</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Version String</label>
                <input
                  type="text"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="v1.0"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowUploadDocModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={handleUploadDoc}>Save Document</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Meeting Modal */}
      {showMeetingModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Schedule Governance Meeting Record</h2>
              <button onClick={() => setShowMeetingModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Meeting Title</label>
                <input
                  type="text"
                  value={mtgTitle}
                  onChange={(e) => setMtgTitle(e.target.value)}
                  placeholder="e.g. Steering Committee Interoperability Review"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Committee / Working Group</label>
                <select
                  value={mtgCommittee}
                  onChange={(e) => setMtgCommittee(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Steering Committee">Steering Committee</option>
                  <option value="Board">Board of Directors</option>
                  <option value="Technical Working Group">Technical Working Group</option>
                  <option value="Operations Working Group">Operations Working Group</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Date & Time</label>
                <input
                  type="text"
                  value={mtgDate}
                  onChange={(e) => setMtgDate(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowMeetingModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={() => setShowMeetingModal(false)}>Save Meeting Record</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
