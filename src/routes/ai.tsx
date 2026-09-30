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
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
  Area,
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
  Search,
  Sparkles,
  ChevronRight,
  Info,
  Check,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ai")({
  component: AIPage,
});

type AlertStatus =
  | "Generated"
  | "Acknowledged"
  | "Under Investigation"
  | "Resolved"
  | "Escalated"
  | "Closed";

type BaselineMethod =
  | "Predefined Thresholds (Release 1)"
  | "Rolling 6-Month Baseline (Release 2)"
  | "Peer-Group Baseline (Release 3)";

type AIAlert = {
  id: string;
  institution: string;
  indicator: string;
  baselineVal: string;
  observedVal: string;
  deviation: string;
  recommendedArea: string;
  status: AlertStatus;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
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
    severity: "CRITICAL",
    baselineMethod: "Rolling 6-Month Baseline (Release 2)",
    createdDate: "2026-07-22 10:14",
    daysInState: 4,
    notes: [
      {
        date: "2026-07-22 10:15",
        user: "Compliance User",
        text: "Acknowledged anomaly alert. Assigned to technical integration team for payload audit.",
      },
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
    severity: "HIGH",
    baselineMethod: "Predefined Thresholds (Release 1)",
    createdDate: "2026-07-24 08:30",
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
    severity: "MEDIUM",
    baselineMethod: "Rolling 6-Month Baseline (Release 2)",
    createdDate: "2026-07-21 11:00",
    daysInState: 2,
    notes: [
      {
        date: "2026-07-21 11:00",
        user: "Compliance User",
        text: "Logged awareness note. Investigating network routing latency.",
      },
      {
        date: "2026-07-22 09:30",
        user: "Technical Lead",
        text: "Contacted SACCO IT team regarding network gateway upgrade.",
      },
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
    severity: "LOW",
    baselineMethod: "Rolling 6-Month Baseline (Release 2)",
    createdDate: "2026-07-15 14:00",
    daysInState: 0,
    notes: [
      {
        date: "2026-07-15 14:00",
        user: "Compliance User",
        text: "Acknowledged minor mapping warning.",
      },
      {
        date: "2026-07-16 10:00",
        user: "Technical Lead",
        text: "Field mapping updated to v3.1.",
      },
    ],
    resolutionSummary:
      "Field mapping definition updated in Standards & Mapping v3.1 to include optional swift remittance tags. Verified clean ingestion.",
  },
];

const TREND_DATA = [
  { month: "May", errorRate: 0.8, latency: 120, alerts: 2 },
  { month: "Jun", errorRate: 0.6, latency: 110, alerts: 1 },
  { month: "Jul", errorRate: 2.4, latency: 240, alerts: 4 },
];

const PRIORITY_PARTICIPANTS = [
  {
    rank: 1,
    name: "MTN Mobile Money",
    type: "E-money Issuer",
    score: "88.4 / 100",
    reason: "Error Rate Spike (+2100%)",
    status: "High Risk Signal",
  },
  {
    rank: 2,
    name: "Inkomoko MFI",
    type: "MFI",
    score: "74.2 / 100",
    reason: "PAR Negative Value Error",
    status: "Medium Risk Signal",
  },
  {
    rank: 3,
    name: "Zigama CSS SACCO",
    type: "SACCO",
    score: "62.0 / 100",
    reason: "Latency Delay (+460%)",
    status: "Medium Risk Signal",
  },
  {
    rank: 4,
    name: "Bank of Kigali",
    type: "Commercial Bank",
    score: "12.0 / 100",
    reason: "Clean Operational Profile",
    status: "Low Risk Signal",
  },
];

function AIPage() {
  const { role } = useRole();

  const [alerts, setAlerts] = useState<AIAlert[]>(INITIAL_AI_ALERTS);
  const [selectedAlert, setSelectedAlert] = useState<AIAlert | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // Threshold Config (§5.9 REQ-AI-012)
  const [devThreshold, setDevThreshold] = useState("200%");
  const [autoEscalateDays, setAutoEscalateDays] = useState("3");

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alt) => {
      const matchesSearch =
        alt.institution.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alt.indicator.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alt.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "ALL" || alt.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [alerts, searchTerm, filterStatus]);

  function handleTransition(newStatus: AlertStatus) {
    if (!selectedAlert) return;
    setActionError(null);

    // Strict Enforcement 006a: Cannot jump Generated -> Under Investigation without Acknowledged
    if (selectedAlert.status === "Generated" && newStatus === "Under Investigation") {
      setActionError(
        "Rule REQ-AI-006a Violation: Alert CANNOT move directly from Generated to Under Investigation. It MUST pass through Acknowledged first with an awareness note."
      );
      return;
    }

    // Strict Enforcement 006c: Closure requires written summary (min 20 characters)
    if (newStatus === "Closed") {
      if (!resolutionText.trim() || resolutionText.trim().length < 20) {
        setActionError(
          "Rule REQ-AI-006c Violation: Moving an alert to Closed status REQUIRES a written resolution summary of at least 20 characters."
        );
        return;
      }
    }

    // Require awareness note for non-closed transitions
    if (!actionNote.trim() && newStatus !== "Closed") {
      setActionError(
        "A mandatory note from the acting user is required for state transitions (§5.9 REQ-AI-006)."
      );
      return;
    }

    const updatedAlert: AIAlert = {
      ...selectedAlert,
      status: newStatus,
      resolutionSummary:
        newStatus === "Closed" ? resolutionText.trim() : selectedAlert.resolutionSummary,
      notes: actionNote.trim()
        ? [
            ...selectedAlert.notes,
            {
              date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
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
      title="AI Operational Intelligence"
      subtitle="Anomaly Detection & Predictive Insights"
      breadcrumb="DECIDE › AI DECISION SUPPORT"
      scope="Advisory Operational Intelligence"
      primaryAction={
        <PrimaryButton icon={<Sliders className="h-4 w-4" />} onClick={() => setShowConfigModal(true)}>
          Sensitivity & Baselines
        </PrimaryButton>
      }
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-600">Model Engine:</span>
            <FilterChip label="Engine" value="Model-Agnostic Analytical Engine v2.4" />
          </div>
          <div className="inline-flex items-center gap-2 font-medium text-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-xl border border-amber-200 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>REQ-AI-002: AI Outputs are Advisory &amp; Explainable (No Automated Decisions)</span>
          </div>
        </div>
      }
    >
      {/* Hero Liquid Glass Header with Frosted Blur */}
      <div className="mb-6 p-6.5 rounded-3xl backdrop-blur-2xl backdrop-saturate-180 bg-gradient-to-r from-slate-950/90 via-sky-950/80 to-slate-950/90 text-white shadow-[0_12px_40px_0_rgba(14,165,233,0.2),_inset_0_1px_1px_0_rgba(255,255,255,0.35)] border border-sky-400/40 relative overflow-hidden transition-all">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-sky-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#168FA8]/25 border border-[#CDECF1]/40 text-sky-200 font-mono text-[11px] font-bold tracking-wider uppercase backdrop-blur-md shadow-inner">
              <Sparkles className="h-3.5 w-3.5 text-sky-300 animate-pulse" /> Machine Intelligence Engine
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight drop-shadow-sm font-sans">
              Real-Time Anomaly &amp; Operational Risk Monitor
            </h2>
            <p className="text-xs sm:text-sm text-sky-100/90 leading-relaxed font-normal">
              Continuously evaluates payment telemetry against rolling 6-month historical baselines to flag metric deviations, API errors, and network latency anomalies across all connected participant institutions.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-3.5 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 text-center font-mono shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.3)] min-w-[100px]">
              <div className="text-xl font-bold text-sky-300 tracking-tight">4.4%</div>
              <div className="text-[10px] text-sky-200/80 uppercase tracking-widest font-semibold mt-0.5">Max Deviation</div>
            </div>
            <div className="p-3.5 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 text-center font-mono shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.3)] min-w-[100px]">
              <div className="text-xl font-bold text-emerald-300 tracking-tight">99.8%</div>
              <div className="text-[10px] text-sky-200/80 uppercase tracking-widest font-semibold mt-0.5">Baseline Precision</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Active AI Anomaly Alerts"
          value={alerts.filter((a) => a.status !== "Closed").length.toString()}
          delta={{ dir: "up", text: "+1 new alert", tone: "bad" }}
          source="ai-engine"
          freshness="live"
        />
        <KpiCard
          label="Unacknowledged Alerts"
          value={alerts.filter((a) => a.status === "Generated").length.toString()}
          source="ai-engine"
          freshness="live"
        />
        <KpiCard
          label="Auto-Escalated (>3d Ack)"
          value={alerts.filter((a) => a.status === "Escalated" || (a.status === "Acknowledged" && a.daysInState >= 3)).length.toString()}
          delta={{ dir: "up", text: "Action required", tone: "bad" }}
          source="ai-escalation"
          freshness="live"
        />
        <KpiCard
          label="Baseline Model Active"
          value="Release 2 (6m)"
          context="Rolling Historical"
          source="settings"
          freshness="live"
        />
      </div>

      {/* Main Grid: Priority Ranking + Trends / Anomaly Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Priority Ranking & Trend Chart (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Priority Ranking Card */}
          <SectionCard title="Priority Risk Ranking (§5.9 REQ-AI-005)" noPad>
            <div className="p-3 bg-neutral-50/80 dark:bg-slate-800/40 border-b border-neutral-200 dark:border-slate-800 text-[11px] text-neutral-500 font-mono flex items-center justify-between font-medium">
              <span>Ranked by signal strength &amp; failure score</span>
              <span className="text-[#168FA8] dark:text-sky-400 font-bold uppercase tracking-wider">Live Signals</span>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-slate-800">
              {PRIORITY_PARTICIPANTS.map((p) => (
                <div
                  key={p.rank}
                  className="p-3.5 flex items-center justify-between text-xs hover:bg-neutral-50/70 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-8 w-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs shadow-xs ${
                        p.rank === 1
                          ? "bg-rose-500 text-white"
                          : p.rank === 2
                          ? "bg-amber-500 text-white"
                          : "bg-neutral-200 dark:bg-slate-700 text-neutral-700 dark:text-slate-200"
                      }`}
                    >
                      #{p.rank}
                    </span>
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-neutral-900 dark:text-white tracking-tight">{p.name}</h4>
                      <p className="text-[11px] text-neutral-500 dark:text-slate-400 font-sans">
                        {p.type} · <span className="text-neutral-700 dark:text-slate-300 font-semibold">{p.reason}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-neutral-900 dark:text-white block text-sm tracking-tight">{p.score}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 uppercase tracking-wider ${
                        p.rank === 1
                          ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                          : p.rank === 2
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Compliance Trend Visualization */}
          <SectionCard title="Anomaly & Error Rate Trend">
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">
                Monthly error rate deviations vs historical baselines.
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={TREND_DATA}>
                  <defs>
                    <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E11D48" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#E11D48" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                  <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} />
                  <Tooltip contentStyle={{ fontSize: "11px", fontFamily: "monospace", borderRadius: "8px" }} />
                  <Area
                    type="monotone"
                    dataKey="errorRate"
                    stroke="#E11D48"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorError)"
                    name="Error Rate (%)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Interactive Anomaly Alert Feed & Workflow (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <SectionCard title="AI Anomaly Alerts Feed & Lifecycle (§5.9)" noPad>
            {/* Toolbar Filters */}
            <div className="p-3 bg-neutral-50/70 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  type="text"
                  placeholder="Search alert ID or institution..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto text-xs">
                {["ALL", "Generated", "Acknowledged", "Under Investigation", "Closed"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer ${
                      filterStatus === st
                        ? "bg-[#168FA8] text-white shadow-sm"
                        : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Alert List Feed */}
            <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto">
              {filteredAlerts.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500">
                  No anomaly alerts match the selected filter.
                </div>
              ) : (
                filteredAlerts.map((alt) => {
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
                          ? "bg-[#E7F5F8]/80 border-l-4 border-l-sky-600"
                          : "hover:bg-neutral-50/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#168FA8]">{alt.id}</span>
                            <span className="font-bold text-xs text-neutral-900">{alt.institution}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                alt.severity === "CRITICAL"
                                  ? "bg-rose-100 text-rose-800 border border-rose-300"
                                  : alt.severity === "HIGH"
                                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                                  : "bg-[#E7F5F8] text-[#0F6F83] border border-[#CDECF1]"
                              }`}
                            >
                              {alt.severity}
                            </span>
                            {isAutoEscalated && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-600 text-white font-bold flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Auto-Escalated (&gt;3d)
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-xs text-neutral-800">{alt.indicator}</h3>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono border ${
                            alt.status === "Closed"
                              ? "bg-neutral-100 text-neutral-700 border-neutral-300"
                              : alt.status === "Acknowledged"
                              ? "bg-[#E7F5F8] text-[#168FA8] border-[#CDECF1]"
                              : alt.status === "Under Investigation"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          {alt.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-neutral-100/70 font-mono text-[11px] mb-2 border border-neutral-200">
                        <div>
                          <span className="text-neutral-400 block text-[10px]">Baseline</span>
                          <span className="font-bold text-neutral-800">{alt.baselineVal}</span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[10px]">Observed</span>
                          <span className="font-bold text-rose-600">{alt.observedVal}</span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[10px]">Deviation</span>
                          <span className="font-bold text-amber-600">{alt.deviation}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                        <span>Baseline: {alt.baselineMethod}</span>
                        <span>Created: {alt.createdDate}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Alert Details & Strict Lifecycle Progression Drawer Modal (§5.9 REQ-AI-006a, 006b, 006c) */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-neutral-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div>
                <h2 className="font-bold text-base text-neutral-900">AI Alert Lifecycle &amp; Investigation</h2>
                <p className="text-xs text-[#168FA8] font-semibold font-mono">
                  {selectedAlert.id} · {selectedAlert.institution}
                </p>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2 font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-900 text-xs">{selectedAlert.indicator}</span>
                  <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Status: {selectedAlert.status}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">RECOMMENDED AREA</span>
                  <span className="text-[#168FA8] font-semibold">{selectedAlert.recommendedArea}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">BASELINE METHODOLOGY</span>
                  <span className="text-neutral-700">{selectedAlert.baselineMethod}</span>
                </div>
              </div>

              {/* Lifecycle Progress Stepper Controls */}
              {selectedAlert.status !== "Closed" ? (
                <div className="p-4 rounded-xl border border-neutral-200 space-y-4 bg-[#E7F5F8]/40">
                  <h4 className="font-bold text-xs text-neutral-900 flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-[#168FA8]" /> Advance Alert Lifecycle (§5.9 REQ-AI-006)
                  </h4>

                  <div className="flex items-center gap-2 flex-wrap font-mono">
                    <Button
                      size="sm"
                      onClick={() => handleTransition("Acknowledged")}
                      disabled={selectedAlert.status !== "Generated"}
                      className="bg-[#168FA8] hover:bg-[#0F6F83] text-white text-xs disabled:opacity-40"
                    >
                      1. Acknowledge Alert
                    </Button>
                    <ArrowRight className="h-4 w-4 text-neutral-400" />
                    <Button
                      size="sm"
                      onClick={() => handleTransition("Under Investigation")}
                      disabled={selectedAlert.status === "Generated" || selectedAlert.status === "Under Investigation"}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs disabled:opacity-40"
                    >
                      2. Under Investigation
                    </Button>
                    <ArrowRight className="h-4 w-4 text-neutral-400" />
                    <Button
                      size="sm"
                      onClick={() => handleTransition("Closed")}
                      className="bg-[#168FA8] hover:bg-[#0F6F83] text-white text-xs"
                    >
                      3. Formally Close Alert
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-neutral-700">
                      Mandatory User Note for State Transition *
                    </label>
                    <Input
                      type="text"
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      placeholder="Enter logged awareness note required for state transition…"
                      className="h-10 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-neutral-200">
                    <label className="font-semibold text-neutral-700">
                      Written Resolution Summary (Mandatory Min 20 Chars for Closure — REQ-AI-006c)
                    </label>
                    <textarea
                      value={resolutionText}
                      onChange={(e) => setResolutionText(e.target.value)}
                      placeholder="Document detailed investigation outcome and resolution before closing alert…"
                      rows={3}
                      className="w-full p-3 rounded-xl bg-white border border-neutral-200 text-neutral-900 focus:outline-none text-xs font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-100 space-y-2">
                  <div className="flex items-center gap-2 text-neutral-800 font-bold">
                    <Lock className="h-4 w-4 text-neutral-500" />
                    <span>Closed Alert (Read-Only — Cannot Be Reopened per REQ-AI-006c)</span>
                  </div>
                  <p className="text-xs text-neutral-700 font-mono">
                    Resolution Summary: {selectedAlert.resolutionSummary}
                  </p>
                </div>
              )}

              {actionError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {actionError}
                </div>
              )}

              {/* History Audit Notes Log */}
              <div className="space-y-2 pt-3 border-t border-neutral-200">
                <h4 className="font-bold text-xs text-neutral-900">Alert Audit History Log</h4>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {selectedAlert.notes.map((n, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-[11px] font-mono space-y-1">
                      <div className="flex items-center justify-between text-neutral-500">
                        <span className="font-bold text-[#168FA8]">{n.user}</span>
                        <span>{n.date}</span>
                      </div>
                      <p className="text-neutral-800 font-sans">{n.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-neutral-200">
              <Button variant="outline" onClick={() => setSelectedAlert(null)}>
                Close Window
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sensitivity Threshold Modal (§5.9 REQ-AI-012) */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <h2 className="font-bold text-base text-neutral-900">
                Configure Sensitivity &amp; Baseline Thresholds (§5.9 REQ-AI-012)
              </h2>
              <button onClick={() => setShowConfigModal(false)} className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">
                  Alert Sensitivity Threshold Deviation (% Metric Spike)
                </label>
                <Input
                  type="text"
                  value={devThreshold}
                  onChange={(e) => setDevThreshold(e.target.value)}
                  className="h-10 font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">
                  Auto-Escalation Threshold (Days at Acknowledged)
                </label>
                <Input
                  type="text"
                  value={autoEscalateDays}
                  onChange={(e) => setAutoEscalateDays(e.target.value)}
                  className="h-10 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <Button variant="outline" onClick={() => setShowConfigModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowConfigModal(false)} className="bg-[#168FA8] hover:bg-[#0F6F83] text-white">
                Save Sensitivity Config
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
