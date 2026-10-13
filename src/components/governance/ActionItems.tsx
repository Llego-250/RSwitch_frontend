// Action items (REQ-GOV-006, §9.4): register, create/edit form and the
// status control. Overdue is set by the system; the owner (or Compliance)
// moves an item through Open → In Progress → Completed (§6.3 step 6).

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  User,
} from "lucide-react";
import { PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { api, errorMessage } from "@/lib/api";
import {
  ACTION_STATUSES,
  dayKey,
  dueLabel,
  fieldErrors,
  fmtDate,
  fmtDay,
  useActionItems,
  useCommittees,
  useGovDirectory,
  useMeetings,
  useRefreshGovernance,
  type ActionStatus,
  type GovActionItem,
} from "@/lib/governance";
import {
  ActionStatusPill,
  CommitteeChip,
  EmptyState,
  Field,
  FormError,
  GovModal,
  LoadState,
  inputCls,
  linkBtnCls,
  textareaCls,
} from "./ui";

export function OwnerCell({ owner }: { owner: GovActionItem["owner"] }) {
  const Icon = owner.type === "institution" ? Building2 : User;
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#7B8798]" />
      <div className="min-w-0">
        <div className="font-medium text-[#172033] dark:text-slate-100 truncate">{owner.name}</div>
        <div className="text-[11px] text-[#7B8798] truncate">
          {owner.type === "institution"
            ? `Institution · ${owner.email || "no contact email"}`
            : owner.type === "user"
              ? "RSwitch"
              : "Not linked to a user or institution"}
        </div>
      </div>
    </div>
  );
}

export function DueCell({ item }: { item: GovActionItem }) {
  const late = item.status === "Overdue";
  return (
    <div>
      <div className={late ? "font-semibold text-[#DC3154]" : "text-[#172033] dark:text-slate-200"}>
        {fmtDay(item.due_date)}
      </div>
      <div className={`text-[11px] ${late ? "text-[#DC3154]" : "text-[#7B8798]"}`}>
        {dueLabel(item)}
      </div>
    </div>
  );
}

/** Status buttons, shown only to whoever may change this item's status. */
export function ActionStatusControl({ item }: { item: GovActionItem }) {
  const refresh = useRefreshGovernance();
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (status: ActionStatus) =>
      api.put<GovActionItem>(`/governance/action-items/${item.id}`, { status }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) =>
      setError(
        fieldErrors(e).message ?? Object.values(fieldErrors(e).fields)[0] ?? errorMessage(e),
      ),
  });
  if (!item.can_update_status) return null;
  const started = item.status === "In Progress" || item.started_at !== null;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-3">
        {item.status !== "Completed" && !started && (
          <button
            className={linkBtnCls}
            disabled={update.isPending}
            onClick={() => update.mutate("In Progress")}
          >
            <Play className="h-3 w-3" />
            Start
          </button>
        )}
        {item.status !== "Completed" ? (
          <button
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#16A979] hover:underline cursor-pointer disabled:opacity-50"
            disabled={update.isPending}
            onClick={() => update.mutate("Completed")}
          >
            <CheckCircle2 className="h-3 w-3" />
            Mark complete
          </button>
        ) : (
          <button
            className={linkBtnCls}
            disabled={update.isPending}
            onClick={() => update.mutate("Open")}
          >
            <RotateCcw className="h-3 w-3" />
            Reopen
          </button>
        )}
      </div>
      {error && <span className="text-[11px] text-[#DC3154]">{error}</span>}
    </div>
  );
}

