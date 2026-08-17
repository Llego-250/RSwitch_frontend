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
import { canManage } from "@/lib/roles";
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

type ReportCategory = "Compliance Summary" | "Integration Health" | "Participant Performance" | "Financial Inclusion" | "Incident Report";

type ReportItem = {
  id: string;
  name: string;
  category: ReportCategory;
  author: string;
  generatedDate: string;
  format: "PDF" | "XLSX";
  size: string;
  institutionTypeFilter: string;
  regionFilter: string;
};

const INITIAL_REPORTS: ReportItem[] = [
  { id: "RPT-001", name: "Q2 2026 Participant Compliance Summary", category: "Compliance Summary", author: "Compliance Officer", generatedDate: "2026-07-22 09:14", format: "PDF", size: "2.4 MB", institutionTypeFilter: "All Types", regionFilter: "National" },
  { id: "RPT-002", name: "National Switch Integration Health Matrix", category: "Integration Health", author: "Technical Lead", generatedDate: "2026-07-20 14:32", format: "XLSX", size: "1.8 MB", institutionTypeFilter: "Commercial Bank", regionFilter: "Kigali" },
  { id: "RPT-003", name: "Participant Composite Performance Ranking", category: "Participant Performance", author: "Business User", generatedDate: "2026-07-18 11:00", format: "PDF", size: "3.1 MB", institutionTypeFilter: "All Types", regionFilter: "National" },
  { id: "RPT-004", name: "MFI & SACCO Financial Inclusion Impact", category: "Financial Inclusion", author: "Business Lead", generatedDate: "2026-07-15 16:44", format: "XLSX", size: "4.5 MB", institutionTypeFilter: "MFI", regionFilter: "Southern Province" },
  { id: "RPT-005", name: "Monthly Operational Incident Log", category: "Incident Report", author: "Compliance User", generatedDate: "2026-07-10 10:00", format: "PDF", size: "1.2 MB", institutionTypeFilter: "E-money Issuer", regionFilter: "National" },
];

const SCHEDULES = [
  { id: "SCH-1", reportName: "Weekly Integration Health Matrix", frequency: "Weekly (Mondays 08:00)", recipient: "tech-team@rswitch.rw", active: true },
  { id: "SCH-2", reportName: "Monthly Compliance Executive Digest", frequency: "Monthly (1st at 09:00)", recipient: "compliance-board@rswitch.rw", active: true },
];

