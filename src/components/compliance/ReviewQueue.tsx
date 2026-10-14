// Submission review (§6.1 steps 6-7, §6.4, §8.4): valid files waiting for a
// decision, with their validation report and correction history; cycles whose
// latest file failed or was rejected (Compliance follows up with the
// institution offline, then records it); and cycles waiting for the corrected
// file. Start review → Approve / Reject (reason of at least 20 characters).

import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Clock, History, Inbox, Play, Send, Upload, XCircle } from "lucide-react";
import { PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { api } from "@/lib/api";
import {
  dueText,
  fmtDay,
  formErrors,
  useComplianceMeta,
  useRefreshCompliance,
  useReviewQueue,
  type QueueEntry,
  type UploadTarget,
} from "@/lib/compliance";
import { textareaCls } from "@/components/governance/ui";
import {
  DangerButton,
  EmptyState,
  Field,
  FormError,
  ItemSummary,
  LoadState,
  Modal,
  SmallButton,
  StatusPill,
} from "./ui";

const reviewPath = (entry: QueueEntry) =>
  `/compliance/${entry.item?.kind === "document" ? "documents" : "submissions"}/${entry.item?.id}/review`;

function targetFor(entry: QueueEntry): UploadTarget | null {
  if (!entry.requirement || !entry.item) return null;
  return {
    participantId: entry.participant_id,
    requirementId: entry.requirement.id,
    kind: entry.requirement.kind,
    docTypeId: entry.item.doc_type_id ?? null,
    replacesId: entry.item.id,
  };
}

export function ReviewQueuePanel({
  canManage,
  canUpload,
  onOpen,
  onUpload,
}: {
  canManage: boolean;
  canUpload: boolean;
  onOpen: (requirementId: number) => void;
  onUpload: (target: UploadTarget) => void;
}) {
  const queue = useReviewQueue();
  const refresh = useRefreshCompliance();
  const [deciding, setDeciding] = useState<{
    entry: QueueEntry;
    decision: "Approved" | "Rejected";
  } | null>(null);
  const [asking, setAsking] = useState<QueueEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: (entry: QueueEntry) => api.put(reviewPath(entry), { decision: "Under Review" }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) => setError(formErrors(e, []).message),
  });

  if (!queue.data) return <LoadState loading={queue.isLoading} error={queue.error} />;
  const { awaiting_review, needs_follow_up, awaiting_correction } = queue.data;

  return (
    <div className="space-y-5">
      <FormError message={error} />
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-[#168FA8]" /> Awaiting review ({awaiting_review.length})
          </span>
        }
        action={
          !canManage ? (
            <span className="text-[11px] text-[#7B8798]">
              View only · Compliance reviews submissions
            </span>
          ) : undefined
        }
        noPad
      >
        {awaiting_review.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="Nothing to review">
            Valid files appear here as soon as they are uploaded or pulled.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-[#EEF2F5] dark:divide-slate-800">
            {awaiting_review.map((entry) => (
              <EntryRow key={entry.item?.ref} entry={entry} onOpen={onOpen}>
                {canManage && entry.item?.status === "Submitted" && (
                  <SmallButton
                    tone="primary"
                    icon={<Play className="h-3.5 w-3.5" />}
                    disabled={start.isPending}
                    onClick={() => start.mutate(entry)}
                  >
                    Start review
                  </SmallButton>
                )}
                {canManage && entry.item?.status === "Under Review" && (
                  <>
                    <SmallButton
                      tone="success"
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      onClick={() => setDeciding({ entry, decision: "Approved" })}
                    >
                      Approve
                    </SmallButton>
                    <SmallButton
                      tone="danger"
                      icon={<XCircle className="h-3.5 w-3.5" />}
                      onClick={() => setDeciding({ entry, decision: "Rejected" })}
                    >
                      Reject
                    </SmallButton>
                  </>
                )}
              </EntryRow>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Send className="h-4 w-4 text-[#C2410C]" /> Needs follow-up with the institution (
            {needs_follow_up.length})
          </span>
        }
        noPad
      >
        {needs_follow_up.length === 0 ? (
          <EmptyState title="No failed or rejected cycle waiting for follow-up" />
        ) : (
          <ul className="divide-y divide-[#EEF2F5] dark:divide-slate-800">
            {needs_follow_up.map((entry) => (
              <EntryRow key={entry.cycle?.id} entry={entry} onOpen={onOpen}>
                {canManage && entry.cycle && (
                  <SmallButton
                    icon={<Send className="h-3.5 w-3.5" />}
                    onClick={() => setAsking(entry)}
                  >
                    Record correction request
                  </SmallButton>
                )}
                {canUpload && targetFor(entry) && (
                  <SmallButton
                    tone="primary"
                    icon={<Upload className="h-3.5 w-3.5" />}
                    onClick={() => onUpload(targetFor(entry)!)}
                  >
                    Upload corrected file
                  </SmallButton>
                )}
              </EntryRow>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#B45309]" /> Waiting for a corrected file (
            {awaiting_correction.length})
          </span>
        }
        noPad
      >
        {awaiting_correction.length === 0 ? (
          <EmptyState title="No correction outstanding" />
        ) : (
          <ul className="divide-y divide-[#EEF2F5] dark:divide-slate-800">
            {awaiting_correction.map((entry) => (
              <EntryRow key={entry.cycle?.id} entry={entry} onOpen={onOpen}>
                {canUpload && targetFor(entry) && (
                  <SmallButton
                    tone="primary"
                    icon={<Upload className="h-3.5 w-3.5" />}
                    onClick={() => onUpload(targetFor(entry)!)}
                  >
                    Upload corrected file
                  </SmallButton>
                )}
              </EntryRow>
            ))}
          </ul>
        )}
      </SectionCard>

      {deciding && <DecisionDialog {...deciding} onClose={() => setDeciding(null)} />}
      {asking && <CorrectionDialog entry={asking} onClose={() => setAsking(null)} />}
    </div>
  );
}

function EntryRow({
  entry,
  onOpen,
  children,
}: {
  entry: QueueEntry;
  onOpen: (requirementId: number) => void;
  children?: ReactNode;
}) {
  const [showChain, setShowChain] = useState(false);
  const cycle = entry.cycle;
  const overdue = cycle?.status === "Overdue";
  return (
    <li
      className={`px-6 py-4 space-y-2 ${overdue ? "bg-[#FDECEF]/50 dark:bg-red-950/20 shadow-[inset_3px_0_0_#DC3154]" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#172033] dark:text-white">
            {entry.participant_name}
          </div>
          {entry.requirement ? (
            <button
              onClick={() => onOpen(entry.requirement!.id)}
              className="text-xs text-[#168FA8] hover:underline cursor-pointer text-left"
            >
              {entry.requirement.requirement_name}
              {cycle ? ` · ${cycle.period} cycle, due ${fmtDay(cycle.due_date)}` : ""}
            </button>
          ) : (
            <div className="text-xs text-[#7B8798]">Not linked to a register requirement</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cycle && <StatusPill status={cycle.status} />}
          {cycle && cycle.status !== "Approved" && (
            <span
              className={`text-[11px] ${overdue ? "text-[#DC3154] font-semibold" : "text-[#7B8798]"}`}
            >
              {dueText(cycle.days_until_due, overdue)}
            </span>
          )}
          {entry.received_in_time === false && (
            <span className="text-[11px] font-semibold text-[#C2410C]">
              Received after the due date
            </span>
          )}
          {entry.cycle_closed && (
            <span className="text-[11px] text-[#7B8798]">
              Cycle already approved — this decides the file only
            </span>
          )}
        </div>
      </div>
      {entry.item ? (
        <ItemSummary item={entry.item} />
      ) : (
        <div className="text-xs text-[#7B8798]">No file in this cycle.</div>
      )}
      {cycle?.correction_requested_at && (
        <div className="text-[11px] text-[#B45309]">
          Corrected file requested by {cycle.correction_requested_by}
          {cycle.correction_note ? ` — “${cycle.correction_note}”` : ""}
        </div>
      )}
      {entry.chain.length > 0 && (
        <div>
          <button
            onClick={() => setShowChain(!showChain)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#526174] cursor-pointer"
          >
            <History className="h-3 w-3" /> Correction history ({entry.chain.length} earlier attempt
            {entry.chain.length === 1 ? "" : "s"})
          </button>
          {showChain && (
            <div className="mt-2 space-y-3 border-l-2 border-[#DCE3E8] dark:border-slate-700 pl-3">
              {entry.chain.map((prev) => (
                <ItemSummary key={prev.ref} item={prev} />
              ))}
            </div>
          )}
        </div>
      )}
      {children && <div className="flex flex-wrap gap-2 pt-1">{children}</div>}
    </li>
  );
}

function DecisionDialog({
  entry,
  decision,
  onClose,
}: {
  entry: QueueEntry;
  decision: "Approved" | "Rejected";
  onClose: () => void;
}) {
  const meta = useComplianceMeta();
  const refresh = useRefreshCompliance();
  const min = meta.data?.min_rejection_reason ?? 20;
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.put(reviewPath(entry), { decision, notes, rejection_reason: reason }),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (e) => {
      const { fields, message } = formErrors(e, ["rejection_reason", "notes"]);
      setErrors(fields);
      setFormError(message);
    },
  });
  const rejecting = decision === "Rejected";

  function submit() {
    const local: Record<string, string> = {};
    if (rejecting && reason.trim().length < min)
      local.rejection_reason = `Give a rejection reason of at least ${min} characters.`;
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length === 0) save.mutate();
  }

  return (
    <Modal
      title={`${rejecting ? "Reject" : "Approve"} ${entry.item?.ref}`}
      subtitle={`${entry.participant_name}${entry.requirement ? ` · ${entry.requirement.requirement_name}` : ""}${
        entry.cycle ? ` (${entry.cycle.period})` : ""
      }`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          {rejecting ? (
            <DangerButton
              onClick={submit}
              disabled={save.isPending}
              icon={<XCircle className="h-4 w-4" />}
            >
              {save.isPending ? "Saving…" : "Reject submission"}
            </DangerButton>
          ) : (
            <PrimaryButton
              onClick={submit}
              disabled={save.isPending}
              icon={<CheckCircle2 className="h-4 w-4" />}
            >
              {save.isPending ? "Saving…" : "Approve submission"}
            </PrimaryButton>
          )}
        </>
      }
    >
      <FormError message={formError} />
      {rejecting ? (
        <>
          <Field
            label="Rejection reason (required)"
            error={errors.rejection_reason}
            hint={`${reason.trim().length}/${min} characters minimum. Compliance users are notified to follow up with the institution offline.`}
          >
            <textarea
              rows={4}
              className={textareaCls}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Totals do not reconcile with the settlement report for 3–4 October"
            />
          </Field>
          <Field label="Reviewer notes (optional)" error={errors.notes}>
            <textarea
              rows={2}
              className={textareaCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Reviewer notes (optional)" error={errors.notes}>
            <textarea
              rows={3}
              className={textareaCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <p className="text-[11px] text-[#7B8798]">
            Approving closes the {entry.cycle?.period ?? "current"} cycle
            {entry.requirement && entry.requirement.frequency !== "Ad hoc"
              ? ` and opens the next ${entry.requirement.frequency.toLowerCase()} cycle with its due date calculated from the frequency.`
              : "."}
          </p>
        </>
      )}
    </Modal>
  );
}

function CorrectionDialog({ entry, onClose }: { entry: QueueEntry; onClose: () => void }) {
  const refresh = useRefreshCompliance();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.post(`/compliance/cycles/${entry.cycle?.id}/request-correction`, { note }),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (e) => setError(formErrors(e, []).message),
  });
  return (
    <Modal
      title="Record correction request"
      subtitle={`${entry.participant_name} · ${entry.requirement?.requirement_name ?? ""} (${entry.cycle?.period ?? ""})`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => save.mutate()}
            disabled={save.isPending}
            icon={<Send className="h-4 w-4" />}
          >
            {save.isPending ? "Saving…" : "Mark Pending Correction"}
          </PrimaryButton>
        </>
      }
    >
      <FormError message={error} />
      <p className="text-xs text-[#526174] dark:text-slate-300">
        Record that you have asked the institution — offline, by phone or email — for a corrected
        file (§6.4 step 3). The cycle moves to Pending Correction until the corrected file is
        uploaded.
      </p>
      <Field label="How was the institution contacted? (optional)">
        <textarea
          rows={3}
          className={textareaCls}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Emailed the error report to the operations contact"
        />
      </Field>
    </Modal>
  );
}
