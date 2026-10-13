// Committees and the membership register (REQ-GOV-001, REQ-GOV-008): the
// Board, Steering Committees and Technical/Operational Working Groups, their
// chair (an RSwitch user) and members, who are RSwitch staff or participant
// representatives.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2, Crown, Pencil, Plus, Trash2, User, UserPlus, Users } from "lucide-react";
import { PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { api, errorMessage } from "@/lib/api";
import {
  COMMITTEE_TYPES,
  committeeColor,
  MEMBER_ROLES,
  fieldErrors,
  useCommittees,
  useGovDirectory,
  useRefreshGovernance,
  type Committee,
  type CommitteeMember,
  type CommitteeType,
} from "@/lib/governance";
import {
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

function CommitteeForm({ committee, onClose }: { committee?: Committee; onClose: () => void }) {
  const directory = useGovDirectory();
  const refresh = useRefreshGovernance();
  const [name, setName] = useState(committee?.name ?? "");
  const [type, setType] = useState<CommitteeType>(committee?.type ?? "Steering Committee");
  const [chairId, setChairId] = useState<number | "">(committee?.chair?.id ?? "");
  const [description, setDescription] = useState(committee?.description ?? "");
  const [active, setActive] = useState(committee?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, type, description, chair_id: chairId === "" ? null : chairId };
      return committee
        ? api.put<Committee>(`/governance/committees/${committee.id}`, {
            ...body,
            is_active: active,
          })
        : api.post<Committee>("/governance/committees", body);
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
    if (!name.trim()) local.name = "Give the committee a name.";
    if (chairId === "") local.chair_id = "Choose the chair (an RSwitch user).";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length === 0) save.mutate();
  }

  return (
    <GovModal
      title={committee ? `Edit ${committee.name}` : "New committee or working group"}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : committee ? "Save changes" : "Create"}
          </PrimaryButton>
        </>
      }
    >
      <FormError message={formError} />
      <Field label="Name" error={errors.name}>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Type" error={errors.type}>
          <select
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value as CommitteeType)}
          >
            {COMMITTEE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Chair"
          error={errors.chair_id}
          hint="Receives escalations when action items become overdue."
        >
          <select
            className={inputCls}
            value={chairId}
            onChange={(e) => setChairId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select…</option>
            {(directory.data?.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Remit" error={errors.description}>
        <textarea
          rows={3}
          className={textareaCls}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {committee && (
        <label className="inline-flex items-center gap-2 text-xs text-[#526174] dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active (inactive committees keep their records but can't hold new meetings)
        </label>
      )}
    </GovModal>
  );
}

function MemberForm({ committee, onClose }: { committee: Committee; onClose: () => void }) {
  const directory = useGovDirectory();
  const refresh = useRefreshGovernance();
  const [kind, setKind] = useState<"staff" | "representative">("staff");
  const [userId, setUserId] = useState<number | "">("");
  const [participantId, setParticipantId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("Member");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const seated = new Set([
    ...(committee.chair ? [committee.chair.id] : []),
    ...committee.members.map((m) => m.user_id).filter((id): id is number => id !== null),
  ]);

  const save = useMutation({
    mutationFn: () =>
      api.post<CommitteeMember>(
        `/governance/committees/${committee.id}/members`,
        kind === "staff"
          ? { user_id: userId, role }
          : { participant_id: participantId, name, email, role },
      ),
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
    if (kind === "staff" && userId === "") local.user_id = "Choose an RSwitch user.";
    if (kind === "representative") {
      if (participantId === "") local.participant_id = "Choose the institution.";
      if (!name.trim()) local.name = "Enter the representative's name.";
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email.trim()))
        local.email = "Enter a valid email address (e.g. name@institution.rw).";
    }
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length === 0) save.mutate();
  }

  return (
    <GovModal
      title={`Add a member to ${committee.name}`}
      subtitle="Participant representatives have no RDIP login; they are reached by email."
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Adding…" : "Add member"}
          </PrimaryButton>
        </>
      }
    >
      <FormError message={formError} />
      <div className="flex gap-2">
        {(["staff", "representative"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`h-8 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${
              kind === k
                ? "bg-[#168FA8] text-white border-[#168FA8]"
                : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
            }`}
          >
            {k === "staff" ? "RSwitch staff" : "Participant representative"}
          </button>
        ))}
      </div>
      {kind === "staff" ? (
        <Field label="RSwitch user" error={errors.user_id}>
          <select
            className={inputCls}
            value={userId}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select…</option>
            {(directory.data?.users ?? [])
              .filter((u) => !seated.has(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
          </select>
        </Field>
      ) : (
        <>
          <Field label="Institution" error={errors.participant_id}>
            <select
              className={inputCls}
              value={participantId}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : "";
                setParticipantId(id);
                const p = directory.data?.institutions.find((i) => i.id === id);
                // Start from the institution's primary contact; editable.
                if (p && !name && !email) {
                  setName(p.primary_contact_name);
                  setEmail(p.primary_contact_email);
                }
              }}
            >
              <option value="">Select…</option>
              {(directory.data?.institutions ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Representative's name" error={errors.name}>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email" error={errors.email}>
              <input
                className={inputCls}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>
        </>
      )}
      <Field label="Role in the group" error={errors.role}>
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
          {MEMBER_ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
    </GovModal>
  );
}

function MemberRow({
  committee,
  member,
  canManage,
  onError,
}: {
  committee: Committee;
  member: CommitteeMember;
  canManage: boolean;
  onError: (message: string) => void;
}) {
  const refresh = useRefreshGovernance();
  const base = `/governance/committees/${committee.id}/members/${member.id}`;
  const setRole = useMutation({
    mutationFn: (role: string) => api.put<CommitteeMember>(base, { role }),
    onSuccess: refresh,
    onError: (e) => onError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete<{ deleted: number }>(base),
    onSuccess: refresh,
    onError: (e) => onError(errorMessage(e)),
  });
  const Icon = member.kind === "staff" ? User : Building2;
  return (
    <tr>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-[#7B8798] shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-[#172033] dark:text-white">{member.name}</div>
            <div className="text-[11px] text-[#7B8798] truncate">{member.email}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-2 text-[#526174] dark:text-slate-300">
        {member.kind === "staff"
          ? `RSwitch · ${member.staff_role ?? ""}`
          : (member.institution ?? "Representative")}
      </td>
      <td className="px-4 py-2">
        {canManage ? (
          <select
            className="h-7 px-2 rounded-lg text-xs border border-[#DCE3E8] dark:border-slate-700 bg-white dark:bg-slate-800"
            value={member.role}
            disabled={setRole.isPending}
            onChange={(e) => setRole.mutate(e.target.value)}
          >
            {MEMBER_ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        ) : (
          member.role
        )}
      </td>
      {canManage && (
        <td className="px-4 py-2 text-right">
          <button
            aria-label={`Remove ${member.name}`}
            className="text-slate-400 hover:text-[#DC3154] cursor-pointer disabled:opacity-50"
            disabled={remove.isPending}
            onClick={() =>
              window.confirm(`Remove ${member.name} from ${committee.name}?`) && remove.mutate()
            }
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      )}
    </tr>
  );
}

function CommitteeCard({ committee, canManage }: { committee: Committee; canManage: boolean }) {
  const refresh = useRefreshGovernance();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => api.delete<{ deleted: number }>(`/governance/committees/${committee.id}`),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const stats: [string, number][] = [
    ["Members", committee.members.length + (committee.chair ? 1 : 0)],
    ["Upcoming meetings", committee.upcoming_meetings],
    ["Open actions", committee.open_action_items],
    ["Overdue", committee.overdue_action_items],
    ["Documents", committee.document_count],
  ];
  return (
    <div
      className={`rounded-2xl border border-[#DCE3E8] dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden ${
        committee.is_active ? "" : "opacity-70"
      }`}
    >
      <div className="px-5 py-4 border-b border-[#DCE3E8] dark:border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${committeeColor(committee.type).dot}`} />
              <h3 className="font-bold text-[#172033] dark:text-white">{committee.name}</h3>
              <CommitteeChip name={committee.type} type={committee.type} />
              {!committee.is_active && (
                <span className="text-[11px] font-semibold text-[#7B8798] border border-slate-300 rounded-full px-2">
                  Inactive
                </span>
              )}
              {committee.is_member && (
                <span className="text-[11px] font-semibold text-[#168FA8]">You are a member</span>
              )}
            </div>
            {committee.description && (
              <p className="text-xs text-[#526174] dark:text-slate-400 mt-1 max-w-2xl">
                {committee.description}
              </p>
            )}
            <div className="flex items-center gap-1.5 text-xs mt-2 text-[#526174] dark:text-slate-300">
              <Crown className="h-3.5 w-3.5 text-[#D97706]" />
              Chair:{" "}
              <span className="font-semibold text-[#172033] dark:text-white">
                {committee.chair ? committee.chair.name : "No chair assigned"}
              </span>
              {committee.chair && <span className="text-[#7B8798]">· {committee.chair.email}</span>}
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-3">
              <button className={linkBtnCls} onClick={() => setAdding(true)}>
                <UserPlus className="h-3 w-3" />
                Add member
              </button>
              <button className={linkBtnCls} onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" />
                Edit
              </button>
              <button
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#DC3154] hover:underline cursor-pointer disabled:opacity-50"
                disabled={remove.isPending}
                onClick={() =>
                  window.confirm(
                    `Delete ${committee.name}? Only a committee with no meetings, documents or action items can be deleted.`,
                  ) && remove.mutate()
                }
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
              <div
                className={`text-lg font-bold ${
                  label === "Overdue" && value > 0
                    ? "text-[#DC3154]"
                    : "text-[#172033] dark:text-white"
                }`}
              >
                {value}
              </div>
              <div className="text-[11px] text-[#526174] dark:text-slate-400">{label}</div>
            </div>
          ))}
        </div>
        {error && (
          <div className="mt-3">
            <FormError message={error} />
          </div>
        )}
      </div>
      {committee.members.length === 0 ? (
        <EmptyState title="No members registered">
          {canManage
            ? "Add RSwitch staff or participant representatives."
            : "Only the chair is recorded."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-[#526174] dark:text-slate-300">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">
                  Member ({committee.staff_count} staff · {committee.representative_count}{" "}
                  representatives)
                </th>
                <th className="px-4 py-2 text-left font-semibold">Organisation</th>
                <th className="px-4 py-2 text-left font-semibold">Role</th>
                {canManage && (
                  <th className="px-4 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {committee.members.map((m) => (
                <MemberRow
                  key={m.id}
                  committee={committee}
                  member={m}
                  canManage={canManage}
                  onError={setError}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <CommitteeForm committee={committee} onClose={() => setEditing(false)} />}
      {adding && <MemberForm committee={committee} onClose={() => setAdding(false)} />}
    </div>
  );
}

export function CommitteesPanel({ canManage }: { canManage: boolean }) {
  const committees = useCommittees();
  const [creating, setCreating] = useState(false);
  return (
    <SectionCard
      title={
        <>
          <Users className="h-5 w-5 text-[#168FA8]" /> Committees & membership register
        </>
      }
      action={
        canManage ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New committee
          </PrimaryButton>
        ) : undefined
      }
    >
      <LoadState loading={committees.isLoading} error={committees.error} />
      {committees.data && committees.data.length === 0 && (
        <EmptyState icon={<Users className="h-8 w-8" />} title="No committees yet">
          {canManage
            ? "Create the Board, steering committees and working groups."
            : "None have been set up."}
        </EmptyState>
      )}
      <div className="space-y-4">
        {(committees.data ?? []).map((c) => (
          <CommitteeCard key={c.id} committee={c} canManage={canManage} />
        ))}
      </div>
      {creating && <CommitteeForm onClose={() => setCreating(false)} />}
    </SectionCard>
  );
}