function Reports() {
  const { role } = useRole();
  const canGenerateReports = canManage(role, "reports");

  const [reports, setReports]             = useState<ReportItem[]>(INITIAL_REPORTS);
  const [search, setSearch]               = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All Categories");

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Generate Form (§14)
  const [genCategory, setGenCategory] = useState<ReportCategory>("Compliance Summary");
  const [genTitle, setGenTitle]       = useState("Custom Regulatory Compliance Report");
  const [genFormat, setGenFormat]     = useState<"PDF" | "XLSX">("PDF");
  const [genInstType, setGenInstType] = useState("All Types");
  const [genRegion, setGenRegion]     = useState("National");

  // Schedule Form (§5.11 REQ-RPT-005)
  const [schedName, setSchedName]     = useState("Monthly Incident Summary Digest");
  const [schedFreq, setSchedFreq]     = useState("Monthly");
  const [schedEmail, setSchedEmail]   = useState("management@rswitch.rw");

  const filtered = reports.filter((r) => {
    const matchSearch =
      search.trim() === "" ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "All Categories" || r.category === categoryFilter;
    return matchSearch && matchCat;
  });

  function handleGenerateSubmit() {
    if (!genTitle) return;
    const created: ReportItem = {
      id: `RPT-00${reports.length + 1}`,
      name: genTitle,
      category: genCategory,
      author: `${role.toUpperCase()} User`,
      generatedDate: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      format: genFormat,
      size: "2.1 MB",
      institutionTypeFilter: genInstType,
      regionFilter: genRegion,
    };
    setReports([created, ...reports]);
    setShowGenerateModal(false);
  }

  function handleSimulateDownload(report: ReportItem) {
    alert(`Downloading ${report.name} as ${report.format} file…`);
  }

  return (
    <AppShell
      title="Structured Report Generator & History (§5.11 & §14)"
      breadcrumb="INTELLIGENCE › REPORTS"
      scope="Official Reporting Engine"
      primaryAction={
        canGenerateReports ? (
          <div className="flex items-center gap-2">
            <SecondaryButton icon={<Clock className="h-4 w-4" />} onClick={() => setShowScheduleModal(true)}>
              Schedule Recurring Report
            </SecondaryButton>
            <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowGenerateModal(true)}>
              Generate New Report
            </PrimaryButton>
          </div>
        ) : undefined
      }
      toolbar={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports by name or category…"
              className="h-8 pl-8 pr-3 rounded-lg text-xs w-64 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {["All Categories", "Compliance Summary", "Integration Health", "Participant Performance", "Financial Inclusion", "Incident Report"].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === cat
                    ? "bg-[#56B4D3] text-[#092E3D] font-bold border-[#56B4D3]"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {/* 5 Official Report Categories Grid (§14) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { title: "Compliance Summary", code: "§14.1", desc: "Overview of compliance status across participants" },
          { title: "Integration Health", code: "§14.2", desc: "Summary of integration statuses & pipeline runs" },
          { title: "Participant Performance", code: "§14.3", desc: "Ranked view of participants by operational risk" },
          { title: "Financial Inclusion", code: "§14.4", desc: "Aggregated inclusion metrics by institution type" },
          { title: "Incident Report", code: "§14.5", desc: "Comprehensive incident log & remediation items" },
        ].map((cat, idx) => (
          <div
            key={idx}
            onClick={() => {
              setGenCategory(cat.title as ReportCategory);
              setGenTitle(`RDIP ${cat.title} - ${new Date().toISOString().split("T")[0]}`);
              setShowGenerateModal(true);
            }}
            className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#56B4D3] transition-all cursor-pointer shadow-xs space-y-1"
          >
            <span className="font-mono text-[10px] font-bold text-[#56B4D3] block">{cat.code}</span>
            <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-snug">{cat.title}</h4>
            <p className="text-[11px] text-slate-500 line-clamp-2">{cat.desc}</p>
          </div>
        ))}
      </div>

      {/* Main Table: Report History Log (§5.11 REQ-RPT-004) */}
      <SectionCard title="Generated System Reports History Log (REQ-RPT-004)" noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {["Report Name & ID", "Category", "Generated Date", "Author", "Applied Filters", "Format", "Actions"].map((col) => (
                  <th key={col} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filtered.map((rpt) => (
                <tr key={rpt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-sans">
                    <div className="font-bold text-slate-900 dark:text-white">{rpt.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{rpt.id} · Size: {rpt.size}</div>
                  </td>
                  <td className="px-4 py-3 text-[#56B4D3] font-bold">{rpt.category}</td>
                  <td className="px-4 py-3 text-slate-500">{rpt.generatedDate}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-sans">{rpt.author}</td>
                  <td className="px-4 py-3 text-slate-400">{rpt.institutionTypeFilter} ({rpt.regionFilter})</td>
                  <td className="px-4 py-3 font-bold">{rpt.format}</td>
                  <td className="px-4 py-3 font-sans">
                    <button
                      onClick={() => handleSimulateDownload(rpt)}
                      className="inline-flex items-center gap-1 font-semibold text-[#56B4D3] hover:underline cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download {rpt.format}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Scheduled Recurring Reports Section (§5.11 REQ-RPT-005) */}
      <div className="mt-6">
        <SectionCard title="Scheduled Recurring Reports (REQ-RPT-005)">
          <div className="space-y-2">
            {SCHEDULES.map((s) => (
              <div key={s.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white font-sans block">{s.reportName}</span>
                  <span className="text-[11px] text-slate-500">{s.frequency} · Recipient: {s.recipient}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                  Scheduled
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Generate Report Modal (§14) */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Generate Structured Report (§14)</h2>
              <button onClick={() => setShowGenerateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Report Category (§14)</label>
                <select
                  value={genCategory}
                  onChange={(e) => setGenCategory(e.target.value as ReportCategory)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Compliance Summary">Compliance Summary Report (§14.1)</option>
                  <option value="Integration Health">Integration Health Report (§14.2)</option>
                  <option value="Participant Performance">Participant Performance Report (§14.3)</option>
                  <option value="Financial Inclusion">Financial Inclusion Report (§14.4)</option>
                  <option value="Incident Report">Incident Report (§14.5)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Report Title</label>
                <input
                  type="text"
                  value={genTitle}
                  onChange={(e) => setGenTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Export Format (§14)</label>
                <select
                  value={genFormat}
                  onChange={(e) => setGenFormat(e.target.value as "PDF" | "XLSX")}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="PDF">PDF Document (Formatted Report)</option>
                  <option value="XLSX">Excel Spreadsheet (XLSX Data Matrix)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Filter Institution Type</label>
                  <select
                    value={genInstType}
                    onChange={(e) => setGenInstType(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="All Types">All Types</option>
                    <option value="Commercial Bank">Commercial Bank</option>
                    <option value="E-money Issuer">E-money Issuer</option>
                    <option value="MFI">MFI</option>
                    <option value="SACCO">SACCO</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Filter Region</label>
                  <select
                    value={genRegion}
                    onChange={(e) => setGenRegion(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="National">National (All)</option>
                    <option value="Kigali">Kigali</option>
                    <option value="Eastern Province">Eastern Province</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowGenerateModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={handleGenerateSubmit}>Generate Report</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Recurring Report Modal (§5.11 REQ-RPT-005) */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Schedule Recurring Report (REQ-RPT-005)</h2>
              <button onClick={() => setShowScheduleModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Report Name</label>
                <input
                  type="text"
                  value={schedName}
                  onChange={(e) => setSchedName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Frequency</label>
                <select
                  value={schedFreq}
                  onChange={(e) => setSchedFreq(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="Daily">Daily (Every morning 08:00)</option>
                  <option value="Weekly">Weekly (Every Monday 08:00)</option>
                  <option value="Monthly">Monthly (1st of month 09:00)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Automated Email Recipient</label>
                <input
                  type="email"
                  value={schedEmail}
                  onChange={(e) => setSchedEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowScheduleModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={() => setShowScheduleModal(false)}>Save Schedule</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
