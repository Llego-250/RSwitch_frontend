// Compliance Register (REQ-COMP-001/002, §10.3): every obligation per
// participant with its current cycle's status, the cycle history behind it
// (§11.4, REQ-COMP-009), and the create/edit form (§11.4: a new due date must
// be in the future). Compliance manages; Business and Technical/Admin view.

import { useMemo, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  Pencil,
  Power,
  Search,
  Send,
  Upload,
} from "lucide-react";
import { PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { api } from "@/lib/api";
import {
  COMPLIANCE_STATUSES,
  FREQUENCIES,
  KINDS,
  dueText,
  fmtDate,
  fmtDateTime,
  fmtDay,
  formErrors,
  useComplianceMeta,
  useComplianceOptions,
  useRefreshCompliance,
  useRequirement,
  useRequirements,
  uploadTargetFor,
  type Cycle,
  type Frequency,
  type RequirementDetail,
  type RequirementKind,
  type UploadTarget,
} from "@/lib/compliance";
import { useParticipants } from "@/lib/queries";
import { inputCls, textareaCls } from "@/components/governance/ui";
import {
  EmptyState,
  Field,
  FormError,
  ItemSummary,
  LoadState,
  Modal,
  SmallButton,
  StatusPill,
  selectCls,
  tdCls,
  thCls,
} from "./ui";

export function RegisterPanel({
  canManage,
  canUpload,
  onOpen,
  onUpload,
  onCreate,
}: {
  canManage: boolean;
  canUpload: boolean;
  onOpen: (id: number) => void;
  onUpload: (target: UploadTarget) => void;
  onCreate: () => void;
}) {
  const participants = useParticipants();
  const meta = useComplianceMeta();
  const [participantId, setParticipantId] = useState<number | "">("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [frequency, setFrequency] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [q, setQ] = useState("");
  const rows = useRequirements({
    participant_id: participantId === "" ? undefined : participantId,
    status: status || undefined,
    kind: kind || undefined,
    frequency: frequency || undefined,
    include_inactive: includeInactive,
  });
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows.data ?? []).filter(
      (r) =>
        !needle ||
        `${r.requirement_name} ${r.regulatory_reference} ${r.participant_name} ${r.participant_code}`
          .toLowerCase()
          .includes(needle),
    );
  }, [rows.data, q]);
  const filtered = participantId !== "" || status || kind || frequency || q || includeInactive;

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[#168FA8]" /> Compliance Register
        </span>
      }
      action={
        canManage ? (
          <SmallButton
            tone="primary"
            onClick={onCreate}
            icon={<ClipboardList className="h-3.5 w-3.5" />}
          >
            New requirement
          </SmallButton>
        ) : (
          <span className="text-[11px] text-[#7B8798]">
            View only · Compliance manages the register
          </span>
        )
      }
      noPad
    >
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-[#DCE3E8] dark:border-slate-800">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7B8798]" />
          <input
            className={`${selectCls} pl-8 w-56`}
            placeholder="Search requirement or reference"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className={selectCls}
          value={participantId}
          onChange={(e) => setParticipantId(e.target.value ? Number(e.target.value) : "")}
          aria-label="Participant"
        >
          <option value="">All participants</option>
          {(participants.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {COMPLIANCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Kind"
        >
          <option value="">Data returns & documents</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          aria-label="Frequency"
        >
          <option value="">Any frequency</option>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-[#526174] dark:text-slate-300 ml-1">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Show deactivated
        </label>
        <span className="ml-auto text-[11px] text-[#7B8798]">
          {rows.data
            ? `${shown.length} of ${rows.data.length} requirement${rows.data.length === 1 ? "" : "s"}`
            : ""}
        </span>
      </div>
      <LoadState loading={rows.isLoading} error={rows.error} />
      {rows.data && shown.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title={filtered ? "No requirement matches these filters" : "The register is empty"}
        >
          {filtered
            ? "Clear a filter to see more."
            : canManage
              ? "Add each participant's regulatory obligations with “New requirement”."
              : "A Compliance user hasn't added any obligations yet."}
        </EmptyState>
      )}
      {shown.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {[
                  "Participant",
                  "Requirement",
                  "Kind",
                  "Frequency",
                  "Due date",
                  "Status",
                  "Latest file",
                  "",
                ].map((h) => (
                  <th key={h} className={thCls}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const overdue = r.submission_status === "Overdue";
                return (
                  <tr
                    key={r.id}
                    onClick={() => onOpen(r.id)}
                    className={`border-t border-[#EEF2F5] dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                      overdue
                        ? "bg-[#FDECEF]/60 dark:bg-red-950/20 shadow-[inset_3px_0_0_#DC3154]"
                        : ""
                    } ${r.active ? "" : "opacity-60"}`}
                  >
                    <td className={tdCls}>
                      <div className="font-semibold">{r.participant_name}</div>
                      <div className="text-[11px] text-[#7B8798]">{r.institution_type}</div>
                    </td>
                    <td className={tdCls}>
                      <div className="font-semibold">{r.requirement_name}</div>
                      <div className="text-[11px] text-[#7B8798]">{r.regulatory_reference}</div>
                      {!r.active && (
                        <div className="text-[11px] font-semibold text-[#7B8798]">Deactivated</div>
                      )}
                    </td>
                    <td className={tdCls}>
                      <div>{r.kind}</div>
                      <div className="text-[11px] text-[#7B8798]">
                        {r.template_name ?? r.doc_type_name ?? "—"}
                      </div>
                    </td>
                    <td className={tdCls}>{r.frequency}</td>
                    <td className={tdCls}>
                      <div className={overdue ? "font-semibold text-[#DC3154]" : ""}>
                        {fmtDay(r.due_date)}
                      </div>
                      <div
                        className={`text-[11px] ${overdue ? "text-[#DC3154]" : "text-[#7B8798]"}`}
                      >
                        {r.cycle?.period ? `${r.cycle.period} · ` : ""}
                        {r.submission_status === "Approved"
                          ? "approved"
                          : dueText(r.days_until_due, overdue)}
                      </div>
                    </td>
                    <td className={tdCls}>
                      <StatusPill
                        status={r.submission_status}
                        title={meta.data?.status_help[r.submission_status]}
                      />
                      {overdue && r.stage !== "Pending" && (
                        <div className="text-[11px] text-[#7B8798] mt-1">Latest: {r.stage}</div>
                      )}
                    </td>
                    <td className={tdCls}>
                      {r.latest_item ? (
                        <div>
                          <span className="font-mono text-[11px]">{r.latest_item.ref}</span>{" "}
                          <span className="text-[11px] text-[#7B8798]">
                            {fmtDate(r.latest_item.uploaded_at)}
                          </span>
                          {r.attempts > 1 && (
                            <div className="text-[11px] text-[#7B8798]">
                              {r.attempts} attempts this cycle
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#7B8798]">Nothing received</span>
                      )}
                    </td>
                    <td className={`${tdCls} text-right`} onClick={(e) => e.stopPropagation()}>
                      {canUpload && r.active && (
                        <SmallButton
                          icon={<Upload className="h-3.5 w-3.5" />}
                          onClick={() => onUpload(uploadTargetFor(r))}
                        >
                          Upload
                        </SmallButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ---- detail -------------------------------------------------------------------

export function RequirementDetailModal({
  id,
  canManage,
  canUpload,
  onClose,
  onUpload,
  onEdit,
}: {
  id: number;
  canManage: boolean;
  canUpload: boolean;
  onClose: () => void;
  onUpload: (target: UploadTarget) => void;
  onEdit: (r: RequirementDetail) => void;
}) {
  const detail = useRequirement(id);
  const meta = useComplianceMeta();
  const refresh = useRefreshCompliance();
  const [error, setError] = useState<string | null>(null);
  const toggle = useMutation({
    mutationFn: (active: boolean) =>
      api.post<RequirementDetail>(
        `/compliance/requirements/${id}/${active ? "activate" : "deactivate"}`,
      ),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) => setError(formErrors(e, []).message),
  });
  const r = detail.data;

  return (
    <Modal
      wide
      title={r ? r.requirement_name : "Requirement"}
      subtitle={r ? `${r.participant_name} · ${r.regulatory_reference}` : undefined}
      onClose={onClose}
      footer={
        r ? (
          <>
            {canManage && (
              <SecondaryButton
                icon={<Power className="h-4 w-4" />}
                onClick={() => {
                  if (
                    !r.active ||
                    window.confirm("Stop tracking this obligation? Its history is kept.")
                  )
                    toggle.mutate(!r.active);
                }}
              >
                {r.active ? "Deactivate" : "Reactivate"}
              </SecondaryButton>
            )}
            {canManage && r.active && (
              <SecondaryButton icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(r)}>
                Edit
              </SecondaryButton>
            )}
            {canUpload && r.active && (
              <PrimaryButton
                icon={<Upload className="h-4 w-4" />}
                onClick={() => onUpload(uploadTargetFor(r))}
              >
                {r.kind === "Document" ? "Upload document" : "Upload submission"}
              </PrimaryButton>
            )}
          </>
        ) : undefined
      }
    >
      <LoadState loading={detail.isLoading} error={detail.error} />
      <FormError message={error} />
      {r && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Fact label="Status">
              <StatusPill
                status={r.submission_status}
                title={meta.data?.status_help[r.submission_status]}
              />
            </Fact>
            <Fact label="Current due date">
              <span
                className={r.submission_status === "Overdue" ? "text-[#DC3154] font-semibold" : ""}
              >
                {fmtDay(r.due_date)}
              </span>
            </Fact>
            <Fact label="Frequency">{r.frequency}</Fact>
            <Fact label={r.kind === "Document" ? "Document type" : "Expected schema"}>
              {r.doc_type_name ?? r.template_name ?? "—"}
            </Fact>
          </div>
          {r.description && (
            <p className="text-xs text-[#526174] dark:text-slate-300">{r.description}</p>
          )}
          {meta.data && (
            <p className="text-[11px] text-[#7B8798]">
              {meta.data.status_help[r.submission_status]}
              {r.frequency !== "Ad hoc"
                ? " The next cycle's due date is calculated from the frequency once this one is approved."
                : ""}
            </p>
          )}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#526174]">Cycles</h3>
            {r.cycles.map((c) => (
              <CycleCard
                key={c.id}
                cycle={c}
                requirement={r}
                canManage={canManage}
                canUpload={canUpload}
                onUpload={onUpload}
              />
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-[#7B8798]">
        {label}
      </div>
      <div className="mt-0.5 font-semibold text-[#172033] dark:text-slate-100">{children}</div>
    </div>
  );
}

function CycleCard({
  cycle,
  requirement,
  canManage,
  canUpload,
  onUpload,
}: {
  cycle: Cycle;
  requirement: RequirementDetail;
  canManage: boolean;
  canUpload: boolean;
  onUpload: (target: UploadTarget) => void;
}) {
  const refresh = useRefreshCompliance();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ask = useMutation({
    mutationFn: () => api.post(`/compliance/cycles/${cycle.id}/request-correction`, { note }),
    onSuccess: () => {
      setAsking(false);
      setNote("");
      refresh();
    },
    onError: (e) => setError(formErrors(e, []).message),
  });
  const items = cycle.items ?? [];
  const latest = items[items.length - 1];
  const needsFix = ["Validation Failed", "Rejected"].includes(cycle.stage);
  const overdue = cycle.status === "Overdue";

  return (
    <div
      className={`rounded-xl border px-4 py-3 space-y-2 ${
        overdue
          ? "border-[#DC3154]/50 bg-[#FDECEF]/40 dark:bg-red-950/20"
          : "border-[#DCE3E8] dark:border-slate-700"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-sm text-[#172033] dark:text-white">{cycle.period}</span>
        <span
          className={`text-[11px] ${overdue ? "text-[#DC3154] font-semibold" : "text-[#7B8798]"}`}
        >
          due {fmtDay(cycle.due_date)}
          {cycle.status !== "Approved" ? ` · ${dueText(cycle.days_until_due, overdue)}` : ""}
        </span>
        <StatusPill status={cycle.status} />
        {overdue && cycle.stage !== "Pending" && (
          <span className="text-[11px] text-[#7B8798]">latest: {cycle.stage}</span>
        )}
        {cycle.status === "Approved" && cycle.on_time !== null && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold ${cycle.on_time ? "text-[#12825E]" : "text-[#C2410C]"}`}
          >
            {cycle.on_time ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertTriangle className="h-3 w-3" />
            )}
            {cycle.on_time ? "Received on time" : "Received after the due date"}
          </span>
        )}
      </div>
      {cycle.approved_at && (
        <div className="text-[11px] text-[#526174]">
          Approved {fmtDateTime(cycle.approved_at)}
          {cycle.reviewed_by ? ` by ${cycle.reviewed_by}` : ""}
        </div>
      )}
      {cycle.correction_requested_at && (
        <div className="text-[11px] text-[#B45309] flex items-start gap-1">
          <Send className="h-3 w-3 mt-0.5" />
          Corrected file requested {fmtDateTime(cycle.correction_requested_at)} by{" "}
          {cycle.correction_requested_by}
          {cycle.correction_note ? ` — “${cycle.correction_note}”` : ""}
        </div>
      )}
      {items.length === 0 ? (
        <div className="text-[11px] text-[#7B8798] flex items-center gap-1">
          <CalendarClock className="h-3 w-3" /> Nothing received for this cycle yet.
        </div>
      ) : (
        <div className="space-y-3 border-l-2 border-[#DCE3E8] dark:border-slate-700 pl-3">
          {[...items].reverse().map((item) => (
            <ItemSummary key={item.ref} item={item} />
          ))}
        </div>
      )}
      {needsFix && requirement.active && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canManage && !asking && (
            <SmallButton icon={<Send className="h-3.5 w-3.5" />} onClick={() => setAsking(true)}>
              Record correction request
            </SmallButton>
          )}
          {canUpload && latest && (
            <SmallButton
              tone="primary"
              icon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => onUpload(uploadTargetFor(requirement, latest.id))}
            >
              Upload corrected file
            </SmallButton>
          )}
        </div>
      )}
      {cycle.stage === "Pending Correction" && canUpload && latest && requirement.active && (
        <SmallButton
          tone="primary"
          icon={<Upload className="h-3.5 w-3.5" />}
          onClick={() => onUpload(uploadTargetFor(requirement, latest.id))}
        >
          Upload corrected file
        </SmallButton>
      )}
      {asking && (
        <div className="space-y-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
          <FormError message={error} />
          <Field
            label="How was the institution contacted? (optional)"
            hint="§6.4: Compliance contacts the institution offline for a corrected file."
          >
            <textarea
              rows={2}
              className={textareaCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Emailed the operations contact with the error report"
            />
          </Field>
          <div className="flex gap-2 justify-end">
            <SmallButton onClick={() => setAsking(false)}>Cancel</SmallButton>
            <SmallButton tone="primary" onClick={() => ask.mutate()} disabled={ask.isPending}>
              {ask.isPending ? "Saving…" : "Mark Pending Correction"}
            </SmallButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- create / edit ------------------------------------------------------------

const FORM_FIELDS = [
  "participant_id",
  "requirement_name",
  "regulatory_reference",
  "kind",
  "template_id",
  "doc_type_id",
  "frequency",
  "due_date",
  "description",
];

function tomorrow(today?: string): string {
  const base = today ? new Date(`${today}T00:00:00`) : new Date();
  base.setDate(base.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

export function RequirementForm({
  requirement,
  onClose,
  onSaved,
}: {
  requirement?: RequirementDetail;
  onClose: () => void;
  onSaved: (r: RequirementDetail) => void;
}) {
  const participants = useParticipants();
  const meta = useComplianceMeta();
  const refresh = useRefreshCompliance();
  const [participantId, setParticipantId] = useState<number | "">(
    requirement?.participant_id ?? "",
  );
  const options = useComplianceOptions(participantId === "" ? undefined : participantId);
  const [name, setName] = useState(requirement?.requirement_name ?? "");
  const [reference, setReference] = useState(requirement?.regulatory_reference ?? "");
  const [kind, setKind] = useState<RequirementKind>(requirement?.kind ?? "Data Return");
  const [templateId, setTemplateId] = useState<number | "">(requirement?.template_id ?? "");
  const [docTypeId, setDocTypeId] = useState<number | "">(requirement?.doc_type_id ?? "");
  const [frequency, setFrequency] = useState<Frequency>(requirement?.frequency ?? "Monthly");
  const [dueDate, setDueDate] = useState(requirement?.due_date ?? "");
  const [description, setDescription] = useState(requirement?.description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const minDue = tomorrow(meta.data?.today);

  const save = useMutation({
    mutationFn: () => {
      if (!requirement) {
        return api.post<RequirementDetail>("/compliance/requirements", {
          participant_id: participantId === "" ? null : participantId,
          requirement_name: name,
          regulatory_reference: reference,
          kind,
          template_id: kind === "Data Return" && templateId !== "" ? templateId : null,
          doc_type_id: kind === "Document" && docTypeId !== "" ? docTypeId : null,
          frequency,
          due_date: dueDate || null,
          description,
        });
      }
      const body: Record<string, unknown> = {};
      if (name !== requirement.requirement_name) body.requirement_name = name;
      if (reference !== requirement.regulatory_reference) body.regulatory_reference = reference;
      if (frequency !== requirement.frequency) body.frequency = frequency;
      if (description !== requirement.description) body.description = description;
      if (kind === "Data Return" && templateId !== (requirement.template_id ?? ""))
        body.template_id = templateId === "" ? null : templateId;
      if (kind === "Document" && docTypeId !== (requirement.doc_type_id ?? ""))
        body.doc_type_id = docTypeId === "" ? null : docTypeId;
      if (dueDate !== requirement.due_date) body.due_date = dueDate;
      return api.put<RequirementDetail>(`/compliance/requirements/${requirement.id}`, body);
    },
    onSuccess: (saved) => {
      refresh();
      onSaved(saved);
    },
    onError: (e) => {
      const { fields, message } = formErrors(e, FORM_FIELDS);
      setErrors(fields);
      setFormError(message);
    },
  });

  function submit() {
    const local: Record<string, string> = {};
    if (participantId === "") local.participant_id = "Choose the responsible participant.";
    if (!name.trim()) local.requirement_name = "Name the requirement.";
    if (!reference.trim())
      local.regulatory_reference = "Give the regulatory reference, e.g. BNR Directive 07/2024.";
    if (kind === "Data Return" && templateId === "")
      local.template_id = "Choose the expected schema files are validated against.";
    if (kind === "Document" && docTypeId === "")
      local.doc_type_id = "Choose the required document type.";
    if (!dueDate) local.due_date = "Choose a due date.";
    else if ((!requirement || dueDate !== requirement.due_date) && dueDate < minDue)
      local.due_date = "The due date must be in the future.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length === 0) save.mutate();
  }

  const approvedCurrent = requirement?.submission_status === "Approved";
  return (
    <Modal
      title={requirement ? "Edit requirement" : "New compliance requirement"}
      subtitle={
        requirement
          ? "Changing the due date moves the current cycle's deadline."
          : "The first cycle opens at the due date; recurring requirements roll on after each approval (§11.4)."
      }
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : requirement ? "Save changes" : "Add to register"}
          </PrimaryButton>
        </>
      }
    >
      <FormError message={formError} />
      <Field label="Responsible participant" error={errors.participant_id}>
        <select
          className={inputCls}
          value={participantId}
          disabled={!!requirement}
          onChange={(e) => {
            setParticipantId(e.target.value ? Number(e.target.value) : "");
            setTemplateId("");
          }}
        >
          <option value="">Select…</option>
          {(participants.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Requirement name" error={errors.requirement_name}>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Monthly transaction return"
          />
        </Field>
        <Field label="Regulatory reference" error={errors.regulatory_reference}>
          <input
            className={inputCls}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. BNR Directive 07/2024"
          />
        </Field>
      </div>
      <Field label="What satisfies it" error={errors.kind}>
        <div className="flex gap-2">
          {(["Data Return", "Document"] as const).map((k) => (
            <button
              key={k}
              type="button"
              disabled={!!requirement}
              onClick={() => setKind(k)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold border cursor-pointer disabled:cursor-not-allowed ${
                kind === k
                  ? "bg-[#168FA8] text-white border-[#168FA8]"
                  : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
              }`}
            >
              {k === "Data Return"
                ? "Data return (file validated against a schema)"
                : "Document (licence, certificate…)"}
            </button>
          ))}
        </div>
      </Field>
      {kind === "Data Return" ? (
        <Field
          label="Expected schema"
          error={errors.template_id}
          hint={
            participantId === ""
              ? "Choose the participant first."
              : "Uploaded files are validated against it (§11.3)."
          }
        >
          <select
            className={inputCls}
            value={templateId}
            disabled={participantId === ""}
            onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select…</option>
            {(options.data?.templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Document type" error={errors.doc_type_id}>
          <select
            className={inputCls}
            value={docTypeId}
            onChange={(e) => setDocTypeId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select…</option>
            {(options.data?.doc_types ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Frequency" error={errors.frequency}>
          <select
            className={inputCls}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={
            requirement
              ? approvedCurrent
                ? "Next delivery due"
                : "Current cycle due date"
              : "First due date"
          }
          error={errors.due_date}
          hint="Must be a future date (§11.4)."
        >
          <input
            type="date"
            className={inputCls}
            min={minDue}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Notes (optional)" error={errors.description}>
        <textarea
          rows={2}
          className={textareaCls}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {meta.data && (
        <p className="text-[11px] text-[#7B8798] flex items-start gap-1">
          <FileText className="h-3 w-3 mt-0.5 shrink-0" />
          Reminders go to Compliance users and the participant's primary contact{" "}
          {meta.data.reminder_days_before.join(", ")} day(s) before each deadline (Settings →
          reminders).
        </p>
      )}
    </Modal>
  );
}
