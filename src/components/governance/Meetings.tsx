// Meetings (REQ-GOV-004/005, §6.3): the Meeting Calendar for every committee,
// the meeting form (date/time, committee, attendees, agenda) and the meeting
// record (minutes, decisions, action items).

import { useMemo, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  History,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Upload,
  User,
  Users,
} from "lucide-react";
import { PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { api, errorMessage } from "@/lib/api";
import {
  COMMITTEE_TYPES,
  committeeColor,
  dayKey,
  downloadDocument,
  fieldErrors,
  fmtDateTime,
  fmtTime,
  parseUtc,
  toLocalInput,
  useCommittees,
  useGovDirectory,
  useMeeting,
  useMeetings,
  useRefreshGovernance,
  type Committee,
  type GovMeeting,
} from "@/lib/governance";
import { ActionItemForm, ActionStatusControl, DueCell, OwnerCell } from "./ActionItems";
import { NewVersionForm, UploadDocumentForm } from "./Documents";
import {
  AccessBadge,
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

const DURATIONS = [30, 45, 60, 90, 120, 180, 240];

function useCommitteeTypes() {
  const committees = useCommittees();
  return useMemo(
    () => new Map((committees.data ?? []).map((c) => [c.id, c.type] as const)),
    [committees.data],
  );
}

// ---- meeting form -------------------------------------------------------------

function defaultStart(day?: Date): string {
  const d = day ? new Date(day) : new Date(Date.now() + 7 * 86_400_000);
  d.setHours(10, 0, 0, 0);
  return `${dayKey(d)}T10:00`;
}

function committeeInvitees(c: Committee | undefined) {
  if (!c) return { users: [] as number[], members: [] as number[] };
  const users = [
    ...(c.chair ? [c.chair.id] : []),
    ...c.members.filter((m) => m.user_id !== null).map((m) => m.user_id as number),
  ];
  const members = c.members.filter((m) => m.kind === "representative").map((m) => m.id);
  return { users, members };
}

export function MeetingForm({
  meeting,
  day,
  onClose,
}: {
  meeting?: GovMeeting;
  day?: Date;
  onClose: () => void;
}) {
  const committees = useCommittees();
  const directory = useGovDirectory();
  const refresh = useRefreshGovernance();

  const [title, setTitle] = useState(meeting?.title ?? "");
  const [committeeId, setCommitteeId] = useState<number | "">(meeting?.committee_id ?? "");
  const [start, setStart] = useState(
    meeting ? toLocalInput(meeting.scheduled_at) : defaultStart(day),
  );
  const [duration, setDuration] = useState(meeting?.duration_minutes ?? 60);
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [agenda, setAgenda] = useState(meeting?.agenda ?? "");
  const [userIds, setUserIds] = useState<number[]>(
    meeting?.attendees.filter((a) => a.user_id !== null).map((a) => a.user_id as number) ?? [],
  );
  const [memberIds, setMemberIds] = useState<number[]>(
    meeting?.attendees
      .filter((a) => a.kind === "representative" && a.member_id !== null)
      .map((a) => a.member_id as number) ?? [],
  );
  const [extraUser, setExtraUser] = useState<number | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const committee = committees.data?.find((c) => c.id === committeeId);
  const committeeUserIds = new Set(committeeInvitees(committee).users);
  const otherStaff = userIds.filter((id) => !committeeUserIds.has(id));
  const userName = (id: number) =>
    directory.data?.users.find((u) => u.id === id)?.name ?? `User #${id}`;

  const toggle = (list: number[], set: (v: number[]) => void, id: number) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = useMutation({
    mutationFn: () => {
      const scheduled_at = new Date(start).toISOString();
      if (!meeting) {
        return api.post<GovMeeting>("/governance/meetings", {
          title,
          committee_id: committeeId,
          scheduled_at,
          duration_minutes: duration,
          location,
          agenda,
          attendee_user_ids: userIds,
          attendee_member_ids: memberIds,
        });
      }
      const body: Record<string, unknown> = {
        title,
        duration_minutes: duration,
        location,
        agenda,
        attendee_user_ids: userIds,
        attendee_member_ids: memberIds,
      };
      if (start !== toLocalInput(meeting.scheduled_at)) body.scheduled_at = scheduled_at;
      return api.put<GovMeeting>(`/governance/meetings/${meeting.id}`, body);
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
    if (committeeId === "") local.committee_id = "Choose a committee or working group.";
    if (!start || Number.isNaN(new Date(start).getTime()))
      local.scheduled_at = "Choose the date and time.";
    if (!agenda.trim()) local.agenda = "Set out the agenda for the meeting.";
    if (userIds.length + memberIds.length === 0) local.attendees = "Choose at least one attendee.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length === 0) save.mutate();
  }

  return (
    <GovModal
      wide
      title={meeting ? "Edit meeting" : "Schedule a meeting"}
      subtitle={
        meeting
          ? "Changing the time or adding attendees sends them an updated invitation."
          : "Invitations go to every attendee (in-app and email) once saved."
      }
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : meeting ? "Save changes" : "Schedule meeting"}
          </PrimaryButton>
        </>
      }
    >
      <FormError message={formError} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Committee / working group" error={errors.committee_id}>
          <select
            className={inputCls}
            value={committeeId}
            disabled={!!meeting}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : "";
              setCommitteeId(id);
              const invitees = committeeInvitees(committees.data?.find((c) => c.id === id));
              setUserIds(invitees.users);
              setMemberIds(invitees.members);
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
        <Field label="Title" error={errors.title} hint="Defaults to “<committee> meeting”.">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Date & time" error={errors.scheduled_at}>
          <input
            type="datetime-local"
            className={inputCls}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration" error={errors.duration_minutes}>
            <select
              className={inputCls}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d < 60 ? `${d} min` : `${d / 60} h`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location" error={errors.location}>
            <input
              className={inputCls}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Boardroom / Teams"
            />
          </Field>
        </div>
      </div>
      <Field label="Agenda" error={errors.agenda}>
        <textarea
          rows={4}
          className={textareaCls}
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          placeholder={"1. Minutes of the previous meeting\n2. …"}
        />
      </Field>
      <Field
        label="Attendees"
        error={errors.attendees ?? errors.attendee_user_ids ?? errors.attendee_member_ids}
        hint="Participant representatives are invited by email."
      >
        {!committee ? (
          <div className="text-xs text-[#7B8798]">Choose a committee to pick from its members.</div>
        ) : (
          <div className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
            {committee.chair && (
              <AttendeeOption
                checked={userIds.includes(committee.chair.id)}
                onChange={() => toggle(userIds, setUserIds, committee.chair!.id)}
                name={committee.chair.name}
                detail="Chair · RSwitch"
              />
            )}
            {committee.members.map((m) =>
              m.user_id !== null ? (
                <AttendeeOption
                  key={m.id}
                  checked={userIds.includes(m.user_id)}
                  onChange={() => toggle(userIds, setUserIds, m.user_id as number)}
                  name={m.name}
                  detail={`${m.role} · RSwitch`}
                />
              ) : (
                <AttendeeOption
                  key={m.id}
                  checked={memberIds.includes(m.id)}
                  onChange={() => toggle(memberIds, setMemberIds, m.id)}
                  name={m.name}
                  detail={`${m.role} · ${m.institution ?? "Representative"} · ${m.email}`}
                  representative
                />
              ),
            )}
            {otherStaff.map((id) => (
              <AttendeeOption
                key={`extra-${id}`}
                checked
                onChange={() => toggle(userIds, setUserIds, id)}
                name={userName(id)}
                detail="Invited RSwitch staff (not a member)"
              />
            ))}
          </div>
        )}
      </Field>
      {committee && (
        <div className="flex gap-2">
          <select
            className={inputCls}
            value={extraUser}
            onChange={(e) => setExtraUser(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Invite other RSwitch staff…</option>
            {(directory.data?.users ?? [])
              .filter((u) => !userIds.includes(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
          </select>
          <SecondaryButton
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              if (extraUser !== "") setUserIds([...userIds, extraUser]);
              setExtraUser("");
            }}
          >
            Add
          </SecondaryButton>
        </div>
      )}
    </GovModal>
  );
}

function AttendeeOption({
  checked,
  onChange,
  name,
  detail,
  representative,
}: {
  checked: boolean;
  onChange: () => void;
  name: string;
  detail: string;
  representative?: boolean;
}) {
  const Icon = representative ? Building2 : User;
  return (
    <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <Icon className="h-3.5 w-3.5 text-[#7B8798]" />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[#172033] dark:text-white">{name}</span>
        <span className="block text-[11px] text-[#7B8798] truncate">{detail}</span>
      </span>
    </label>
  );
}

// ---- meeting record ---------------------------------------------------------------

function DecisionsEditor({ meeting, onDone }: { meeting: GovMeeting; onDone: () => void }) {
  const refresh = useRefreshGovernance();
  const [rows, setRows] = useState<string[]>(meeting.decisions.length ? meeting.decisions : [""]);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.put<GovMeeting>(`/governance/meetings/${meeting.id}`, {
        decisions: rows.filter((r) => r.trim()),
      }),
    onSuccess: () => {
      refresh();
      onDone();
    },
    onError: (e) => {
      const { fields, message } = fieldErrors(e);
      setError(fields.decisions ?? message ?? errorMessage(e));
    },
  });
  return (
    <div className="space-y-2">
      {rows.map((text, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 text-xs font-mono text-[#7B8798] w-5 text-right">{i + 1}.</span>
          <textarea
            rows={2}
            className={textareaCls}
            value={text}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? e.target.value : r)))}
            placeholder="Decision taken"
          />
          <button
            aria-label="Remove decision"
            className="mt-2 text-slate-400 hover:text-[#DC3154] cursor-pointer"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <FormError message={error} />
      <div className="flex items-center justify-between">
        <button className={linkBtnCls} onClick={() => setRows([...rows, ""])}>
          <Plus className="h-3 w-3" />
          Add decision
        </button>
        <div className="flex gap-2">
          <SecondaryButton onClick={onDone}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save decisions"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#526174] dark:text-slate-400">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MeetingDetail({
  meetingId,
  canManage,
  onClose,
}: {
  meetingId: number;
  canManage: boolean;
  onClose: () => void;
}) {
  const detail = useMeeting(meetingId);
  const types = useCommitteeTypes();
  const [editing, setEditing] = useState(false);
  const [editingDecisions, setEditingDecisions] = useState(false);
  const [uploadingMinutes, setUploadingMinutes] = useState(false);
  const [newMinutesVersion, setNewMinutesVersion] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = detail.data;
  const download = (doc: { id: number; filename: string }) =>
    downloadDocument(doc).catch((e) => setError(errorMessage(e)));

  if (editing && m) return <MeetingForm meeting={m} onClose={() => setEditing(false)} />;
  if (uploadingMinutes && m && m.committee_id !== null)
    return (
      <UploadDocumentForm
        onClose={() => setUploadingMinutes(false)}
        preset={{
          committeeId: m.committee_id,
          meetingId: m.id,
          meetingTitle: m.title,
          category: "Minutes",
        }}
      />
    );
  if (newMinutesVersion && m?.minutes)
    return <NewVersionForm doc={m.minutes} onClose={() => setNewMinutesVersion(false)} />;
  if (addingAction && m)
    return (
      <ActionItemForm
        defaultCommitteeId={m.committee_id}
        defaultMeetingId={m.id}
        onClose={() => setAddingAction(false)}
      />
    );

  const otherDocs = m ? m.documents.filter((d) => d.id !== m.minutes?.id) : [];
  return (
    <GovModal
      wide
      title={m?.title ?? "Meeting"}
      subtitle={
        m && (
          <span className="inline-flex flex-wrap items-center gap-2 mt-1">
            <CommitteeChip
              name={m.committee}
              type={m.committee_id !== null ? types.get(m.committee_id) : null}
            />
            <span>{m.status === "Upcoming" ? "Upcoming" : "Past meeting"}</span>
          </span>
        )
      }
      onClose={onClose}
      footer={
        canManage && m ? (
          <SecondaryButton icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
            Edit meeting
          </SecondaryButton>
        ) : undefined
      }
    >
      <LoadState loading={detail.isLoading} error={detail.error} />
      <FormError message={error} />
      {m && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#526174] dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {fmtDateTime(m.scheduled_at)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {m.duration_minutes} min
            </span>
            {m.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {m.location}
              </span>
            )}
            <span className="text-[#7B8798]">Scheduled by {m.created_by || "unknown"}</span>
          </div>

          <Section title="Agenda">
            <p className="whitespace-pre-wrap text-sm text-[#172033] dark:text-slate-200">
              {m.agenda || "No agenda recorded."}
            </p>
          </Section>

          <Section title={`Attendees (${m.attendees.length})`}>
            {m.attendees.length === 0 ? (
              <p className="text-xs text-[#7B8798]">No attendees recorded.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {m.attendees.map((a) => (
                  <span
                    key={a.id}
                    title={a.email}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-[#172033] dark:text-slate-200"
                  >
                    {a.kind === "staff" ? (
                      <User className="h-3 w-3" />
                    ) : (
                      <Building2 className="h-3 w-3" />
                    )}
                    {a.name}
                  </span>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Minutes"
            action={
              canManage && !m.minutes && m.status === "Past" ? (
                <button className={linkBtnCls} onClick={() => setUploadingMinutes(true)}>
                  <Upload className="h-3 w-3" />
                  Upload minutes
                </button>
              ) : undefined
            }
          >
            {m.minutes ? (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[#DCE3E8] dark:border-slate-700">
                <span className="inline-flex items-center gap-2 text-xs">
                  <FileText className="h-4 w-4 text-[#168FA8]" />
                  <span className="font-semibold text-[#172033] dark:text-white">
                    {m.minutes.title}
                  </span>
                  <span className="font-mono text-[#168FA8]">{m.minutes.version}</span>
                  <AccessBadge level={m.minutes.access_level} />
                </span>
                <span className="flex items-center gap-3">
                  <button className={linkBtnCls} onClick={() => download(m.minutes!)}>
                    <Download className="h-3 w-3" />
                    Download
                  </button>
                  {canManage && (
                    <button className={linkBtnCls} onClick={() => setNewMinutesVersion(true)}>
                      <History className="h-3 w-3" />
                      New version
                    </button>
                  )}
                </span>
              </div>
            ) : (
              <p className="text-xs text-[#7B8798]">
                {m.status === "Upcoming"
                  ? "Minutes are uploaded after the meeting."
                  : "No minutes available."}
              </p>
            )}
          </Section>

          <Section
            title={`Decisions (${m.decisions.length})`}
            action={
              canManage && !editingDecisions ? (
                <button className={linkBtnCls} onClick={() => setEditingDecisions(true)}>
                  <Pencil className="h-3 w-3" />
                  {m.decisions.length ? "Edit decisions" : "Record decisions"}
                </button>
              ) : undefined
            }
          >
            {editingDecisions ? (
              <DecisionsEditor meeting={m} onDone={() => setEditingDecisions(false)} />
            ) : m.decisions.length === 0 ? (
              <p className="text-xs text-[#7B8798]">No decisions recorded.</p>
            ) : (
              <ol className="list-decimal pl-5 space-y-1 text-sm text-[#172033] dark:text-slate-200">
                {m.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ol>
            )}
          </Section>

          <Section
            title={`Action items (${m.action_item_list.length})`}
            action={
              canManage ? (
                <button className={linkBtnCls} onClick={() => setAddingAction(true)}>
                  <Plus className="h-3 w-3" />
                  Add action item
                </button>
              ) : undefined
            }
          >
            {m.action_item_list.length === 0 ? (
              <p className="text-xs text-[#7B8798]">No action items from this meeting.</p>
            ) : (
              <div className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {m.action_item_list.map((i) => (
                  <div
                    key={i.id}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 text-xs items-start"
                  >
                    <div className="sm:col-span-4 font-medium text-[#172033] dark:text-white">
                      {i.description}
                    </div>
                    <div className="sm:col-span-3">
                      <OwnerCell owner={i.owner} />
                    </div>
                    <div className="sm:col-span-2">
                      <DueCell item={i} />
                    </div>
                    <div className="sm:col-span-3 flex flex-col items-start sm:items-end gap-1">
                      <ActionStatusPill status={i.status} />
                      <ActionStatusControl item={i} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {otherDocs.length > 0 && (
            <Section title="Other documents">
              <ul className="space-y-1.5">
                {otherDocs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-[#168FA8]" />
                      {d.title} <span className="font-mono text-[#168FA8]">{d.version}</span>
                      <span className="text-[#7B8798]">{d.category}</span>
                      <AccessBadge level={d.access_level} />
                    </span>
                    <button className={linkBtnCls} onClick={() => download(d)}>
                      <Download className="h-3 w-3" />
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </GovModal>
  );
}

// ---- calendar ---------------------------------------------------------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // back to Monday
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: Date[] = [];
  for (let d = new Date(start); d <= last || days.length % 7 !== 0; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

export function UpcomingMeetings({
  onOpen,
  limit = 6,
}: {
  onOpen: (id: number) => void;
  limit?: number;
}) {
  const today = dayKey(new Date());
  const meetings = useMeetings({ start: today });
  const types = useCommitteeTypes();
  const now = Date.now();
  const upcoming = (meetings.data ?? [])
    .filter((m) => parseUtc(m.scheduled_at).getTime() >= now)
    .slice(0, limit);
  return (
    <>
      <LoadState loading={meetings.isLoading} error={meetings.error} />
      {meetings.data && upcoming.length === 0 && (
        <EmptyState icon={<CalendarDays className="h-8 w-8" />} title="No upcoming meetings">
          Nothing is scheduled for any committee.
        </EmptyState>
      )}
      <ul className="space-y-2">
        {upcoming.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => onOpen(m.id)}
              className="w-full text-left p-3 rounded-xl border border-[#DCE3E8] dark:border-slate-800 hover:border-[#168FA8]/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-sm text-[#172033] dark:text-white">
                  {m.title}
                </span>
                <span className="text-[11px] font-mono text-[#526174] dark:text-slate-400 whitespace-nowrap">
                  {fmtDateTime(m.scheduled_at)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-[#7B8798]">
                <CommitteeChip
                  name={m.committee}
                  type={m.committee_id !== null ? types.get(m.committee_id) : null}
                />
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {m.attendees.length} invited
                </span>
                {m.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {m.location}
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function MeetingCalendar({
  canManage,
  onOpen,
  onCreate,
}: {
  canManage: boolean;
  onOpen: (id: number) => void;
  onCreate: (day?: Date) => void;
}) {
  const committees = useCommittees();
  const types = useCommitteeTypes();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [committeeId, setCommitteeId] = useState<number | "">("");
  const days = useMemo(() => monthGrid(month), [month]);
  // One day of padding either side: the API filters on UTC dates.
  const pad = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const meetings = useMeetings({
    start: dayKey(pad(days[0], -1)),
    end: dayKey(pad(days[days.length - 1], 1)),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, GovMeeting[]>();
    for (const m of meetings.data ?? []) {
      if (committeeId !== "" && m.committee_id !== committeeId) continue;
      const key = dayKey(parseUtc(m.scheduled_at));
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return map;
  }, [meetings.data, committeeId]);
  const monthCount = days
    .filter((d) => d.getMonth() === month.getMonth())
    .reduce((n, d) => n + (byDay.get(dayKey(d))?.length ?? 0), 0);
  const todayKey = dayKey(new Date());
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <SectionCard
      title={
        <>
          <CalendarDays className="h-5 w-5 text-[#168FA8]" /> Meeting calendar
        </>
      }
      action={
        canManage ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => onCreate()}>
            Schedule meeting
          </PrimaryButton>
        ) : undefined
      }
      noPad
    >
      <div className="px-6 py-3 flex flex-wrap items-center gap-2 border-b border-[#DCE3E8] dark:border-slate-800">
        <button
          aria-label="Previous month"
          onClick={() => shift(-1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[#DCE3E8] dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          aria-label="Next month"
          onClick={() => shift(1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[#DCE3E8] dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="font-bold text-sm text-[#172033] dark:text-white min-w-36">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => {
            const now = new Date();
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
          }}
          className="h-8 px-3 rounded-lg text-xs font-semibold border border-[#DCE3E8] dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Today
        </button>
        <span className="text-xs text-[#7B8798]">
          {meetings.isLoading
            ? "Loading…"
            : `${monthCount} meeting${monthCount === 1 ? "" : "s"} this month`}
        </span>
        <select
          className="ml-auto h-8 px-2 rounded-lg text-xs border border-[#DCE3E8] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300"
          value={committeeId}
          onChange={(e) => setCommitteeId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">All committees & working groups</option>
          {(committees.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {meetings.error ? <LoadState loading={false} error={meetings.error} /> : null}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-[#DCE3E8] dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="px-2 py-1.5 text-[11px] font-semibold text-[#526174] dark:text-slate-400"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = dayKey(day);
              const items = byDay.get(key) ?? [];
              const inMonth = day.getMonth() === month.getMonth();
              return (
                <div
                  key={key}
                  className={`min-h-24 border-b border-r border-slate-100 dark:border-slate-800 p-1.5 group ${
                    inMonth ? "" : "bg-slate-50/70 dark:bg-slate-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] font-semibold h-5 min-w-5 px-1 inline-flex items-center justify-center rounded-full ${
                        key === todayKey
                          ? "bg-[#168FA8] text-white"
                          : inMonth
                            ? "text-[#172033] dark:text-slate-200"
                            : "text-[#A0AAB8] dark:text-slate-600"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {canManage && (
                      <button
                        aria-label={`Schedule a meeting on ${key}`}
                        onClick={() => onCreate(day)}
                        className="opacity-0 group-hover:opacity-100 text-[#168FA8] cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 space-y-1">
                    {items.map((m) => {
                      const color = committeeColor(
                        m.committee_id !== null ? types.get(m.committee_id) : null,
                      );
                      return (
                        <button
                          key={m.id}
                          onClick={() => onOpen(m.id)}
                          title={`${m.title} · ${m.committee}`}
                          className={`w-full text-left px-1.5 py-1 rounded-md border text-[10.5px] leading-tight cursor-pointer hover:brightness-95 ${color.chip}`}
                        >
                          <span className="font-mono">{fmtTime(m.scheduled_at)}</span>{" "}
                          <span className="font-semibold">{m.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="px-6 py-3 flex flex-wrap gap-3 text-[11px] text-[#526174] dark:text-slate-400">
        {COMMITTEE_TYPES.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${committeeColor(t).dot}`} />
            {t}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}
