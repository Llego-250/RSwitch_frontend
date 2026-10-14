// Incidents (REQ-COMP-006/007/010/011, §6.2, §9.4): record an incident for a
// participant, then Open → Under Investigation (the assigned owner
// acknowledges) → Remediation In Progress (Compliance adds action items with
// owner and due date; each owner completes theirs) → Resolved → Closed.
// The API enforces who may do what; the page only shows the allowed buttons.

import { useMemo, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, CheckCircle2, Lock, Pencil, Plus, ShieldAlert, UserCheck } from "lucide-react";
import { PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { api } from "@/lib/api";
import {
  INCIDENT_STATUSES,
  SEVERITIES,
  dueText,
  fmtDate,
  fmtDateTime,
  fmtDay,
  formErrors,
  useComplianceMeta,
  useIncident,
  useIncidents,
  useRefreshCompliance,
  useStaff,
  type Incident,
  type Severity,
} from "@/lib/compliance";
import { useParticipants } from "@/lib/queries";
import { inputCls, textareaCls } from "@/components/governance/ui";
import {
  EmptyState,
  Field,
  FormError,
  LoadState,
  Modal,
  SeverityPill,
  SmallButton,
  StatusPill,
  selectCls,
  tdCls,
  thCls,
} from "./ui";

function todayKey(today?: string): string {
  if (today) return today;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function IncidentsPanel({
  canManage,
  onCreate,
  onOpen,
}: {
  canManage: boolean;
  onCreate: () => void;
  onOpen: (id: number) => void;
}) {
  const participants = useParticipants();
  const [participantId, setParticipantId] = useState<number | "">("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [mine, setMine] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const incidents = useIncidents({
    participant_id: participantId === "" ? undefined : participantId,
    status: status || undefined,
    severity: severity || undefined,
    mine,
  });
  const rows = useMemo(
    () => (incidents.data ?? []).filter((i) => !openOnly || i.is_open),
    [incidents.data, openOnly],
  );
  const filtered = participantId !== "" || status || severity || mine || openOnly;

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[#DC3154]" /> Incidents
        </span>
      }
      action={
        canManage ? (
          <SmallButton tone="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={onCreate}>
            Record incident
          </SmallButton>
        ) : (
          <span className="text-[11px] text-[#7B8798]">
            Compliance records incidents · owners act on their own
          </span>
        )
      }
      noPad
    >
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-[#DCE3E8] dark:border-slate-800">
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
          {INCIDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          aria-label="Severity"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-[#526174] dark:text-slate-300 ml-1">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
          />{" "}
          Unresolved only
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-[#526174] dark:text-slate-300">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />{" "}
          Assigned to me
        </label>
      </div>
      <LoadState loading={incidents.isLoading} error={incidents.error} />
      {incidents.data && rows.length === 0 && (
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title={filtered ? "No incident matches these filters" : "No incidents recorded"}
        >
          {filtered
            ? "Clear a filter to see more."
            : "Incidents recorded by Compliance appear here."}
        </EmptyState>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {[
                  "Incident",
                  "Participant",
                  "Severity",
                  "Description",
                  "Raised",
                  "Owner",
                  "Status",
                  "Remediation",
                ].map((h) => (
                  <th key={h} className={thCls}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => onOpen(i.id)}
                  className="border-t border-[#EEF2F5] dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className={`${tdCls} font-mono font-semibold`}>{i.ref}</td>
                  <td className={tdCls}>{i.participant_name}</td>
                  <td className={tdCls}>
                    <SeverityPill severity={i.severity} />
                  </td>
                  <td className={`${tdCls} max-w-xs`}>
                    <div className="line-clamp-2">{i.description}</div>
                  </td>
                  <td className={tdCls}>
                    {fmtDate(i.raised_at)}
                    {i.incident_date && (
                      <div className="text-[11px] text-[#7B8798]">
                        occurred {fmtDay(i.incident_date)}
                      </div>
                    )}
                  </td>
                  <td className={tdCls}>
                    {i.owner?.name ??
                      (i.assignee || <span className="text-[#7B8798]">Unassigned</span>)}
                  </td>
                  <td className={tdCls}>
                    <StatusPill status={i.status} />
                  </td>
                  <td className={tdCls}>
                    {i.action_counts.total === 0 ? (
                      <span className="text-[11px] text-[#7B8798]">No actions yet</span>
                    ) : (
                      <div>
                        <div>
                          {i.action_counts.completed}/{i.action_counts.total} completed
                        </div>
                        {i.action_counts.overdue > 0 ? (
                          <div className="text-[11px] font-semibold text-[#DC3154]">
                            {i.action_counts.overdue} overdue
                          </div>
                        ) : i.next_action_due ? (
                          <div className="text-[11px] text-[#7B8798]">
                            next due {fmtDay(i.next_action_due)}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ---- record / edit ---------------------------------------------------------------

const INCIDENT_FIELDS = [
  "participant_id",
  "description",
  "severity",
  "incident_date",
  "owner_id",
  "notes",
];

export function IncidentForm({
  incident,
  onClose,
  onSaved,
}: {
  incident?: Incident;
  onClose: () => void;
  onSaved: (i: Incident) => void;
}) {
  const participants = useParticipants();
  const staff = useStaff();
  const meta = useComplianceMeta();
  const refresh = useRefreshCompliance();
  const today = todayKey(meta.data?.today);
  const [participantId, setParticipantId] = useState<number | "">(incident?.participant_id ?? "");
  const [incidentDate, setIncidentDate] = useState(incident?.incident_date ?? today);
  const [severity, setSeverity] = useState<Severity>(incident?.severity ?? "Medium");
  const [ownerId, setOwnerId] = useState<number | "">(incident?.owner_id ?? "");
  const [description, setDescription] = useState(incident?.description ?? "");
  const [notes, setNotes] = useState(incident?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        description,
        severity,
        incident_date: incidentDate,
        owner_id: ownerId === "" ? null : ownerId,
        notes,
      };
      return incident
        ? api.put<Incident>(`/compliance/incidents/${incident.id}`, body)
        : api.post<Incident>("/compliance/incidents", {
            ...body,
            participant_id: participantId === "" ? null : participantId,
          });
    },
    onSuccess: (saved) => {
      refresh();
      onSaved(saved);
    },
    onError: (e) => {
      const { fields, message } = formErrors(e, INCIDENT_FIELDS);
      setErrors(fields);
      setFormError(message);
    },
  });

  function submit() {
    const local: Record<string, string> = {};
    if (participantId === "") local.participant_id = "Choose the participant institution.";
    if (!description.trim()) local.description = "Describe the incident.";
    if (!incidentDate) local.incident_date = "Give the date the incident happened.";
    else if (incidentDate > today)
      local.incident_date = "The incident date can't be in the future.";
    if (ownerId === "" && incident && incident.status !== "Open")
      local.owner_id = "An incident under investigation needs an owner.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length === 0) save.mutate();
  }

  return (
    <Modal
      title={incident ? `Edit ${incident.ref}` : "Record incident"}
      subtitle={
        incident
          ? undefined
          : "Logged as Open; the assigned owner is notified by email and in-app (§6.2)."
      }
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : incident ? "Save changes" : "Record incident"}
          </PrimaryButton>
        </>
      }
    >
      <FormError message={formError} />
      <Field label="Participant" error={errors.participant_id}>
        <select
          className={inputCls}
          value={participantId}
          disabled={!!incident}
          onChange={(e) => setParticipantId(e.target.value ? Number(e.target.value) : "")}
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
        <Field label="Incident date" error={errors.incident_date}>
          <input
            type="date"
            className={inputCls}
            max={today}
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
          />
        </Field>
        <Field label="Severity" error={errors.severity}>
          <select
            className={inputCls}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Assigned remediation owner"
        error={errors.owner_id}
        hint="Any RSwitch staff member. They acknowledge the incident to start the investigation."
      >
        <select
          className={inputCls}
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Not assigned yet</option>
          {(staff.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description" error={errors.description}>
        <textarea
          rows={3}
          className={textareaCls}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What happened, and what it affects"
        />
      </Field>
      <Field label="Notes (optional)" error={errors.notes}>
        <textarea
          rows={2}
          className={textareaCls}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

// ---- detail and workflow ---------------------------------------------------------

export function IncidentDetailModal({
  id,
  onClose,
  onEdit,
}: {
  id: number;
  onClose: () => void;
  onEdit: (i: Incident) => void;
}) {
  const detail = useIncident(id);
  const meta = useComplianceMeta();
  const staff = useStaff();
  const refresh = useRefreshCompliance();
  const today = todayKey(meta.data?.today);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryError, setSummaryError] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState({
    description: "",
    owner_id: "" as number | "",
    due_date: "",
  });
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [completing, setCompleting] = useState<number | null>(null);
  const [completionNote, setCompletionNote] = useState("");

  const done = () => {
    setError(null);
    refresh();
  };
  const transition = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.put<Incident>(`/compliance/incidents/${id}`, body),
    onSuccess: () => {
      setResolving(false);
      setSummaryError(undefined);
      done();
    },
    onError: (e) => {
      const { fields, message } = formErrors(e, ["resolution_summary"]);
      setSummaryError(fields.resolution_summary);
      setError(message);
    },
  });
  const addAction = useMutation({
    mutationFn: () =>
      api.post<Incident>(`/compliance/incidents/${id}/actions`, {
        description: action.description,
        owner_id: action.owner_id === "" ? null : action.owner_id,
        due_date: action.due_date || null,
      }),
    onSuccess: () => {
      setAdding(false);
      setAction({ description: "", owner_id: "", due_date: "" });
      setActionErrors({});
      done();
    },
    onError: (e) => {
      const { fields, message } = formErrors(e, ["description", "owner_id", "due_date"]);
      setActionErrors(fields);
      setError(message);
    },
  });
  const complete = useMutation({
    mutationFn: (actionId: number) =>
      api.post<Incident>(`/compliance/incidents/${id}/actions/${actionId}/complete`, {
        note: completionNote,
      }),
    onSuccess: () => {
      setCompleting(null);
      setCompletionNote("");
      done();
    },
    onError: (e) => setError(formErrors(e, []).message),
  });

  function submitAction() {
    const local: Record<string, string> = {};
    if (!action.description.trim()) local.description = "Describe the remediation action.";
    if (action.owner_id === "") local.owner_id = "Choose who owns this action.";
    if (!action.due_date) local.due_date = "Choose a due date.";
    else if (action.due_date < today) local.due_date = "The due date can't be in the past.";
    setActionErrors(local);
    if (Object.keys(local).length === 0) addAction.mutate();
  }

  const i = detail.data;
  const step = i ? INCIDENT_STATUSES.indexOf(i.status) : -1;
  return (
    <Modal
      wide
      title={i ? `${i.ref} · ${i.participant_name}` : "Incident"}
      subtitle={i ? meta.data?.incident_status_help[i.status] : undefined}
      onClose={onClose}
      footer={
        i ? (
          <>
            {i.permissions.can_edit && (
              <SecondaryButton icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(i)}>
                Edit
              </SecondaryButton>
            )}
            {i.permissions.can_acknowledge && (
              <PrimaryButton
                icon={<UserCheck className="h-4 w-4" />}
                disabled={transition.isPending}
                onClick={() => transition.mutate({ status: "Under Investigation" })}
              >
                Acknowledge — start investigation
              </PrimaryButton>
            )}
            {i.permissions.can_resolve && !resolving && (
              <PrimaryButton
                icon={<CheckCircle2 className="h-4 w-4" />}
                onClick={() => setResolving(true)}
              >
                Mark resolved
              </PrimaryButton>
            )}
            {i.permissions.can_close && (
              <PrimaryButton
                icon={<Lock className="h-4 w-4" />}
                disabled={transition.isPending}
                onClick={() => {
                  if (window.confirm(`Close ${i.ref}? A closed incident is read-only.`))
                    transition.mutate({ status: "Closed" });
                }}
              >
                Close incident
              </PrimaryButton>
            )}
          </>
        ) : undefined
      }
    >
      <LoadState loading={detail.isLoading} error={detail.error} />
      <FormError message={error} />
      {i && (
        <>
          <ol className="flex flex-wrap items-center gap-1 text-[11px] font-semibold">
            {INCIDENT_STATUSES.map((s, n) => (
              <li key={s} className="flex items-center gap-1">
                <span
                  className={`px-2 py-1 rounded-lg border ${
                    n === step
                      ? "bg-[#168FA8] text-white border-[#168FA8]"
                      : n < step
                        ? "bg-[#E8F7F1] text-[#12825E] border-[#16A979]/30"
                        : "bg-white dark:bg-slate-800 text-[#7B8798] border-[#DCE3E8] dark:border-slate-700"
                  }`}
                >
                  {n < step && <Check className="inline h-3 w-3 mr-0.5" />}
                  {s}
                </span>
                {n < INCIDENT_STATUSES.length - 1 && <span className="text-[#B8C4CE]">→</span>}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={i.severity} />
            <StatusPill status={i.status} />
          </div>
          <p className="text-sm text-[#172033] dark:text-slate-100 whitespace-pre-line">
            {i.description}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <Info label="Incident date">{i.incident_date ? fmtDay(i.incident_date) : "—"}</Info>
            <Info label="Raised">
              {fmtDateTime(i.raised_at)}
              {i.raised_by ? ` by ${i.raised_by.name}` : ""}
            </Info>
            <Info label="Assigned owner">
              {i.owner ? `${i.owner.name} (${i.owner.role})` : "Not assigned"}
            </Info>
            <Info label="Acknowledged">
              {i.acknowledged_at ? fmtDateTime(i.acknowledged_at) : "—"}
            </Info>
            <Info label="Resolved">{i.resolved_at ? fmtDateTime(i.resolved_at) : "—"}</Info>
            <Info label="Closed">{i.closed_at ? fmtDateTime(i.closed_at) : "—"}</Info>
          </div>
          {i.notes && (
            <p className="text-xs text-[#526174] dark:text-slate-300 whitespace-pre-line">
              Notes: {i.notes}
            </p>
          )}
          {i.resolution_summary && (
            <div className="rounded-xl border border-[#16A979]/30 bg-[#E8F7F1] dark:bg-emerald-950/30 px-3 py-2 text-xs">
              <span className="font-semibold text-[#12825E]">Resolution summary: </span>
              {i.resolution_summary}
            </div>
          )}
          {resolving && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2">
              <Field
                label="Resolution summary"
                error={summaryError}
                hint="Reported in the Incident Report (§14.5)."
              >
                <textarea
                  rows={3}
                  className={textareaCls}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="How the incident was remediated and verified"
                />
              </Field>
              <div className="flex justify-end gap-2">
                <SmallButton onClick={() => setResolving(false)}>Cancel</SmallButton>
                <SmallButton
                  tone="primary"
                  disabled={transition.isPending}
                  onClick={() => {
                    if (!summary.trim()) {
                      setSummaryError("Summarise how the incident was resolved.");
                      return;
                    }
                    transition.mutate({ status: "Resolved", resolution_summary: summary });
                  }}
                >
                  Mark resolved
                </SmallButton>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#526174]">
                Remediation action items
              </h3>
              {i.permissions.can_add_actions && !adding && (
                <SmallButton
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => setAdding(true)}
                >
                  Add action
                </SmallButton>
              )}
            </div>
            {i.status === "Open" && (
              <p className="text-[11px] text-[#7B8798]">
                Remediation actions can be added once the assigned owner has acknowledged the
                incident.
              </p>
            )}
            {i.actions.length === 0 ? (
              <p className="text-xs text-[#7B8798]">No remediation actions yet.</p>
            ) : (
              <ul className="divide-y divide-[#EEF2F5] dark:divide-slate-800 rounded-xl border border-[#DCE3E8] dark:border-slate-700">
                {i.actions.map((a) => (
                  <li
                    key={a.id}
                    className={`px-3 py-2.5 space-y-1 ${a.status === "Overdue" ? "bg-[#FDECEF]/60 dark:bg-red-950/20" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex-1 min-w-0">
                        {a.description}
                      </span>
                      <StatusPill status={a.status} />
                    </div>
                    <div className="text-[11px] text-[#7B8798]">
                      Owner {a.owner?.name ?? "—"} · due {fmtDay(a.due_date)}
                      {a.status !== "Completed" && (
                        <span
                          className={a.status === "Overdue" ? "text-[#DC3154] font-semibold" : ""}
                        >
                          {" "}
                          · {dueText(a.days_until_due, a.status === "Overdue")}
                          {a.status === "Overdue" ? " — escalated to senior Compliance" : ""}
                        </span>
                      )}
                      {a.completed_at &&
                        ` · completed ${fmtDateTime(a.completed_at)} by ${a.completed_by}`}
                      {a.completion_note && ` — “${a.completion_note}”`}
                    </div>
                    {a.can_complete && completing !== a.id && (
                      <SmallButton
                        tone="success"
                        icon={<Check className="h-3.5 w-3.5" />}
                        onClick={() => setCompleting(a.id)}
                      >
                        Mark completed
                      </SmallButton>
                    )}
                    {completing === a.id && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className={`${inputCls} flex-1 min-w-48`}
                          placeholder="Completion note (optional)"
                          value={completionNote}
                          onChange={(e) => setCompletionNote(e.target.value)}
                        />
                        <SmallButton onClick={() => setCompleting(null)}>Cancel</SmallButton>
                        <SmallButton
                          tone="success"
                          disabled={complete.isPending}
                          onClick={() => complete.mutate(a.id)}
                        >
                          Confirm
                        </SmallButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {adding && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2">
                <Field label="Action" error={actionErrors.description}>
                  <input
                    className={inputCls}
                    value={action.description}
                    onChange={(e) => setAction({ ...action, description: e.target.value })}
                    placeholder="e.g. Add a duplicate-ID check to the export job"
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Owner" error={actionErrors.owner_id}>
                    <select
                      className={inputCls}
                      value={action.owner_id}
                      onChange={(e) =>
                        setAction({
                          ...action,
                          owner_id: e.target.value ? Number(e.target.value) : "",
                        })
                      }
                    >
                      <option value="">Select…</option>
                      {(staff.data ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Due date"
                    error={actionErrors.due_date}
                    hint="Escalated to senior Compliance if still open after this date."
                  >
                    <input
                      type="date"
                      min={today}
                      className={inputCls}
                      value={action.due_date}
                      onChange={(e) => setAction({ ...action, due_date: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="flex justify-end gap-2">
                  <SmallButton onClick={() => setAdding(false)}>Cancel</SmallButton>
                  <SmallButton tone="primary" disabled={addAction.isPending} onClick={submitAction}>
                    {addAction.isPending ? "Saving…" : "Add action"}
                  </SmallButton>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide font-semibold text-[#7B8798]">
        {label}
      </div>
      <div className="text-[#172033] dark:text-slate-100">{children}</div>
    </div>
  );
}
