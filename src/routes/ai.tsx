import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileText,
  History,
  Info,
  Lock,
  Play,
  Search,
  ShieldAlert,
  User as UserIcon,
} from "lucide-react";
import { AppShell, PrimaryButton, SectionCard } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import { hasCap } from "@/lib/roles";
import { errorMessage } from "@/lib/api";
import {
  ALERT_STATUSES,
  SEVERITIES,
  SEVERITY_STYLE,
  STATUS_STYLE,
  fmtDate,
  fmtDateTime,
  useAiAlert,
  useAiAlerts,
  useAiEngine,
  useAiPriority,
  useAiTrends,
  useAssignees,
  useRunScan,
  useTransitionAlert,
  type AiAlert,
  type AiAlertDetail,
  type AlertStatus,
  type EngineStatus,
  type Severity,
  type TrendSummary,
} from "@/lib/ai";

export const Route = createFileRoute("/ai")({
  component: AIPage,
});

const inputCls =
  "h-9 px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-xs text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40";
const textareaCls =
  "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-sm text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40";
const MIN_SUMMARY = 20;

function participantHref(id: number) {
  return `/participant?id=${id}`;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${SEVERITY_STYLE[severity]}`}
    >
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: AlertStatus }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono border whitespace-nowrap ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="p-8 text-center text-xs text-[#526174] dark:text-slate-400">{children}</div>
  );
}

function LoadError({ error }: { error: unknown }) {
  return (
    <div className="p-4 text-xs text-[#B4233F] bg-[#FDECEF] dark:bg-rose-950/40 dark:text-rose-300 rounded-xl">
      {errorMessage(error)}
    </div>
  );
}

function AIPage() {
  const { role } = useRole();
  const canTransition = hasCap(role, "ai.alerts.transition");
  const canScan = hasCap(role, "ai.manage");
  const navigate = useNavigate();
  const searchAlert = useRouterState({
    select: (s) => Number((s.location.search as Record<string, unknown>).alert) || null,
  });

  const engine = useAiEngine();
  const scan = useRunScan();
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(searchAlert);

  // Notification links open /ai?alert=ID.
  useEffect(() => {
    if (searchAlert) setSelectedId(searchAlert);
  }, [searchAlert]);

  const openAlert = (id: number | null) => {
    setSelectedId(id);
    if (!id && searchAlert) navigate({ to: "/ai", replace: true });
  };

  const counts = engine.data?.status_counts;
  const open = counts
    ? ALERT_STATUSES.filter((s) => s !== "Closed").reduce((n, s) => n + (counts[s] ?? 0), 0)
    : null;

  return (
    <AppShell
      title="AI Decision Support"
      subtitle="Explainable pattern detection, priorities and trends"
      breadcrumb="DECIDE › AI DECISION SUPPORT"
      scope="Advisory only"
      primaryAction={
        canScan ? (
          <PrimaryButton
            icon={<Play className="h-4 w-4" />}
            disabled={scan.isPending}
            onClick={() =>
              scan.mutate(undefined, {
                onSuccess: (r) =>
                  setScanMsg(
                    `Scan complete — ${r.created} new alert${r.created === 1 ? "" : "s"}, ${r.escalated} auto-escalated.`,
                  ),
                onError: (e) => setScanMsg(errorMessage(e)),
              })
            }
          >
            {scan.isPending ? "Scanning…" : "Run scan now"}
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2 w-full text-xs">
          <span className="inline-flex items-start gap-2 font-medium text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-px" />
            <span>
              Advisory only (REQ-AI-002): alerts and rankings never change a participant, an
              integration or any other record — every decision stays with RSwitch staff.
            </span>
          </span>
          {scanMsg && <span className="text-[#526174] dark:text-slate-300">{scanMsg}</span>}
        </div>
      }
    >
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Open AI alerts"
          value={open ?? "—"}
          context="Not yet closed"
          source="AI alerts"
        />
        <KpiCard
          label="Awaiting acknowledgement"
          value={counts ? counts.Generated : "—"}
          context="Status: Generated"
          source="AI alerts"
        />
        <KpiCard
          label="Escalated"
          value={counts ? counts.Escalated : "—"}
          context={
            engine.data
              ? `Auto after ${engine.data.config.auto_escalate_days} days at Acknowledged`
              : undefined
          }
          source="AI alerts"
        />
        <KpiCard
          label="Active baseline method"
          value={<span className="text-base">{engine.data?.active_method_label ?? "—"}</span>}
          context={engine.data ? "Set in Settings → AI thresholds" : undefined}
          source="Settings"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 space-y-6">
          <AlertList canTransition={canTransition} selectedId={selectedId} onSelect={openAlert} />
          <TrendPanel />
        </div>
        <div className="xl:col-span-5 space-y-6">
          <PriorityPanel />
          <EnginePanel engine={engine.data} error={engine.error} />
        </div>
      </div>

      <AlertDrawer id={selectedId} canTransition={canTransition} onClose={() => openAlert(null)} />
    </AppShell>
  );
}

/* ─── Alert list (REQ-AI-003/004) ─── */

function AlertList({
  canTransition,
  selectedId,
  onSelect,
}: {
  canTransition: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [status, setStatus] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [method, setMethod] = useState<string>("");
  const [search, setSearch] = useState("");
  const alerts = useAiAlerts({ status, severity, method });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (alerts.data ?? []).filter(
      (a) =>
        !q ||
        a.participant_name.toLowerCase().includes(q) ||
        a.indicator.toLowerCase().includes(q) ||
        a.ref.toLowerCase().includes(q),
    );
  }, [alerts.data, search]);

  return (
    <SectionCard
      title={
        <>
          <Brain className="h-5 w-5 text-[#168FA8]" /> AI alerts
        </>
      }
      noPad
    >
      <div className="p-3 border-b border-[#DCE3E8] dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search participant, indicator or ALT-…"
              aria-label="Search alerts"
              className={`${inputCls} w-full pl-9`}
            />
          </div>
          <select
            aria-label="Severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className={inputCls}
          >
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Baseline method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={inputCls}
          >
            <option value="">All baseline methods</option>
            <option value="threshold">R1 — Configured thresholds</option>
            <option value="rolling">R2 — Rolling baseline</option>
            <option value="peer">R3 — Peer group</option>
          </select>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Status">
          {["", ...ALERT_STATUSES].map((s) => (
            <button
              key={s || "all"}
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                status === s
                  ? "bg-[#168FA8] text-white border-[#168FA8]"
                  : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      {alerts.error ? (
        <div className="p-4">
          <LoadError error={alerts.error} />
        </div>
      ) : alerts.isLoading ? (
        <Empty>Loading alerts…</Empty>
      ) : rows.length === 0 ? (
        <Empty>
          {alerts.data?.length
            ? "No alerts match these filters."
            : "No AI alerts have been raised. Detection runs every 15 minutes and after each submission."}
        </Empty>
      ) : (
        <ul className="divide-y divide-[#DCE3E8] dark:divide-slate-800 max-h-[640px] overflow-y-auto">
          {rows.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              selected={a.id === selectedId}
              onSelect={() => onSelect(a.id)}
            />
          ))}
        </ul>
      )}
      {!canTransition && (
        <div className="px-4 py-2.5 text-[11px] text-[#526174] dark:text-slate-400 border-t border-[#DCE3E8] dark:border-slate-800 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" /> View only — Compliance and Business users manage the
          alert lifecycle (REQ-AI-006).
        </div>
      )}
    </SectionCard>
  );
}

function AlertRow({
  alert: a,
  selected,
  onSelect,
}: {
  alert: AiAlert;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        onClick={onSelect}
        className={`w-full text-left p-4 transition-colors cursor-pointer ${
          selected
            ? "bg-[#E7F5F8]/80 dark:bg-sky-950/30"
            : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#168FA8]">{a.ref}</span>
              <span className="font-bold text-xs text-[#172033] dark:text-white">
                {a.participant_name}
              </span>
              <SeverityBadge severity={a.severity} />
              {a.recurrence_of && (
                <span className="text-[10px] font-semibold text-[#526174] dark:text-slate-400">
                  Recurrence of ALT-{a.recurrence_of}
                </span>
              )}
            </div>
            <div className="text-xs font-semibold text-[#172033] dark:text-slate-200">
              {a.indicator}
            </div>
          </div>
          <StatusBadge status={a.status} />
        </div>
        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[#DCE3E8] dark:border-slate-700 text-[11px]">
          <Metric label="Baseline" value={a.baseline_value} />
          <Metric label="Observed" value={a.observed_value} />
          <Metric label="Deviation" value={a.deviation} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#526174] dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Database className="h-3 w-3" /> {a.baseline_method_label}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> Raised {fmtDate(a.created_at)} · {a.days_in_state}d in{" "}
            {a.status}
          </span>
          {a.assignee_name && (
            <span className="inline-flex items-center gap-1">
              <UserIcon className="h-3 w-3" /> {a.assignee_name}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] text-[#7B8798]">{label}</span>
      <span className="font-semibold text-[#172033] dark:text-slate-100 break-words">{value}</span>
    </div>
  );
}

/* ─── Alert drawer: explanation, drill-down, history, lifecycle ─── */

function AlertDrawer({
  id,
  canTransition,
  onClose,
}: {
  id: number | null;
  canTransition: boolean;
  onClose: () => void;
}) {
  const detail = useAiAlert(id);
  const a = detail.data;
  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto bg-white dark:bg-slate-900 border-[#DCE3E8] dark:border-slate-800"
      >
        <SheetHeader className="text-left pr-8">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-[#172033] dark:text-white">
            {a ? (
              <>
                <span className="font-mono text-[#168FA8]">{a.ref}</span> {a.indicator}
              </>
            ) : (
              "AI alert"
            )}
          </SheetTitle>
          <SheetDescription className="text-xs text-[#526174] dark:text-slate-400">
            {a ? (
              <>
                {a.participant_name} · {a.participant_type || "Type not set"} · raised{" "}
                {fmtDateTime(a.created_at)}
              </>
            ) : (
              "Loading…"
            )}
          </SheetDescription>
        </SheetHeader>
        {detail.error && <LoadError error={detail.error} />}
        {a && <AlertDetailBody alert={a} canTransition={canTransition} />}
      </SheetContent>
    </Sheet>
  );
}

function AlertDetailBody({
  alert: a,
  canTransition,
}: {
  alert: AiAlertDetail;
  canTransition: boolean;
}) {
  return (
    <div className="mt-4 space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={a.status} />
        <SeverityBadge severity={a.severity} />
        {a.assignee_name && (
          <span className="text-xs text-[#526174] dark:text-slate-300 inline-flex items-center gap-1">
            <UserIcon className="h-3.5 w-3.5" /> Assigned to <strong>{a.assignee_name}</strong>
          </span>
        )}
        <a
          href={participantHref(a.participant_id)}
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#168FA8] hover:underline"
        >
          Open Participant 360 <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <p className="text-[11px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2">
        {a.advisory_notice}
      </p>

      {/* REQ-AI-004 / §8.3 alert card */}
      <div className="grid grid-cols-2 gap-3">
        <Fact label="Participant" value={a.participant_name} />
        <Fact label="Triggering indicator" value={a.indicator} />
        <Fact label="Baseline value" value={a.baseline_value} />
        <Fact label="Observed value" value={a.observed_value} />
        <Fact label="Deviation" value={a.deviation} />
        <Fact label="Baseline method (REQ-AI-011)" value={a.baseline_method_label} />
        <div className="col-span-2">
          <Fact label="Recommended investigation area" value={a.recommended_area} />
        </div>
      </div>

      {/* REQ-AI-009 */}
      <section className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 p-3 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#526174] dark:text-slate-400 flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" /> How this was produced
        </h3>
        <p className="text-xs text-[#172033] dark:text-slate-200">{a.methodology}</p>
        <div className="text-[11px] text-[#526174] dark:text-slate-400">
          <div>
            Detector: <code className="font-mono">{a.detector}</code>
          </div>
          <div className="mt-1">Data sources:</div>
          <ul className="list-disc ml-5">
            {a.data_sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        {a.recurrence_of_ref && (
          <p className="text-[11px] text-[#526174] dark:text-slate-400">
            This is a new alert for an issue that recurred after {a.recurrence_of_ref} was closed
            (REQ-AI-006c).
          </p>
        )}
      </section>

      {/* REQ-AI-008 drill-down: aggregate metadata only */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#526174] dark:text-slate-400 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Source data ({a.sources.length} submission
          {a.sources.length === 1 ? "" : "s"})
        </h3>
        {a.sources.length === 0 ? (
          <p className="text-xs text-[#526174]">The source submissions are no longer available.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#DCE3E8] dark:border-slate-700">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-[#526174] dark:text-slate-400">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold">Submission</th>
                  <th className="text-left px-2 py-1.5 font-semibold">Period</th>
                  <th className="text-left px-2 py-1.5 font-semibold">Uploaded</th>
                  <th className="text-left px-2 py-1.5 font-semibold">Result</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Transactions</th>
                  <th className="text-left px-2 py-1.5 font-semibold">Failing fields</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE3E8] dark:divide-slate-800">
                {a.sources.map((s) => (
                  <tr key={s.id}>
                    <td className="px-2 py-1.5 font-mono" title={s.filename}>
                      SUB-{s.id}
                    </td>
                    <td className="px-2 py-1.5">{s.period}</td>
                    <td className="px-2 py-1.5">{fmtDate(s.uploaded_at)}</td>
                    <td
                      className={`px-2 py-1.5 font-semibold ${s.result === "Failed" ? "text-[#B4233F] dark:text-rose-300" : "text-[#0E7A57] dark:text-emerald-300"}`}
                    >
                      {s.result}
                      {s.error_count ? ` (${s.error_count} errors)` : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {s.result === "Passed" ? s.row_count.toLocaleString() : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {Object.entries(s.error_fields)
                        .map(([f, n]) => `${f} (${n})`)
                        .join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-[#7B8798]">
          Aggregate submission metadata only — no customer-level records are stored or shown (SRS
          §2.7).
        </p>
      </section>

      {a.status === "Closed" && (
        <section className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[#DCE3E8] dark:border-slate-700 p-3 space-y-1">
          <h3 className="text-xs font-bold flex items-center gap-1.5 text-[#172033] dark:text-white">
            <Lock className="h-3.5 w-3.5" /> Closed {fmtDateTime(a.closed_at)} — read-only
          </h3>
          <p className="text-xs text-[#172033] dark:text-slate-200">{a.resolution_summary}</p>
          <p className="text-[11px] text-[#526174] dark:text-slate-400">
            Closed alerts cannot be reopened. If the issue recurs, RDIP raises a new alert.
          </p>
        </section>
      )}

      {a.status !== "Closed" && canTransition && <TransitionForm alert={a} />}
      {a.status !== "Closed" && !canTransition && (
        <p className="text-xs text-[#526174] dark:text-slate-400 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" /> Only Compliance and Business users can move alerts
          through the lifecycle.
        </p>
      )}

      <AlertHistory alert={a} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[#DCE3E8] dark:border-slate-700 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#7B8798]">{label}</div>
      <div className="text-xs font-semibold text-[#172033] dark:text-slate-100 break-words">
        {value}
      </div>
    </div>
  );
}

function TransitionForm({ alert: a }: { alert: AiAlertDetail }) {
  const { user } = useAuth();
  const [target, setTarget] = useState<AlertStatus | null>(null);
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState("");
  const [assignee, setAssignee] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const assignees = useAssignees(target === "Under Investigation");
  const transition = useTransitionAlert();

  useEffect(() => {
    setTarget(null);
    setNote("");
    setSummary("");
    setError(null);
  }, [a.id, a.status]);

  useEffect(() => {
    if (assignee === "" && assignees.data && user) {
      const me = assignees.data.find((u) => u.email === user.email);
      if (me) setAssignee(me.id);
    }
  }, [assignees.data, assignee, user]);

  if (a.allowed_next.length === 0) return null;

  const submit = () => {
    if (!target) return;
    setError(null);
    transition.mutate(
      {
        id: a.id,
        status: target,
        note,
        resolution_summary: target === "Closed" ? summary : undefined,
        assignee_id: target === "Under Investigation" && assignee !== "" ? assignee : undefined,
      },
      { onError: (e) => setError(errorMessage(e)) },
    );
  };

  return (
    <section className="rounded-xl border border-[#168FA8]/30 bg-[#E7F5F8]/40 dark:bg-sky-950/20 p-3 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F6F83] dark:text-sky-300">
        Next step
      </h3>
      <div className="flex flex-wrap gap-2">
        {a.allowed_next.map((s) => (
          <button
            key={s}
            onClick={() => {
              setTarget(s);
              setError(null);
            }}
            aria-pressed={target === s}
            className={`h-8 px-3 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
              target === s
                ? "bg-[#168FA8] text-white border-[#168FA8]"
                : "bg-white dark:bg-slate-800 text-[#172033] dark:text-slate-100 border-[#DCE3E8] dark:border-slate-700 hover:bg-slate-50"
            }`}
          >
            <ArrowRight className="h-3.5 w-3.5" /> {s}
          </button>
        ))}
      </div>
      {a.status === "Generated" && (
        <p className="text-[11px] text-[#526174] dark:text-slate-400">
          An alert must be acknowledged with an awareness note before it can be investigated
          (REQ-AI-006a).
        </p>
      )}
      {target && (
        <div className="space-y-2">
          {target === "Under Investigation" && (
            <label className="block text-xs">
              <span className="font-semibold text-[#172033] dark:text-slate-200">
                Assign investigation to
              </span>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value ? Number(e.target.value) : "")}
                className={`${inputCls} w-full mt-1`}
              >
                <option value="">Me</option>
                {(assignees.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.role}
                    {u.is_senior ? " (senior)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {target === "Closed" && (
            <label className="block text-xs">
              <span className="font-semibold text-[#172033] dark:text-slate-200">
                Resolution summary (min {MIN_SUMMARY} characters, REQ-AI-006c)
              </span>
              <textarea
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className={`${textareaCls} mt-1`}
                placeholder="What was found and what was done"
              />
              <span
                className={`text-[10px] ${summary.trim().length < MIN_SUMMARY ? "text-[#B4233F]" : "text-[#0E7A57]"}`}
              >
                {summary.trim().length}/{MIN_SUMMARY} characters
              </span>
            </label>
          )}
          <label className="block text-xs">
            <span className="font-semibold text-[#172033] dark:text-slate-200">
              Your note (required for every status change)
            </span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${textareaCls} mt-1`}
              placeholder={
                target === "Acknowledged"
                  ? "Awareness note — what you have seen"
                  : "Why you are making this change"
              }
            />
          </label>
          {error && <p className="text-xs text-[#B4233F] dark:text-rose-300">{error}</p>}
          <PrimaryButton
            icon={<CheckCircle2 className="h-4 w-4" />}
            disabled={
              transition.isPending ||
              !note.trim() ||
              (target === "Closed" && summary.trim().length < MIN_SUMMARY)
            }
            onClick={submit}
          >
            {transition.isPending ? "Saving…" : `Move to ${target}`}
          </PrimaryButton>
        </div>
      )}
    </section>
  );
}

function AlertHistory({ alert: a }: { alert: AiAlertDetail }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#526174] dark:text-slate-400 flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" /> History
      </h3>
      <ol className="space-y-2">
        {[...a.notes].reverse().map((n, i) => (
          <li
            key={`${n.date}-${i}`}
            className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#526174] dark:text-slate-400">
              <strong className="text-[#172033] dark:text-white">{n.user}</strong>
              {n.role && n.role !== "System" && <span>({n.role})</span>}
              <span>{fmtDateTime(n.date)}</span>
              {n.to && (
                <span className="font-mono">
                  {n.from ? `${n.from} → ` : ""}
                  {n.to}
                </span>
              )}
            </div>
            <p className="text-xs text-[#172033] dark:text-slate-200 mt-0.5">{n.text}</p>
            {n.assignee && (
              <p className="text-[11px] text-[#526174] dark:text-slate-400">
                Assigned to {n.assignee}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ─── Priority list (REQ-AI-005) ─── */

const STRENGTH_STYLE = {
  High: "bg-[#FDECEF] text-[#B4233F] border-[#DC3154]/30 dark:bg-rose-950/40 dark:text-rose-300",
  Medium:
    "bg-[#FFF3DF] text-[#9A5300] border-[#D97706]/30 dark:bg-amber-950/40 dark:text-amber-300",
  Low: "bg-[#E8F7F1] text-[#0E7A57] border-[#16A979]/30 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function PriorityPanel() {
  const priority = useAiPriority();
  const [showMethod, setShowMethod] = useState(false);
  const data = priority.data;
  return (
    <SectionCard
      title={
        <>
          <AlertTriangle className="h-5 w-5 text-[#168FA8]" /> Priority list
        </>
      }
      action={
        <button
          onClick={() => setShowMethod((v) => !v)}
          className="text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer"
        >
          {showMethod ? "Hide methodology" : "Methodology"}
        </button>
      }
      noPad
    >
      {showMethod && data && (
        <div className="px-4 py-3 text-[11px] text-[#526174] dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 border-b border-[#DCE3E8] dark:border-slate-800 space-y-1">
          <p>{data.methodology}</p>
          <p>Data sources: {data.data_sources.join("; ")}.</p>
        </div>
      )}
      {priority.error ? (
        <div className="p-4">
          <LoadError error={priority.error} />
        </div>
      ) : !data ? (
        <Empty>Loading…</Empty>
      ) : data.rows.length === 0 ? (
        <Empty>No participants registered yet.</Empty>
      ) : (
        <ol className="divide-y divide-[#DCE3E8] dark:divide-slate-800">
          {data.rows.map((r) => (
            <li key={r.participant_id} className="p-3.5 flex items-start gap-3 text-xs">
              <span className="h-8 w-8 shrink-0 rounded-xl flex items-center justify-center font-mono font-bold bg-slate-100 dark:bg-slate-800 text-[#172033] dark:text-slate-100">
                #{r.rank}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={participantHref(r.participant_id)}
                    className="font-bold text-[#172033] dark:text-white hover:underline"
                  >
                    {r.participant_name}
                  </a>
                  <span className="text-[11px] text-[#526174] dark:text-slate-400">
                    {r.participant_type}
                  </span>
                  {r.insufficient_history && (
                    <span
                      title={r.insufficient_history_reason}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                    >
                      Insufficient history
                    </span>
                  )}
                </div>
                <ul className="text-[11px] text-[#526174] dark:text-slate-400 space-y-0.5">
                  {r.signals.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <div className="font-mono font-bold text-sm text-[#172033] dark:text-white">
                  {r.composite_score.toFixed(1)}
                </div>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${STRENGTH_STYLE[r.signal_strength]}`}
                >
                  {r.signal_strength}
                </span>
                <div className="text-[10px] text-[#7B8798]">
                  {r.risk_score === null ? "risk pending" : `risk ${r.risk_score.toFixed(0)}`} ·
                  alerts {r.alert_points}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

/* ─── Engine, baselines, history (REQ-AI-009/010/011, §8.3) ─── */

function EnginePanel({ engine, error }: { engine: EngineStatus | undefined; error: unknown }) {
  return (
    <SectionCard
      title={
        <>
          <Database className="h-5 w-5 text-[#168FA8]" /> Baselines &amp; data sources
        </>
      }
    >
      {error ? (
        <LoadError error={error} />
      ) : !engine ? (
        <p className="text-xs text-[#526174]">Loading…</p>
      ) : (
        <div className="space-y-4 text-xs">
          <div className="space-y-1">
            <div className="font-semibold text-[#172033] dark:text-white">
              Active method: {engine.active_method_label}
            </div>
            {engine.method_warning && (
              <p className="text-[#9A5300] dark:text-amber-300">{engine.method_warning}</p>
            )}
            <ul className="space-y-1 text-[11px] text-[#526174] dark:text-slate-400">
              {engine.methods.map((m) => (
                <li key={m.key}>
                  <strong className="text-[#172033] dark:text-slate-200">{m.label}</strong> (
                  {m.release}): {m.description}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-[#526174] dark:text-slate-400">{engine.schedule}</p>
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-[#172033] dark:text-white">
              Detectors (REQ-AI-010, loaded from Settings)
            </div>
            <ul className="space-y-1.5">
              {engine.detectors.map((d) => (
                <li key={d.path} className="text-[11px] text-[#526174] dark:text-slate-400">
                  <span
                    className={
                      d.loaded
                        ? "text-[#0E7A57] dark:text-emerald-300"
                        : "text-[#B4233F] dark:text-rose-300"
                    }
                  >
                    {d.loaded ? "●" : "✕"}
                  </span>{" "}
                  <strong className="text-[#172033] dark:text-slate-200">{d.name || d.path}</strong>
                  {d.loaded
                    ? ` — ${d.method_label}. ${d.description}`
                    : ` — not loaded: ${d.error}`}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-[#172033] dark:text-white">Participants</div>
            <table className="w-full text-[11px]">
              <thead className="text-[#7B8798]">
                <tr>
                  <th className="text-left font-semibold py-1">Participant</th>
                  <th className="text-right font-semibold py-1">History</th>
                  <th className="text-left font-semibold py-1 pl-3">Baseline used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE3E8] dark:divide-slate-800">
                {engine.participants.map((p) => (
                  <tr key={p.participant_id} className="align-top">
                    <td className="py-1.5 text-[#172033] dark:text-slate-200">
                      {p.participant_name}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {p.history_months.toFixed(1)} mo
                    </td>
                    <td className="py-1.5 pl-3">
                      {p.insufficient_history ? (
                        <span
                          title={p.insufficient_history_reason}
                          className="font-bold text-[#526174] dark:text-slate-300"
                        >
                          Insufficient history — alerts suppressed
                        </span>
                      ) : (
                        <span title={p.fallback_reason || undefined}>
                          {p.method_label}
                          {p.fallback_reason && (
                            <span className="block text-[10px] text-[#9A5300] dark:text-amber-300">
                              {p.fallback_reason}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-[#7B8798]">
              Participants with less than {engine.config.min_history_months} months of submissions
              get no AI alerts (SRS §8.3). The rolling baseline needs at least{" "}
              {engine.rolling_min_months} months of prior history.
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ─── Trend summaries (REQ-AI-007) ─── */

type Point = { label: string; value: number | null };

function MiniBars({
  title,
  unit,
  points,
  source,
  note,
}: {
  title: string;
  unit: string;
  points: Point[];
  source: string;
  note?: string;
}) {
  const hasData = points.some((p) => p.value !== null);
  const fmt = (v: number | null) =>
    v === null ? "n/a" : unit === "%" ? `${v.toFixed(1)}%` : v.toLocaleString();
  return (
    <figure className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 p-3 space-y-1">
      <figcaption className="text-xs font-semibold text-[#172033] dark:text-white">
        {title}
      </figcaption>
      {hasData ? (
        <div className="h-28 text-[#168FA8] dark:text-[#2AA3BE]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 16, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#7B8798" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={[0, unit === "%" ? 100 : "auto"]} />
              <Tooltip
                cursor={{ fill: "rgba(123,135,152,0.12)" }}
                formatter={(v) => [fmt(typeof v === "number" ? v : null), title]}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <Bar dataKey="value" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={36}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: unknown) => (typeof v === "number" ? fmt(v) : "")}
                  style={{ fontSize: 10, fill: "#526174" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="h-28 flex items-center justify-center text-center text-[11px] text-[#526174] dark:text-slate-400 px-2">
          {note || "Not available — no underlying records in this period."}
        </p>
      )}
      <p className="text-[10px] text-[#7B8798]">Source: {source}</p>
    </figure>
  );
}

function TrendPanel() {
  const trends = useAiTrends();
  const t = trends.data;
  return (
    <SectionCard
      title={
        <>
          <History className="h-5 w-5 text-[#168FA8]" /> Trend summaries
        </>
      }
      action={
        t ? (
          <span className="text-[11px] text-[#526174] dark:text-slate-400">{t.window_label}</span>
        ) : undefined
      }
    >
      {trends.error ? (
        <LoadError error={trends.error} />
      ) : !t ? (
        <p className="text-xs text-[#526174]">Loading…</p>
      ) : (
        <TrendBody t={t} />
      )}
    </SectionCard>
  );
}

function TrendBody({ t }: { t: TrendSummary }) {
  const src = (key: string) => t.metrics.find((m) => m.key === key)?.source ?? "";
  const op = (key: keyof TrendSummary["operational"][number]) =>
    t.operational.map((m) => ({
      label: m.label + (m.partial ? "*" : ""),
      value: m[key] as number | null,
    }));
  const co = (key: keyof TrendSummary["compliance"][number]) =>
    t.compliance.map((m) => ({
      label: m.label + (m.partial ? "*" : ""),
      value: m[key] as number | null,
    }));
  return (
    <div className="space-y-4">
      {t.summary.length > 0 && (
        <ul className="list-disc ml-5 text-xs text-[#172033] dark:text-slate-200 space-y-0.5">
          {t.summary.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#526174] dark:text-slate-400 mb-2">
          Operational
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MiniBars
            title="Submissions received"
            unit=""
            points={op("submissions")}
            source={src("submissions")}
          />
          <MiniBars
            title="Validation error rate"
            unit="%"
            points={op("validation_error_rate")}
            source={src("validation_error_rate")}
          />
          <MiniBars
            title="AI alerts raised"
            unit=""
            points={op("alerts_raised")}
            source={src("alerts_raised")}
          />
          <MiniBars
            title="Incidents raised"
            unit=""
            points={op("incidents_raised")}
            source={src("incidents_raised")}
          />
        </div>
      </div>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#526174] dark:text-slate-400 mb-2">
          Compliance
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MiniBars
            title="Reporting coverage"
            unit="%"
            points={co("reporting_coverage_pct")}
            source={src("reporting_coverage_pct")}
          />
          <MiniBars
            title="On-time submission rate"
            unit="%"
            points={co("on_time_rate")}
            source={src("on_time_rate")}
            note={t.register_note || undefined}
          />
          <MiniBars
            title="Overdue items"
            unit=""
            points={co("overdue_items")}
            source={src("overdue_items")}
            note={t.register_note || undefined}
          />
          <MiniBars
            title="Document expiries"
            unit=""
            points={co("document_expiries")}
            source={src("document_expiries")}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Snapshot label="Open incidents (now)" value={t.snapshot.open_incidents} />
        <Snapshot label="Open AI alerts (now)" value={t.snapshot.open_alerts} />
        <Snapshot label="Overdue requirements (now)" value={t.snapshot.overdue_requirements} />
        <Snapshot label="Expired documents (now)" value={t.snapshot.documents_expired} />
      </div>
      <p className="text-[10px] text-[#7B8798]">{t.methodology} * = current month to date.</p>
    </div>
  );
}

function Snapshot({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[#DCE3E8] dark:border-slate-700 px-3 py-2">
      <div className="text-[10px] text-[#7B8798]">{label}</div>
      <div className="font-mono font-bold text-sm text-[#172033] dark:text-white">
        {value ?? "n/a"}
      </div>
    </div>
  );
}
