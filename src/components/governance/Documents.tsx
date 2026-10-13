// Governance document repository (REQ-GOV-002/003, §10.6): every document's
// latest version with its history, upload (PDF/Word/Excel only), new
// versions, and the Internal/Restricted access level. Restricted documents the
// viewer may not open never reach this page (the API leaves them out).

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  History,
  Lock,
  Search,
  Unlock,
  Upload,
} from "lucide-react";
import { PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { api, errorMessage } from "@/lib/api";
import {
  ACCESS_LEVELS,
  ALLOWED_EXTENSIONS,
  DOC_CATEGORIES,
  checkUploadFile,
  downloadDocument,
  fieldErrors,
  fmtBytes,
  fmtDate,
  useCommittees,
  useGovDocuments,
  useMeetings,
  useRefreshGovernance,
  type AccessLevel,
  type DocCategory,
  type GovDocument,
} from "@/lib/governance";
import {
  AccessBadge,
  CommitteeChip,
  EmptyState,
  Field,
  FormError,
  GovModal,
  LoadState,
  inputCls,
  linkBtnCls,
} from "./ui";

function FileInput({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div>
      <input
        type="file"
        accept={ALLOWED_EXTENSIONS.join(",")}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-[#526174] dark:text-slate-300 file:mr-3 file:h-9 file:px-3 file:rounded-xl file:border-0 file:bg-[#E7F5F8] file:text-[#0F6F83] file:font-semibold file:cursor-pointer"
      />
      {file && (
        <div className="mt-1 text-[11px] text-[#7B8798]">
          {file.name} · {fmtBytes(file.size)}
        </div>
      )}
    </div>
  );
}

/** Upload a new governance document. With a meeting preset (minutes after a
 *  meeting, §6.3 step 2) the committee and meeting are fixed. */
export function UploadDocumentForm({
  onClose,
  preset,
}: {
  onClose: () => void;
  preset?: { committeeId: number; meetingId: number; meetingTitle: string; category?: DocCategory };
}) {
  const committees = useCommittees();
  const meetings = useMeetings();
  const refresh = useRefreshGovernance();
  const [title, setTitle] = useState(
    preset?.category === "Minutes" ? `Minutes — ${preset.meetingTitle}` : "",
  );
  const [category, setCategory] = useState<DocCategory>(preset?.category ?? "Policy");
  const [committeeId, setCommitteeId] = useState<number | "">(preset?.committeeId ?? "");
  const [meetingId, setMeetingId] = useState<number | "">(preset?.meetingId ?? "");
  const [version, setVersion] = useState("v1.0");
  const [access, setAccess] = useState<AccessLevel>("Internal");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("category", category);
      form.append("committee_id", String(committeeId));
      form.append("version", version.trim());
      form.append("access_level", access);
      if (meetingId !== "") form.append("meeting_id", String(meetingId));
      form.append("file", file as File);
      return api.post<GovDocument>("/governance/documents", form);
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
    if (!title.trim()) local.title = "Give the document a title.";
    if (committeeId === "") local.committee_id = "Choose the committee or working group.";
    if (!/^v?\d{1,3}(\.\d{1,3}){0,2}$/i.test(version.trim()))
      local.version = "Enter a version like v1.0 or v2.1.";
    const fileError = checkUploadFile(file);
    if (fileError) local.file = fileError;
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length === 0) upload.mutate();
  }

  const committeeMeetings = (meetings.data ?? []).filter((m) => m.committee_id === committeeId);
  return (
    <GovModal
      title={preset?.category === "Minutes" ? "Upload minutes" : "Upload governance document"}
      subtitle={preset ? `Linked to “${preset.meetingTitle}”` : "PDF, Word or Excel · up to 50 MB"}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            icon={<Upload className="h-4 w-4" />}
            onClick={submit}
            disabled={upload.isPending}
          >
            {upload.isPending ? "Uploading…" : "Upload"}
          </PrimaryButton>
        </>
      }
    >
      <FormError message={formError} />
      <Field label="Title" error={errors.title}>
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. National Switch Security Policy 2026"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Category" error={errors.category}>
          <select
            className={inputCls}
            value={category}
            disabled={preset?.category === "Minutes"}
            onChange={(e) => setCategory(e.target.value as DocCategory)}
          >
            {DOC_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Committee / working group" error={errors.committee_id}>
          <select
            className={inputCls}
            value={committeeId}
            disabled={!!preset}
            onChange={(e) => {
              setCommitteeId(e.target.value ? Number(e.target.value) : "");
              setMeetingId("");
            }}
          >
            <option value="">Select…</option>
            {(committees.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Version" error={errors.version}>
          <input
            className={`${inputCls} font-mono`}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </Field>
        <Field
          label="Access level"
          error={errors.access_level}
          hint={
            access === "Restricted"
              ? "Only the committee's chair and members, and Compliance, can see it."
              : "All RDIP users can see it."
          }
        >
          <select
            className={inputCls}
            value={access}
            onChange={(e) => setAccess(e.target.value as AccessLevel)}
          >
            {ACCESS_LEVELS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
      </div>
      {!preset && (
        <Field
          label="Meeting (optional)"
          error={errors.meeting_id}
          hint="Minutes linked to a meeting appear on its record."
        >
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
      )}
      <Field label="File" error={errors.file}>
        <FileInput file={file} onChange={setFile} />
      </Field>
    </GovModal>
  );
}

function suggestNextVersion(current: string): string {
  const [major, minor = "0"] = current.replace(/^v/i, "").split(".");
  return `v${major}.${Number(minor) + 1}`;
}

export function NewVersionForm({
  doc,
  onClose,
}: {
  doc: Pick<GovDocument, "id" | "title" | "version">;
  onClose: () => void;
}) {
  const refresh = useRefreshGovernance();
  const [version, setVersion] = useState(suggestNextVersion(doc.version));
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("version", version.trim());
      form.append("file", file as File);
      return api.post<GovDocument>(`/governance/documents/${doc.id}/versions`, form);
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
    const fileError = checkUploadFile(file);
    setErrors(fileError ? { file: fileError } : {});
    setFormError(null);
    if (!fileError) upload.mutate();
  }
  return (
    <GovModal
      title="Upload a new version"
      subtitle={`${doc.title} · currently ${doc.version}. Earlier versions stay available.`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            icon={<Upload className="h-4 w-4" />}
            onClick={submit}
            disabled={upload.isPending}
          >
            {upload.isPending ? "Uploading…" : "Upload version"}
          </PrimaryButton>
        </>
      }
    >
      <FormError message={formError} />
      <Field label="New version" error={errors.version}>
        <input
          className={`${inputCls} font-mono`}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />
      </Field>
      <Field label="File" error={errors.file}>
        <FileInput file={file} onChange={setFile} />
      </Field>
    </GovModal>
  );
}

function DocumentRow({
  doc,
  committeeType,
  canManage,
  onNewVersion,
  onError,
}: {
  doc: GovDocument;
  committeeType: string | undefined;
  canManage: boolean;
  onNewVersion: (d: GovDocument) => void;
  onError: (message: string) => void;
}) {
  const refresh = useRefreshGovernance();
  const [open, setOpen] = useState(false);
  const older = doc.versions ?? [];
  const toggleAccess = useMutation({
    mutationFn: () =>
      api.patch<GovDocument>(`/governance/documents/${doc.id}`, {
        access_level: doc.access_level === "Restricted" ? "Internal" : "Restricted",
      }),
    onSuccess: refresh,
    onError: (e) => onError(fieldErrors(e).message ?? errorMessage(e)),
  });
  const download = (d: GovDocument) => downloadDocument(d).catch((e) => onError(errorMessage(e)));
  return (
    <>
      <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top">
        <td className="px-4 py-3">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-[#168FA8] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-[#172033] dark:text-white">{doc.title}</div>
              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-[#7B8798]">
                <span className="font-semibold text-[#168FA8]">{doc.category}</span>
                <AccessBadge level={doc.access_level} />
                {doc.meeting_title && <span>Meeting: {doc.meeting_title}</span>}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <CommitteeChip name={doc.committee} type={committeeType} />
        </td>
        <td className="px-4 py-3">
          <div className="font-mono font-bold text-[#168FA8]">{doc.version}</div>
          {older.length > 0 && (
            <button className={`${linkBtnCls} mt-0.5 text-[11px]`} onClick={() => setOpen(!open)}>
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {older.length} earlier
            </button>
          )}
        </td>
        <td className="px-4 py-3 text-[#526174] dark:text-slate-300">
          <div>{fmtDate(doc.uploaded_at)}</div>
          <div className="text-[11px] text-[#7B8798]">{doc.uploaded_by || "Unknown uploader"}</div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button className={linkBtnCls} onClick={() => download(doc)}>
              <Download className="h-3 w-3" />
              Download
            </button>
            {canManage && (
              <>
                <button className={linkBtnCls} onClick={() => onNewVersion(doc)}>
                  <History className="h-3 w-3" />
                  New version
                </button>
                <button
                  className={linkBtnCls}
                  disabled={toggleAccess.isPending}
                  onClick={() => {
                    const next = doc.access_level === "Restricted" ? "Internal" : "Restricted";
                    if (window.confirm(`Make “${doc.title}” (all versions) ${next}?`))
                      toggleAccess.mutate();
                  }}
                >
                  {doc.access_level === "Restricted" ? (
                    <Unlock className="h-3 w-3" />
                  ) : (
                    <Lock className="h-3 w-3" />
                  )}
                  {doc.access_level === "Restricted" ? "Make internal" : "Restrict"}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {open &&
        older.map((v) => (
          <tr
            key={v.id}
            className="bg-slate-50/60 dark:bg-slate-800/30 text-[#526174] dark:text-slate-400"
          >
            <td className="pl-10 pr-4 py-2 text-[11px]">{v.filename}</td>
            <td />
            <td className="px-4 py-2 font-mono">{v.version}</td>
            <td className="px-4 py-2 text-[11px]">
              {fmtDate(v.uploaded_at)} · {v.uploaded_by || "Unknown uploader"}
            </td>
            <td className="px-4 py-2 text-right">
              <button className={linkBtnCls} onClick={() => download(v)}>
                <Download className="h-3 w-3" />
                Download
              </button>
            </td>
          </tr>
        ))}
    </>
  );
}

export function DocumentsPanel({ canManage }: { canManage: boolean }) {
  const docs = useGovDocuments();
  const committees = useCommittees();
  const [category, setCategory] = useState<"All" | DocCategory>("All");
  const [committeeId, setCommitteeId] = useState<number | "">("");
  const [access, setAccess] = useState<"" | AccessLevel>("");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [versioning, setVersioning] = useState<GovDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => docs.data ?? [], [docs.data]);
  const rows = all.filter(
    (d) =>
      (category === "All" || d.category === category) &&
      (committeeId === "" || d.committee_id === committeeId) &&
      (access === "" || d.access_level === access) &&
      (!query.trim() || d.title.toLowerCase().includes(query.trim().toLowerCase())),
  );

  return (
    <SectionCard
      title={
        <>
          <FileText className="h-5 w-5 text-[#168FA8]" /> Document repository
        </>
      }
      action={
        canManage ? (
          <PrimaryButton icon={<Upload className="h-4 w-4" />} onClick={() => setUploading(true)}>
            Upload document
          </PrimaryButton>
        ) : undefined
      }
      noPad
    >
      <div className="px-6 py-3 flex flex-wrap items-center gap-2 border-b border-[#DCE3E8] dark:border-slate-800">
        {(["All", ...DOC_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`h-7 px-3 rounded-lg text-xs font-medium border cursor-pointer ${
              category === c
                ? "bg-[#168FA8] text-white font-semibold border-[#168FA8]"
                : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
            }`}
          >
            {c}{" "}
            <span className="opacity-70">
              ({c === "All" ? all.length : all.filter((d) => d.category === c).length})
            </span>
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
        <select
          className="h-7 px-2 rounded-lg text-xs border border-[#DCE3E8] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300"
          value={access}
          onChange={(e) => setAccess(e.target.value as "" | AccessLevel)}
        >
          <option value="">Any access level</option>
          {ACCESS_LEVELS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <div className="relative ml-auto">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-[#7B8798]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles"
            className="h-7 pl-8 pr-3 rounded-lg text-xs border border-[#DCE3E8] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#172033] dark:text-white focus:outline-none"
          />
        </div>
      </div>
      {error && (
        <div className="px-6 pt-3">
          <FormError message={error} />
        </div>
      )}
      <LoadState loading={docs.isLoading} error={docs.error} />
      {docs.data && rows.length === 0 && (
        <EmptyState icon={<FileText className="h-8 w-8" />} title="No documents to show">
          {all.length === 0
            ? "No governance documents you can access have been uploaded yet."
            : "No document matches these filters."}
        </EmptyState>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-[#526174] dark:text-slate-300">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Title, category & access</th>
                <th className="px-4 py-2.5 text-left font-semibold">Committee</th>
                <th className="px-4 py-2.5 text-left font-semibold">Version</th>
                <th className="px-4 py-2.5 text-left font-semibold">Uploaded</th>
                <th className="px-4 py-2.5 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((d) => (
                <DocumentRow
                  key={d.id}
                  doc={d}
                  committeeType={committees.data?.find((c) => c.id === d.committee_id)?.type}
                  canManage={canManage}
                  onNewVersion={setVersioning}
                  onError={setError}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {uploading && <UploadDocumentForm onClose={() => setUploading(false)} />}
      {versioning && <NewVersionForm doc={versioning} onClose={() => setVersioning(null)} />}
    </SectionCard>
  );
}