export function ActionItemForm({
  item,
  defaultCommitteeId,
  defaultMeetingId,
  onClose,
}: {
  item?: GovActionItem;
  defaultCommitteeId?: number | null;
  defaultMeetingId?: number | null;
  onClose: () => void;
}) {
  const committees = useCommittees();
  const meetings = useMeetings();
  const directory = useGovDirectory();
  const refresh = useRefreshGovernance();

  const [description, setDescription] = useState(item?.description ?? "");
  const [committeeId, setCommitteeId] = useState<number | "">(
    item?.committee_id ?? defaultCommitteeId ?? "",
  );
  const [meetingId, setMeetingId] = useState<number | "">(
    item?.meeting_id ?? defaultMeetingId ?? "",
  );
  const [ownerType, setOwnerType] = useState<"user" | "institution">(
    item?.owner.type === "institution" ? "institution" : "user",
  );
  const [ownerId, setOwnerId] = useState<number | "">(
    item?.owner.type !== "unlinked" ? (item?.owner.id ?? "") : "",
  );
  const [dueDate, setDueDate] = useState(item?.due_date ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const committeeMeetings = (meetings.data ?? []).filter((m) => m.committee_id === committeeId);

  const save = useMutation({
    mutationFn: () => {
      const owner =
        ownerType === "user"
          ? { owner_user_id: ownerId, owner_participant_id: null }
          : { owner_participant_id: ownerId, owner_user_id: null };
      if (!item) {
        return api.post<GovActionItem>("/governance/action-items", {
          description,
          committee_id: committeeId,
          meeting_id: meetingId === "" ? null : meetingId,
          due_date: dueDate,
          ...owner,
        });
      }
      const body: Record<string, unknown> = {};
      if (description !== item.description) body.description = description;
      if (dueDate !== item.due_date) body.due_date = dueDate;
      if ((meetingId === "" ? null : meetingId) !== item.meeting_id)
        body.meeting_id = meetingId === "" ? null : meetingId;
      if (ownerType !== item.owner.type || ownerId !== item.owner.id) Object.assign(body, owner);
      return api.put<GovActionItem>(`/governance/action-items/${item.id}`, body);
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (e) => {
      const { fields, message } = fieldErrors(e);
      setErrors(fields);
      setFormError(message);
    },
  });

  function submit() {
    const local: Record<string, string> = {};
    if (!description.trim()) local.description = "Describe the action to be taken.";
    if (committeeId === "") local.committee_id = "Choose a committee or working group.";
    if (ownerId === "") local.owner = "Choose who owns this action.";
    if (!dueDate) local.due_date = "Choose a due date.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length === 0) save.mutate();
  }

  return (
    <GovModal
      title={item ? "Edit action item" : "New action item"}
      subtitle="Owners are reminded 7 days and 1 day before the due date; the committee chair is alerted if it becomes overdue."
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : item ? "Save changes" : "Create action item"}
          </PrimaryButton>
        </>
      }
    >
      <FormError message={formError} />
      <Field label="Description" error={errors.description}>
        <textarea
          rows={3}
          className={textareaCls}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Circulate revised settlement cut-off times to all participants"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Committee / working group" error={errors.committee_id}>
          <select
            className={inputCls}
            value={committeeId}
            disabled={!!item}
            onChange={(e) => {
              setCommitteeId(e.target.value ? Number(e.target.value) : "");
              setMeetingId("");
            }}
          >
            <option value="">Select…</option>
            {(committees.data ?? [])
              .filter((c) => c.is_active || c.id === committeeId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Meeting (optional)" error={errors.meeting_id}>
          <select
            className={inputCls}
            value={meetingId}
            disabled={committeeId === ""}
            onChange={(e) => setMeetingId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Not linked to a meeting</option>
            {committeeMeetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} · {fmtDate(m.scheduled_at)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Owner"
        error={errors.owner ?? errors.owner_user_id ?? errors.owner_participant_id}
      >
        <div className="flex gap-2 mb-2">
          {(["user", "institution"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setOwnerType(t);
                setOwnerId("");
              }}
              className={`h-8 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${
                ownerType === t
                  ? "bg-[#168FA8] text-white border-[#168FA8]"
                  : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
              }`}
            >
              {t === "user" ? "RSwitch user" : "Institution"}
            </button>
          ))}
        </div>
        <select
          className={inputCls}
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Select…</option>
          {ownerType === "user"
            ? (directory.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))
            : (directory.data?.institutions ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.primary_contact_email
                    ? ` · ${p.primary_contact_email}`
                    : " · no contact email"}
                </option>
              ))}
        </select>
      </Field>
      <Field
        label="Due date"
        error={errors.due_date}
        hint={
          ownerType === "institution"
            ? "Reminders go to the institution's primary contact by email."
            : undefined
        }
      >
        <input
          type="date"
          className={inputCls}
          value={dueDate}
          min={dayKey(new Date())}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </Field>
    </GovModal>
  );
}

