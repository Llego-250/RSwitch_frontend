// Failure rates (REQ-COMP-008) and full compliance history (REQ-COMP-009)
// per participant: the share of submissions over a rolling window that
// failed validation or were rejected, deadline adherence alongside, and every
// submission, outcome, correction and incident in order.

import { useMemo, useState } from "react";
import { BarChart3, History } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import {
  fmtDateTime,
  fmtDay,
  pct,
  useFailureRates,
  useParticipantHistory,
  type HistoryEvent,
  type RateRow,
} from "@/lib/compliance";
import {
  EmptyState,
  LoadState,
  Modal,
  SmallButton,
  StatusPill,
  selectCls,
  tdCls,
  thCls,
} from "./ui";

const WINDOWS = [3, 6, 12, 24];

function RateBar({ value, bad }: { value: number | null; bad?: boolean }) {
  if (value === null) return <span className="text-[11px] text-[#7B8798]">No data</span>;
  return (
    <div className="flex items-center gap-2 min-w-36">
      <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${bad ? "bg-[#DC3154]" : "bg-[#16A979]"}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span
        className={`text-xs font-semibold w-12 text-right ${bad ? "text-[#DC3154]" : "text-[#12825E]"}`}
      >
        {pct(value)}
      </span>
    </div>
  );
}

export function FailureRatesPanel({ onOpenIncident }: { onOpenIncident: (id: number) => void }) {
  const [months, setMonths] = useState(12);
  const rates = useFailureRates(months);
  const [historyFor, setHistoryFor] = useState<RateRow | null>(null);

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#168FA8]" /> Failure rate by participant
        </span>
      }
      action={
        <select
          className={selectCls}
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          aria-label="Window"
        >
          {WINDOWS.map((m) => (
            <option key={m} value={m}>
              Rolling {m} months
            </option>
          ))}
        </select>
      }
      noPad
    >
      <p className="px-6 pt-3 text-[11px] text-[#7B8798]">
        Failure rate: submissions that failed validation or were rejected after review, as a share
        of all submissions in the window (REQ-COMP-008). Deadline adherence: deadlines that fell due
        in the window and were met with an approved file received by the due date.
      </p>
      <LoadState loading={rates.isLoading} error={rates.error} />
      {rates.data && rates.data.length === 0 && <EmptyState title="No participants yet" />}
      {rates.data && rates.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Participant", "Failure rate", "Failed / rejected", "Deadline adherence", ""].map(
                  (h) => (
                    <th key={h} className={thCls}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rates.data.map((r) => (
                <tr
                  key={r.participant_id}
                  className="border-t border-[#EEF2F5] dark:border-slate-800"
                >
                  <td className={tdCls}>
                    <div className="font-semibold">{r.participant_name}</div>
                    <div className="text-[11px] text-[#7B8798]">
                      {r.institution_type}
                      {r.status !== "Active" ? ` · ${r.status}` : ""}
                    </div>
                  </td>
                  <td className={tdCls}>
                    <RateBar value={r.failure.rate_pct} bad />
                  </td>
                  <td className={tdCls}>
                    {r.failure.total === 0 ? (
                      <span className="text-[11px] text-[#7B8798]">
                        No submissions since {fmtDay(r.failure.window_start)}
                      </span>
                    ) : (
                      <>
                        <div>
                          {r.failure.failed_or_rejected} of {r.failure.total}
                        </div>
                        <div className="text-[11px] text-[#7B8798]">
                          {r.failure.validation_failed} failed validation · {r.failure.rejected}{" "}
                          rejected
                        </div>
                      </>
                    )}
                  </td>
                  <td className={tdCls}>
                    <RateBar value={r.adherence.rate_pct} />
                    {r.adherence.total > 0 && (
                      <div className="text-[11px] text-[#7B8798] mt-0.5">
                        {r.adherence.on_time} of {r.adherence.total} deadlines met on time
                      </div>
                    )}
                  </td>
                  <td className={`${tdCls} text-right`}>
                    <SmallButton
                      icon={<History className="h-3.5 w-3.5" />}
                      onClick={() => setHistoryFor(r)}
                    >
                      History
                    </SmallButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {historyFor && (
        <HistoryModal
          participant={historyFor}
          onClose={() => setHistoryFor(null)}
          onOpenIncident={(id) => {
            setHistoryFor(null);
            onOpenIncident(id);
          }}
        />
      )}
    </SectionCard>
  );
}

const FILTERS: { id: string; label: string; match: (e: HistoryEvent) => boolean }[] = [
  { id: "all", label: "Everything", match: () => true },
  {
    id: "submissions",
    label: "Submissions & documents",
    match: (e) => e.type.startsWith("submission") || e.type.startsWith("document"),
  },
  {
    id: "deadlines",
    label: "Corrections & deadlines",
    match: (e) => e.type === "correction_requested" || e.type === "deadline_missed",
  },
  {
    id: "incidents",
    label: "Incidents",
    match: (e) => e.type.startsWith("incident") || e.type.startsWith("remediation"),
  },
];

export function HistoryModal({
  participant,
  onClose,
  onOpenIncident,
}: {
  participant: { participant_id: number; participant_name: string };
  onClose: () => void;
  onOpenIncident: (id: number) => void;
}) {
  const history = useParticipantHistory(participant.participant_id);
  const [filter, setFilter] = useState("all");
  const events = useMemo(() => {
    const match = FILTERS.find((f) => f.id === filter)?.match ?? (() => true);
    return [...(history.data ?? [])].filter(match).reverse();
  }, [history.data, filter]);

  return (
    <Modal
      wide
      title={`Compliance history — ${participant.participant_name}`}
      subtitle="Every submission and its outcome, correction chains, missed deadlines and incidents (REQ-COMP-009). Newest first."
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <SmallButton
            key={f.id}
            tone={filter === f.id ? "primary" : "default"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </SmallButton>
        ))}
      </div>
      <LoadState loading={history.isLoading} error={history.error} />
      {history.data && events.length === 0 && <EmptyState title="Nothing recorded yet" />}
      {events.length > 0 && (
        <ol className="relative border-l-2 border-[#DCE3E8] dark:border-slate-700 ml-2 space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {events.map((e, n) => (
            <li key={`${e.type}-${e.at}-${n}`} className="pl-4 relative">
              <span
                className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${
                  e.status === "Approved" || e.status === "Completed" || e.status === "Closed"
                    ? "bg-[#16A979]"
                    : ["Rejected", "Validation Failed", "Overdue", "Open"].includes(e.status)
                      ? "bg-[#DC3154]"
                      : "bg-[#168FA8]"
                }`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-[#7B8798] w-36 shrink-0">
                  {fmtDateTime(e.at)}
                </span>
                {e.status && <StatusPill status={e.status} />}
                {e.incident_id ? (
                  <button
                    onClick={() => onOpenIncident(e.incident_id!)}
                    className="text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer text-left"
                  >
                    {e.title}
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                    {e.title}
                  </span>
                )}
              </div>
              {e.detail && (
                <div className="text-[11px] text-[#526174] dark:text-slate-300 mt-0.5 pl-[9.5rem]">
                  {e.detail}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
