import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
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
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Brain,
  Activity,
  TrendingUp,
  AlertTriangle,
  Eye,
  CheckCircle2,
  Sliders,
  X,
  FileText,
  Clock,
  ArrowRight,
  ShieldAlert,
  Lock,
} from "lucide-react";

export const Route = createFileRoute("/ai")({
  component: AIPage,
});

type AlertStatus = "Generated" | "Acknowledged" | "Under Investigation" | "Resolved" | "Escalated" | "Closed";

type BaselineMethod = "Predefined Thresholds (Release 1)" | "Rolling 6-Month Baseline (Release 2)" | "Peer-Group Baseline (Release 3)";

type AIAlert = {
  id: string;
  institution: string;
  indicator: string;
  baselineVal: string;
  observedVal: string;
  deviation: string;
  recommendedArea: string;
  status: AlertStatus;
  baselineMethod: BaselineMethod;
  createdDate: string;
  daysInState: number;
  notes: { date: string; user: string; text: string }[];
  resolutionSummary?: string;
};

const INITIAL_AI_ALERTS: AIAlert[] = [
  {
    id: "ALT-901",
    institution: "MTN Mobile Money",
    indicator: "Sudden Spike in Submission Error Rate",
    baselineVal: "0.2%",
    observedVal: "4.4%",
    deviation: "+2100%",
    recommendedArea: "API Payload Serializer & MSISDN Hashing Module",
    status: "Acknowledged",
    baselineMethod: "Rolling 6-Month Baseline (Release 2)",
    createdDate: "2026-07-22",
    daysInState: 4, // > 3 days -> triggers auto-escalation check (§5.9 REQ-AI-006b)
    notes: [
      { date: "2026-07-22 10:15", user: "Compliance User", text: "Acknowledged anomaly alert. Assigned to technical integration team for payload audit." },
    ],
  },
  {
    id: "ALT-902",
    institution: "Inkomoko MFI",
    indicator: "Unexplained PAR_30d Metric Deviation",
    baselineVal: "3.1%",
    observedVal: "-5.2%",
    deviation: "Negative PAR (Schema violation)",
    recommendedArea: "Manual CSV Upload Row #42 Data Formatting",
    status: "Generated",
    baselineMethod: "Predefined Thresholds (Release 1)",
    createdDate: "2026-07-24",
    daysInState: 0,
    notes: [],
  },
  {
    id: "ALT-903",
    institution: "Zigama CSS SACCO",
    indicator: "Submission Latency Delay",
    baselineVal: "45 mins",
    observedVal: "4h 12m",
    deviation: "+460%",
    recommendedArea: "SACCO Monthly Financial Return Transmission Schedule",
    status: "Under Investigation",
    baselineMethod: "Rolling 6-Month Baseline (Release 2)",
    createdDate: "2026-07-21",
    daysInState: 2,
    notes: [
      { date: "2026-07-21 11:00", user: "Compliance User", text: "Logged awareness note. Investigating network routing latency." },
      { date: "2026-07-22 09:30", user: "Technical Lead", text: "Contacted SACCO IT team regarding network gateway upgrade." },
    ],
  },
  {
    id: "ALT-904",
    institution: "Bank of Kigali",
    indicator: "SWIFT Message Field Translation Warning",
    baselineVal: "0 warnings",
    observedVal: "3 warnings",
    deviation: "Unmapped optional fields",
    recommendedArea: "ISO 20022 Field Mapping Rule #8",
    status: "Closed",
    baselineMethod: "Rolling 6-Month Baseline (Release 2)",
    createdDate: "2026-07-15",
    daysInState: 0,
    notes: [
      { date: "2026-07-15 14:00", user: "Compliance User", text: "Acknowledged minor mapping warning." },
      { date: "2026-07-16 10:00", user: "Technical Lead", text: "Field mapping updated to v3.1." },
    ],
    resolutionSummary: "Field mapping definition updated in Standards & Mapping v3.1 to include optional swift remittance tags. Verified clean ingestion.",
  },
];