type StatusFilter = "All" | ActionStatus;

export function ActionItemsPanel({
  canManage,
  myEmail,
}: {
  canManage: boolean;
  myEmail: string | undefined;
}) {
  const items = useActionItems();
  const committees = useCommittees();
  const [status, setStatus] = useState<StatusFilter>("All");
  const [committeeId, setCommitteeId] = useState<number | "">("");
  const [mineOnly, setMineOnly] = useState(false);
  const [editing, setEditing] = useState<GovActionItem | null>(null);
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => items.data ?? [], [items.data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { All: all.length };
    for (const s of ACTION_STATUSES) c[s] = all.filter((i) => i.status === s).length;
    return c;
  }, [all]);
  const rows = all.filter(
    (i) =>
      (status === "All" || i.status === status) &&
      (committeeId === "" || i.committee_id === committeeId) &&
      (!mineOnly || (i.owner.type === "user" && i.owner.email === myEmail)),
  );

  return (
    <SectionCard
      title={
        <>
          <ClipboardList className="h-5 w-5 text-[#168FA8]" /> Action items
        </>
      }
      action={
        canManage ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New action item
          </PrimaryButton>
        ) : undefined
      }
      noPad
    >
      <div className="px-6 py-3 flex flex-wrap items-center gap-2 border-b border-[#DCE3E8] dark:border-slate-800">
        {(["All", ...ACTION_STATUSES] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`h-7 px-3 rounded-lg text-xs font-medium border cursor-pointer ${
              status === s
                ? "bg-[#168FA8] text-white font-semibold border-[#168FA8]"
                : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
            }`}
          >
            {s} <span className="opacity-70">({counts[s] ?? 0})</span>
          </button>
        ))}
        <select
          className="h-7 px-2 rounded-lg text-xs border border-[#DCE3E8] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300"
          value={committeeId}
          onChange={(e) => setCommitteeId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">All committees</option>
          {(committees.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-[#526174] dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
          />
          Assigned to me
        </label>
      </div>
      <LoadState loading={items.isLoading} error={items.error} />
      {items.data && rows.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="No action items match these filters"
        >
          {all.length === 0
            ? "No action items have been recorded yet."
            : "Try another status or committee."}
        </EmptyState>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-[#526174] dark:text-slate-300">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Action</th>
                <th className="px-4 py-2.5 text-left font-semibold">Owner</th>
                <th className="px-4 py-2.5 text-left font-semibold">Committee</th>
                <th className="px-4 py-2.5 text-left font-semibold">Due</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((i) => (
                <tr
                  key={i.id}
                  className={i.status === "Overdue" ? "bg-[#FDECEF]/40 dark:bg-red-950/10" : ""}
                >
                  <td className="px-4 py-3 max-w-xs">
                    <div className="font-medium text-[#172033] dark:text-white">
                      {i.description}
                    </div>
                    {i.meeting_title && (
                      <div className="text-[11px] text-[#7B8798] mt-0.5">
                        From: {i.meeting_title}
                      </div>
                    )}
                    {i.status === "Completed" && i.completed_at && (
                      <div className="text-[11px] text-[#16A979] mt-0.5">
                        Completed {fmtDate(i.completed_at)}
                        {i.completed_by ? ` by ${i.completed_by}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <OwnerCell owner={i.owner} />
                  </td>
                  <td className="px-4 py-3">
                    <CommitteeChip name={i.committee} type={i.committee_type} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <DueCell item={i} />
                  </td>
                  <td className="px-4 py-3">
                    <ActionStatusPill status={i.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <ActionStatusControl item={i} />
                      {canManage && (
                        <button
                          className={linkBtnCls}
                          onClick={() => setEditing(i)}
                          aria-label="Edit action item"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <ActionItemForm onClose={() => setCreating(false)} />}
      {editing && <ActionItemForm item={editing} onClose={() => setEditing(null)} />}
    </SectionCard>
  );
}
