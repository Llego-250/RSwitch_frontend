// Required compliance documents per participant (REQ-COMP-001, REQ-P360-005):
// what is on file and when it expires, anything still awaiting review, and
// the register entry that tracks each type. Staff upload a document the
// institution sent on its behalf; it joins the matching register cycle and is
// reviewed like a data return (§8.4).

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileText, FolderOpen, Upload } from "lucide-react";
import { PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { api } from "@/lib/api";
import {
  dueText,
  fmtDate,
  fmtDay,
  formErrors,
  useComplianceDocuments,
  useComplianceOptions,
  useRefreshCompliance,
  useRequirements,
  type ComplianceDoc,
  type DocumentRow,
  type UploadTarget,
} from "@/lib/compliance";
import { useParticipants } from "@/lib/queries";
import { inputCls, textareaCls } from "@/components/governance/ui";
import {
  EmptyState,
  Field,
  FormError,
  LoadState,
  Modal,
  SmallButton,
  StatusPill,
  selectCls,
  tdCls,
  thCls,
} from "./ui";

const EXPIRY = ["On File", "Expiring Soon", "Expired", "Missing"] as const;

export function DocumentsPanel({
  canUpload,
  onOpen,
  onUpload,
}: {
  canUpload: boolean;
  onOpen: (requirementId: number) => void;
  onUpload: (target: UploadTarget) => void;
}) {
  const docs = useComplianceDocuments();
  const participants = useParticipants();
  const [participantId, setParticipantId] = useState<number | "">("");
  const [expiry, setExpiry] = useState("");
  const rows = useMemo(
    () =>
      (docs.data ?? []).filter(
        (r) =>
          (participantId === "" || r.participant_id === participantId) &&
          (!expiry || r.expiry_status === expiry),
      ),
    [docs.data, participantId, expiry],
  );
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of docs.data ?? []) out[r.expiry_status] = (out[r.expiry_status] ?? 0) + 1;
    return out;
  }, [docs.data]);

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[#168FA8]" /> Required documents
        </span>
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
        {EXPIRY.map((s) => (
          <button
            key={s}
            onClick={() => setExpiry(expiry === s ? "" : s)}
            className={`h-8 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
              expiry === s ? "ring-2 ring-[#168FA8]/50" : ""
            }`}
          >
            <StatusPill status={s} /> <span className="ml-1 text-[#526174]">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>
      <LoadState loading={docs.isLoading} error={docs.error} />
      {docs.data && rows.length === 0 && (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={
            docs.data.length ? "No document matches these filters" : "No required document types"
          }
        >
          {docs.data.length
            ? "Clear a filter to see more."
            : "Required document types are configured by Compliance."}
        </EmptyState>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {[
                  "Participant",
                  "Document",
                  "On file",
                  "Expiry",
                  "Register",
                  "Awaiting review",
                  "",
                ].map((h) => (
                  <th key={h} className={thCls}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <DocumentTableRow
                  key={`${r.participant_id}:${r.doc_type_id}`}
                  row={r}
                  canUpload={canUpload}
                  onOpen={onOpen}
                  onUpload={onUpload}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function DocumentTableRow({
  row,
  canUpload,
  onOpen,
  onUpload,
}: {
  row: DocumentRow;
  canUpload: boolean;
  onOpen: (requirementId: number) => void;
  onUpload: (target: UploadTarget) => void;
}) {
  const red = row.expiry_status === "Expired" || row.expiry_status === "Missing";
  return (
    <tr
      className={`border-t border-[#EEF2F5] dark:border-slate-800 ${red ? "bg-[#FDECEF]/50 dark:bg-red-950/20" : ""}`}
    >
      <td className={tdCls}>
        <div className="font-semibold">{row.participant_name}</div>
        <div className="text-[11px] text-[#7B8798]">{row.institution_type}</div>
      </td>
      <td className={tdCls}>
        {row.doc_type}
        {row.renewal_months && (
          <div className="text-[11px] text-[#7B8798]">
            renewed every {row.renewal_months} months
          </div>
        )}
      </td>
      <td className={tdCls}>
        {row.document ? (
          <DocLine doc={row.document} />
        ) : (
          <span className="text-[#7B8798]">Nothing on file</span>
        )}
      </td>
      <td className={tdCls}>
        <StatusPill status={row.expiry_status} />
        {row.expiry_date && (
          <div className="text-[11px] text-[#7B8798] mt-1">{fmtDay(row.expiry_date)}</div>
        )}
      </td>
      <td className={tdCls}>
        {row.requirement ? (
          <button onClick={() => onOpen(row.requirement!.id)} className="text-left cursor-pointer">
            <StatusPill status={row.requirement.status} />
            <div className="text-[11px] text-[#168FA8] hover:underline mt-1">
              {row.requirement.requirement_name} · due {fmtDay(row.requirement.due_date)}
            </div>
          </button>
        ) : (
          <span className="text-[11px] text-[#7B8798]">Not tracked in the register</span>
        )}
      </td>
      <td className={tdCls}>
        {row.latest_upload && row.latest_upload.review_status !== "Approved" ? (
          <div>
            <StatusPill status={row.latest_upload.review_status || "Submitted"} />
            <div className="text-[11px] text-[#7B8798] mt-1">
              {row.latest_upload.ref} · {fmtDate(row.latest_upload.uploaded_at)}
            </div>
            {row.latest_upload.rejection_reason && (
              <div className="text-[11px] text-[#C2410C] mt-0.5">
                {row.latest_upload.rejection_reason}
              </div>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-[#7B8798]">—</span>
        )}
      </td>
      <td className={`${tdCls} text-right`}>
        {canUpload && (
          <SmallButton
            icon={<Upload className="h-3.5 w-3.5" />}
            onClick={() =>
              onUpload({
                participantId: row.participant_id,
                requirementId: row.requirement?.id,
                kind: "Document",
                docTypeId: row.doc_type_id,
                replacesId:
                  row.latest_upload?.review_status === "Rejected"
                    ? row.latest_upload.id
                    : undefined,
              })
            }
          >
            Upload
          </SmallButton>
        )}
      </td>
    </tr>
  );
}

function DocLine({ doc }: { doc: ComplianceDoc }) {
  return (
    <div>
      <button
        onClick={() => api.download(`/documents/${doc.id}/download`, doc.filename)}
        className="text-[#168FA8] hover:underline cursor-pointer text-left"
      >
        {doc.filename}
      </button>
      <div className="text-[11px] text-[#7B8798]">
        {doc.ref} · {fmtDate(doc.uploaded_at)}
        {doc.uploaded_by ? ` · ${doc.uploaded_by}` : ""}
        {doc.reviewed_by ? ` · approved by ${doc.reviewed_by}` : ""}
      </div>
    </div>
  );
}

// ---- upload --------------------------------------------------------------------

const DOC_FIELDS = [
  "participant_id",
  "doc_type_id",
  "requirement_id",
  "expiry_date",
  "notes",
  "file",
  "replaces_document_id",
];

/** Upload a document an institution sent, on its behalf (REQ-INTG-007). */
export function DocumentUploadModal({
  target,
  onClose,
}: {
  target: UploadTarget;
  onClose: () => void;
}) {
  const refresh = useRefreshCompliance();
  const participants = useParticipants();
  const options = useComplianceOptions(target.participantId);
  const [participantId, setParticipantId] = useState<number>(target.participantId);
  const [docTypeId, setDocTypeId] = useState<number | "">(target.docTypeId ?? "");
  const requirements = useRequirements({ participant_id: participantId, kind: "Document" });
  const linked = (requirements.data ?? []).find((r) => r.doc_type_id === docTypeId);
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<ComplianceDoc | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("participant_id", String(participantId));
      form.append("doc_type_id", String(docTypeId));
      if (linked) form.append("requirement_id", String(linked.id));
      if (expiry) form.append("expiry_date", expiry);
      form.append("notes", notes);
      if (target.replacesId && target.kind === "Document")
        form.append("replaces_document_id", String(target.replacesId));
      form.append("file", file as File);
      return api.post<ComplianceDoc>("/documents/upload", form);
    },
    onSuccess: (doc) => {
      setDone(doc);
      refresh();
    },
    onError: (e) => {
      const { fields, message } = formErrors(e, DOC_FIELDS);
      setErrors(fields);
      setFormError(message);
    },
  });

  function submit() {
    const local: Record<string, string> = {};
    if (docTypeId === "") local.doc_type_id = "Choose the document type.";
    if (!file) local.file = "Choose the document the institution sent.";
    else if (file.size > 50 * 1024 * 1024)
      local.file = "The uploaded file exceeds the 50 MB maximum size.";
    else if (file.size === 0) local.file = "The file is empty.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length === 0) save.mutate();
  }

  return (
    <Modal
      title={target.replacesId ? "Upload corrected document" : "Upload compliance document"}
      subtitle="Uploaded by RSwitch staff on the institution's behalf."
      onClose={onClose}
      footer={
        done ? (
          <PrimaryButton onClick={onClose}>Done</PrimaryButton>
        ) : (
          <>
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={submit}
              disabled={save.isPending}
              icon={<Upload className="h-4 w-4" />}
            >
              {save.isPending ? "Uploading…" : "Upload"}
            </PrimaryButton>
          </>
        )
      }
    >
      {done ? (
        <div className="rounded-xl border border-[#16A979]/30 bg-[#E8F7F1] dark:bg-emerald-950/30 px-4 py-3 text-xs space-y-1">
          <div className="font-semibold text-[#12825E]">
            {done.ref} uploaded
            {done.review_status ? ` — status “${done.review_status}”` : " and filed"}.
          </div>
          <div className="text-[#526174] dark:text-slate-300">
            {done.requirement_id
              ? "It is now in the review queue; a Compliance user approves or rejects it."
              : "This document type isn't tracked in the register for this participant, so it was filed without review."}
          </div>
        </div>
      ) : (
        <>
          <FormError message={formError} />
          <Field label="Participant" error={errors.participant_id}>
            <select
              className={inputCls}
              value={participantId}
              disabled
              onChange={(e) => setParticipantId(Number(e.target.value))}
            >
              {(participants.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Document type"
            error={errors.doc_type_id ?? errors.requirement_id}
            hint={
              docTypeId === ""
                ? undefined
                : linked
                  ? `For “${linked.requirement_name}” (${linked.cycle?.period ?? ""} cycle, due ${fmtDay(linked.due_date)} · ${dueText(linked.days_until_due)}).`
                  : "Not tracked in this participant's register — it will be filed without review."
            }
          >
            <select
              className={inputCls}
              value={docTypeId}
              disabled={!!target.docTypeId}
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
          <Field
            label="Expiry date (optional)"
            error={errors.expiry_date}
            hint="Drives the On File / Expiring Soon / Expired status."
          >
            <input
              type="date"
              className={inputCls}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </Field>
          <Field label="File" error={errors.file ?? errors.replaces_document_id}>
            <input
              type="file"
              className="block w-full text-xs text-[#526174] file:mr-3 file:h-8 file:px-3 file:rounded-lg file:border-0 file:bg-[#E7F5F8] file:text-[#0F6F83] file:font-semibold"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
        </>
      )}
    </Modal>
  );
}