const TREND_DATA = [
  { month: "May", errorRate: 0.8, latency: 120, alerts: 2 },
  { month: "Jun", errorRate: 0.6, latency: 110, alerts: 1 },
  { month: "Jul", errorRate: 2.4, latency: 240, alerts: 4 },
];

const PRIORITY_PARTICIPANTS = [
  { rank: 1, name: "MTN Mobile Money", type: "E-money Issuer", score: "88.4 / 100", reason: "Error Rate Spike (+2100%)", status: "High Priority" },
  { rank: 2, name: "Inkomoko MFI", type: "MFI", score: "74.2 / 100", reason: "PAR Negative Value Error", status: "Medium Priority" },
  { rank: 3, name: "Zigama CSS SACCO", type: "SACCO", score: "62.0 / 100", reason: "Latency Delay (+460%)", status: "Medium Priority" },
  { rank: 4, name: "Bank of Kigali", type: "Commercial Bank", score: "12.0 / 100", reason: "Clean Operational Profile", status: "Low Priority" },
];

function AIPage() {
  const { role } = useRole();
  const canManageAI = canManage(role, "ai"); // Business manages, Compliance/Tech view (§5.9)

  const [alerts, setAlerts]               = useState<AIAlert[]>(INITIAL_AI_ALERTS);
  const [selectedAlert, setSelectedAlert] = useState<AIAlert | null>(null);
  const [actionNote, setActionNote]       = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [actionError, setActionError]     = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Threshold Config (§5.9 REQ-AI-012)
  const [devThreshold, setDevThreshold]   = useState("200%");
  const [autoEscalateDays, setAutoEscalateDays] = useState("3");

  // State Transition Handlers enforcing REQ-AI-006a, REQ-AI-006b, REQ-AI-006c
  function handleTransition(newStatus: AlertStatus) {
    if (!selectedAlert) return;
    setActionError(null);

    // Strict Enforcement 006a: Cannot jump Generated -> Under Investigation without Acknowledged
    if (selectedAlert.status === "Generated" && newStatus === "Under Investigation") {
      setActionError("Rule REQ-AI-006a Violation: Alert CANNOT move directly from Generated to Under Investigation. It MUST pass through Acknowledged first with an awareness note.");
      return;
    }

    // Strict Enforcement 006c: Closure requires written summary (min 20 characters)
    if (newStatus === "Closed") {
      if (!resolutionText.trim() || resolutionText.trim().length < 20) {
        setActionError("Rule REQ-AI-006c Violation: Moving an alert to Closed status REQUIRES a written resolution summary of at least 20 characters.");
        return;
      }
    }

    // Require awareness note for transitions
    if (!actionNote.trim() && newStatus !== "Closed") {
      setActionError("A mandatory note from the acting user is required for status transitions (§5.9 REQ-AI-006).");
      return;
    }

    const updatedAlert: AIAlert = {
      ...selectedAlert,
      status: newStatus,
      resolutionSummary: newStatus === "Closed" ? resolutionText.trim() : selectedAlert.resolutionSummary,
      notes: actionNote.trim()
        ? [
            ...selectedAlert.notes,
            {
              date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              user: `${role.toUpperCase()} User`,
              text: actionNote.trim(),
            },
          ]
        : selectedAlert.notes,
    };

    setAlerts((prev) => prev.map((a) => (a.id === selectedAlert.id ? updatedAlert : a)));
    setSelectedAlert(updatedAlert);
    setActionNote("");
    setResolutionText("");
  }

  return (
    <AppShell
      title="AI Intelligence"
      subtitle="Anomaly Detection & Insights"
      breadcrumb="DECIDE › AI DECISION SUPPORT"
      scope="Advisory Operational Intelligence"
      primaryAction={
        <PrimaryButton icon={<Sliders className="h-4 w-4" />} onClick={() => setShowConfigModal(true)}>
          Configure Sensitivity & Baselines
        </PrimaryButton>
      }
      toolbar={
        <div className="flex items-center gap-3 text-xs">
          <span className="font-sans text-[#526174] font-medium">Filter Baseline:</span>
          <FilterChip label="Engine" value="Model-Agnostic Analytical Engine" />
          <div className="ml-auto inline-flex items-center gap-1.5 font-sans text-xs text-[#D97706] bg-[#FFF3DF] dark:bg-amber-950/50 px-3 py-1 rounded-full border border-[#D97706]/30 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>REQ-AI-002: AI Outputs are Advisory & Explainable (No Automated Decisions)</span>
          </div>
        </div>
      }
    >
      {/* KPI Summary */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Active AI Anomaly Alerts" value={alerts.filter(a => a.status !== "Closed").length.toString()} delta={{ dir: "up", text: "+1", tone: "bad" }} source="ai-engine" freshness="live" />
        <KpiCard label="Unacknowledged (Generated)" value={alerts.filter(a => a.status === "Generated").length.toString()} source="ai-engine" freshness="live" />
        <KpiCard label="Auto-Escalated (>3d Ack)" value={alerts.filter(a => a.status === "Escalated" || (a.status === "Acknowledged" && a.daysInState >= 3)).length.toString()} delta={{ dir: "up", text: "+1", tone: "bad" }} source="ai-escalation" freshness="live" />
        <KpiCard label="Baseline Model Active" value="Release 2 (6m)" context="Rolling Historical" source="settings" freshness="live" />
      </div>

      {/* Main Grid: Priority List + Anomaly Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
        {/* Left 6 cols: Risk-based Priority Ranking (REQ-AI-005) */}
        <div className="lg:col-span-6">
          <SectionCard title="Priority Ranking" noPad>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 font-mono">
              Ranked by composite operational risk signal strength
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {PRIORITY_PARTICIPANTS.map((p) => (
                <div key={p.rank} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="flex items-center gap-3">
                    <span className={`h-7 w-7 rounded-xl flex items-center justify-center font-mono font-bold text-xs ${
                      p.rank === 1 ? "bg-red-500 text-white" : p.rank === 2 ? "bg-amber-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                    }`}>
                      #{p.rank}
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">{p.name}</h4>
                      <p className="text-[11px] text-slate-500">{p.type} · {p.reason}</p>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">{p.score}</span>
                    <span className={`text-[10px] font-bold ${p.rank === 1 ? "text-red-500" : "text-amber-500"}`}>{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Operational Trend Summary */}
          <SectionCard title="Compliance Trends">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={TREND_DATA}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} />
                <Tooltip contentStyle={{ fontSize: "11px", fontFamily: "monospace" }} />
                <Line type="monotone" dataKey="errorRate" stroke="#E11D48" strokeWidth={2} name="Error Rate (%)" />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>

      {/* Main Bottom Section: Anomaly Feed & Action Workflow (REQ-AI-006) */}
      <div className="mt-6">
        <SectionCard title="Anomaly Feed" noPad>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {alerts.map((alt) => {
                const isSelected = selectedAlert?.id === alt.id;
                const isAutoEscalated = alt.status === "Acknowledged" && alt.daysInState >= 3;
                return (
                  <div
                    key={alt.id}
                    onClick={() => {
                      setSelectedAlert(alt);
                      setActionError(null);
                      setActionNote("");
                      setResolutionText(alt.resolutionSummary ?? "");
                    }}
                    className={`p-4 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#56B4D3]/15 border-l-4 border-l-[#56B4D3]"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-[10px] font-bold text-[#56B4D3]">{alt.id}</span>
                          <span className="font-bold text-xs text-slate-900 dark:text-white">{alt.institution}</span>
                          {isAutoEscalated && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-700 font-extrabold flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Auto-Escalated (&gt;3d)
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200">{alt.indicator}</h3>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        alt.status === "Closed" ? "bg-slate-200 text-slate-700" : alt.status === "Acknowledged" ? "bg-blue-100 text-blue-700" : alt.status === "Under Investigation" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700 font-extrabold"
                      }`}>
                        {alt.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 font-mono text-[11px] mb-2">
                      <div><span className="text-slate-400 block text-[10px]">Baseline</span><span className="font-bold">{alt.baselineVal}</span></div>
                      <div><span className="text-slate-400 block text-[10px]">Observed</span><span className="font-bold text-red-500">{alt.observedVal}</span></div>
                      <div><span className="text-slate-400 block text-[10px]">Deviation</span><span className="font-bold text-amber-500">{alt.deviation}</span></div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>Baseline: {alt.baselineMethod}</span>
                      <span>Created: {alt.createdDate}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Alert Details & Strict Lifecycle Drawer (§5.9 REQ-AI-006a, 006b, 006c) */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-bold text-base text-slate-900 dark:text-white">AI Alert Details & Lifecycle Progression</h2>
                <p className="text-xs text-[#56B4D3] font-semibold">{selectedAlert.id} · {selectedAlert.institution}</p>
              </div>
              <button onClick={() => setSelectedAlert(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2 font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white">{selectedAlert.indicator}</span>
                  <span className="font-bold text-amber-500">Current Status: {selectedAlert.status}</span>
                </div>
                <div>Recommended Area: <span className="text-[#56B4D3] font-semibold">{selectedAlert.recommendedArea}</span></div>
                <div>Baseline Methodology: <span className="text-slate-600 dark:text-slate-300">{selectedAlert.baselineMethod}</span></div>
              </div>

              {/* State Machine Transition Controls */}
              {selectedAlert.status !== "Closed" ? (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 bg-slate-50/50 dark:bg-slate-800/40">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">Advance Lifecycle State (§5.9 REQ-AI-006)</h4>
                  <div className="flex items-center gap-2 flex-wrap font-mono">
                    <button
                      onClick={() => handleTransition("Acknowledged")}
                      disabled={selectedAlert.status !== "Generated"}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 cursor-pointer"
                    >
                      1. Acknowledge Alert
                    </button>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <button
                      onClick={() => handleTransition("Under Investigation")}
                      disabled={selectedAlert.status === "Generated" || selectedAlert.status === "Under Investigation"}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 cursor-pointer"
                    >
                      2. Under Investigation
                    </button>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <button
                      onClick={() => handleTransition("Closed")}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                    >
                      3. Formally Close Alert
                    </button>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mandatory Awareness Note for Transition</label>
                    <input
                      type="text"
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      placeholder="Enter logged awareness note required for state transition…"
                      className="w-full h-9 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>

                  {/* Written Resolution Summary Input for Closure (REQ-AI-006c) */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Written Resolution Summary (Mandatory Min 20 Chars for Closure — REQ-AI-006c)
                    </label>
                    <textarea
                      value={resolutionText}
                      onChange={(e) => setResolutionText(e.target.value)}
                      placeholder="Document detailed investigation outcome and resolution before closing alert…"
                      rows={3}
                      className="w-full p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 space-y-2">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold">
                    <Lock className="h-4 w-4 text-slate-500" />
                    <span>Closed Alert (Read-Only — Cannot Be Reopened per REQ-AI-006c)</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                    Resolution Summary: {selectedAlert.resolutionSummary}
                  </p>
                </div>
              )}

              {actionError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 text-red-600 font-semibold text-xs">
                  {actionError}
                </div>
              )}

              {/* History Notes Log */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">Alert Audit History Log</h4>
                {selectedAlert.notes.map((n, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-[11px] font-mono space-y-0.5">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>{n.user}</span>
                      <span>{n.date}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-200">{n.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setSelectedAlert(null)}>Close Window</SecondaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Sensitivity Threshold Modal (§5.9 REQ-AI-012) */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Configure Sensitivity & Baseline Thresholds (§5.9 REQ-AI-012)</h2>
              <button onClick={() => setShowConfigModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Alert Sensitivity Threshold Deviation (% Spike)</label>
                <input
                  type="text"
                  value={devThreshold}
                  onChange={(e) => setDevThreshold(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Auto-Escalation Threshold (Days at Acknowledged)</label>
                <input
                  type="text"
                  value={autoEscalateDays}
                  onChange={(e) => setAutoEscalateDays(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowConfigModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={() => setShowConfigModal(false)}>Save Sensitivity Config</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
