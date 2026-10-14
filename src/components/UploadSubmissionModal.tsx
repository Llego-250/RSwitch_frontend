// Manual Data Upload (SRS §8.2, §6.1 steps 2-4a, §6.4): Compliance or
// Technical/Admin staff upload a file a participant sent offline. Reused by
// the Integrations and Compliance pages.

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Upload, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/AppShell";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api";
import {
  checkFile,
  issueWhere,
  uploadSubmission,
  useUploadRequirements,
  type UploadResult,
} from "@/lib/integrations";
import { useIntegrations, useParticipants, useTemplateColumns } from "@/lib/queries";

type PeriodKind = "month" | "quarter" | "year" | "day";

const KIND_BY_FREQUENCY: Record<string, PeriodKind> = {
  Monthly: "month",
  Quarterly: "quarter",
  Annual: "year",
  "Ad hoc": "day",
};

const inputCls =
  "w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border text-slate-900 dark:text-white focus:outline-none text-xs";
const borderCls = (bad?: string) =>
  bad ? "border-red-400" : "border-slate-200 dark:border-slate-700";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-[11px] font-medium text-red-600">{message}</p> : null;
}

export interface UploadSubmissionModalProps {
  open: boolean;
  onClose: () => void;
  /** Fix the participant (otherwise the user picks one). */
  participantId?: number;
  /** Fix the Manual Upload data source. */
  integrationId?: number;
  /** Preselect a Compliance Register data-return requirement. */
  requirementId?: number;
  /** Upload a corrected file for this failed or rejected submission (§6.4). */
  replacesSubmissionId?: number;
  onUploaded?: (result: UploadResult) => void;
}

export function UploadSubmissionModal(props: UploadSubmissionModalProps) {
  if (!props.open) return null;
  return <UploadForm {...props} />;
}

function UploadForm({
  onClose,
  participantId: fixedParticipant,
  integrationId: fixedIntegration,
  requirementId: initialRequirement,
  replacesSubmissionId: initialReplaces,
  onUploaded,
}: UploadSubmissionModalProps) {
  const queryClient = useQueryClient();
  const participants = useParticipants();
  const [participantId, setParticipantId] = useState<number | undefined>(fixedParticipant);
  const sources = useIntegrations(participantId);
  const requirements = useUploadRequirements(participantId);

  const manualSources = useMemo(
    () => (sources.data ?? []).filter((s) => s.integration_mode === "Manual" && !s.paused),
    [sources.data],
  );
  const [integrationId, setIntegrationId] = useState<number | undefined>(fixedIntegration);
  const [requirementId, setRequirementId] = useState<number | "">(initialRequirement ?? "");
  const [replaces, setReplaces] = useState<number | undefined>(initialReplaces);
  const [kind, setKind] = useState<PeriodKind>("month");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [quarter, setQuarter] = useState(() => Math.floor(new Date().getMonth() / 3) + 1);
  const [file, setFile] = useState<File | null>(null);
  const [fileTouched, setFileTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [busy, setBusy] = useState(false);

  // Default to the participant's first manual data source.
  useEffect(() => {
    if (fixedIntegration) return;
    if (!manualSources.some((s) => s.id === integrationId)) setIntegrationId(manualSources[0]?.id);
  }, [manualSources, integrationId, fixedIntegration]);

  const requirement = requirements.data?.find((r) => r.id === requirementId);
  useEffect(() => {
    if (requirement) setKind(KIND_BY_FREQUENCY[requirement.frequency] ?? "month");
  }, [requirement]);

  const source = manualSources.find((s) => s.id === integrationId);
  const schemaId = requirement?.template_id ?? source?.template_id ?? undefined;
  const columns = useTemplateColumns(schemaId ?? undefined);

  const period =
    kind === "month"
      ? month
      : kind === "day"
        ? day
        : kind === "year"
          ? String(year)
          : `${year}-Q${quarter}`;
  const fileProblem = fileTouched ? checkFile(file) : null;

  async function submit() {
    setFileTouched(true);
    const localFileProblem = checkFile(file);
    const local: Record<string, string> = {};
    if (!participantId) local.participant_id = "Choose a participant.";
    if (!integrationId) local.integration_id = "This participant has no Manual Upload data source.";
    if (localFileProblem) local.file = localFileProblem;
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length || !participantId || !file) return;
    setBusy(true);
    try {
      const res = await uploadSubmission({
        participantId,
        period,
        file,
        requirementId: requirementId || null,
        integrationId,
        replacesSubmissionId: replaces,
      });
      setResult(res);
      onUploaded?.(res);
      for (const key of [
        "integrations",
        "submissions",
        "pipeline-jobs",
        "pipeline-summary",
        "submission-requirements",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 413) {
        setErrors({ file: e.message });
      } else {
        const inline = fieldErrors(e);
        setErrors(inline);
        if (!Object.keys(inline).length) setFormError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function uploadCorrection(failedId: number | undefined) {
    setReplaces(failedId);
    setResult(null);
    setFile(null);
    setFileTouched(false);
  }

  const participantName = participants.data?.find((p) => p.id === participantId)?.name;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-bold text-base text-slate-900 dark:text-white">
              Upload data file on behalf of a participant
            </h2>
            <p className="text-xs text-slate-500">
              CSV (UTF-8), XLSX or XML, up to 50 MB. The file is validated against the expected
              schema; a file that fails is recorded with its error report and nothing is loaded.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {result?.ok ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> SUB-{result.submission.id} accepted — status “
              {result.submission.status}”
            </div>
            <p className="text-slate-700 dark:text-slate-200">
              {result.submission.records_received.toLocaleString()} record(s) passed schema
              validation
              {result.submission.warning_count
                ? ` with ${result.submission.warning_count} warning(s)`
                : ""}
              {result.submission.replaces_submission_id
                ? ` · corrects SUB-${result.submission.replaces_submission_id}`
                : ""}
              . Pipeline job JOB-{result.job.id} is {result.job.status.toLowerCase()} to load it.
            </p>
            <Link to="/pipelines" className="font-semibold text-[#168FA8] hover:underline">
              Follow it in the Pipeline Monitor →
            </Link>
          </div>
        ) : result && !result.ok ? (
          <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-xs">
              <AlertTriangle className="h-4 w-4" />
              {result.message}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              {result.submission
                ? `Recorded as SUB-${result.submission.id} with status “Validation Failed”. `
                : ""}
              Nothing was loaded — no partial ingestion. Ask the institution for a corrected file
              and upload it below; it will be linked to this attempt, which stays in the history.
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-red-200 dark:border-red-900/40 bg-white dark:bg-slate-900">
              <table className="w-full text-[11px]">
                <thead className="bg-red-100/60 dark:bg-red-950/60 text-left">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Row</th>
                    <th className="px-2 py-1.5 font-semibold">Column</th>
                    <th className="px-2 py-1.5 font-semibold">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100 dark:divide-red-900/30 font-mono">
                  {result.errors.map((issue, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 text-red-700 dark:text-red-300 whitespace-nowrap">
                        {issueWhere(issue)}
                      </td>
                      <td className="px-2 py-1">{issue.column}</td>
                      <td className="px-2 py-1 font-sans">{issue.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.submission && result.submission.error_count > result.errors.length && (
              <p className="text-[11px] text-slate-500">
                Showing {result.errors.length} of {result.submission.error_count} errors.
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              Row numbers count data rows; the header row is not counted.
            </p>
            <SecondaryButton onClick={() => uploadCorrection(result.submission?.id)}>
              Upload corrected file
            </SecondaryButton>
          </div>
        ) : null}

        {!result && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {replaces && (
              <div className="sm:col-span-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
                Correction of SUB-{replaces} — the earlier attempt stays in the history (§6.4).
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Participant
              </label>
              {fixedParticipant ? (
                <div className="h-9 px-3 flex items-center rounded-xl bg-slate-50 dark:bg-slate-800 font-semibold">
                  {participantName ?? `Participant #${fixedParticipant}`}
                </div>
              ) : (
                <select
                  value={participantId ?? ""}
                  onChange={(e) => {
                    setParticipantId(e.target.value ? Number(e.target.value) : undefined);
                    setRequirementId("");
                    setIntegrationId(undefined);
                  }}
                  className={`${inputCls} ${borderCls(errors.participant_id)}`}
                >
                  <option value="">Select participant…</option>
                  {participants.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              )}
              <FieldError message={errors.participant_id} />
            </div>

            {participantId && (
              <>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Data source
                  </label>
                  {sources.isLoading ? (
                    <div className="text-slate-400 h-9 flex items-center">Loading…</div>
                  ) : manualSources.length === 0 ? (
                    <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
                      No Manual Upload data source for this participant. A Technical/Admin user can
                      add one under Integrations.
                    </p>
                  ) : (
                    <select
                      value={integrationId ?? ""}
                      disabled={!!fixedIntegration}
                      onChange={(e) => setIntegrationId(Number(e.target.value))}
                      className={`${inputCls} ${borderCls(errors.integration_id)}`}
                    >
                      {manualSources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.source_name}
                        </option>
                      ))}
                    </select>
                  )}
                  <FieldError message={errors.integration_id} />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Requirement type
                  </label>
                  <select
                    value={requirementId}
                    onChange={(e) => setRequirementId(e.target.value ? Number(e.target.value) : "")}
                    className={`${inputCls} ${borderCls(errors.requirement_id)}`}
                  >
                    <option value="">
                      {requirements.data?.length
                        ? "Select requirement…"
                        : "No data-return requirements registered"}
                    </option>
                    {requirements.data?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.requirement_name} · {r.frequency} · due {r.due_date}
                      </option>
                    ))}
                  </select>
                  {!requirements.isLoading && !requirements.data?.length && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      The Compliance Register has no data-return requirement for this participant;
                      the file is checked against the data source’s expected schema.
                    </p>
                  )}
                  <FieldError message={errors.requirement_id} />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Reporting period
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as PeriodKind)}
                      className={`${inputCls} ${borderCls()} w-28`}
                    >
                      <option value="month">Month</option>
                      <option value="quarter">Quarter</option>
                      <option value="year">Year</option>
                      <option value="day">Day</option>
                    </select>
                    {kind === "month" && (
                      <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className={`${inputCls} ${borderCls(errors.period)}`}
                      />
                    )}
                    {kind === "day" && (
                      <input
                        type="date"
                        value={day}
                        onChange={(e) => setDay(e.target.value)}
                        className={`${inputCls} ${borderCls(errors.period)}`}
                      />
                    )}
                    {(kind === "year" || kind === "quarter") && (
                      <input
                        type="number"
                        min={2000}
                        max={2100}
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className={`${inputCls} ${borderCls(errors.period)} w-24`}
                      />
                    )}
                    {kind === "quarter" && (
                      <select
                        value={quarter}
                        onChange={(e) => setQuarter(Number(e.target.value))}
                        className={`${inputCls} ${borderCls()} w-20`}
                      >
                        {[1, 2, 3, 4].map((q) => (
                          <option key={q} value={q}>
                            Q{q}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <FieldError message={errors.period} />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Expected schema
                  </label>
                  <div className="min-h-9 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-[11px] text-slate-600 dark:text-slate-300">
                    {!schemaId
                      ? "No expected schema configured — the upload will be refused."
                      : columns.isLoading
                        ? "Loading…"
                        : (columns.data ?? [])
                            .map((c) => `${c.name}${c.required ? "*" : ""}`)
                            .join(", ") || "No columns defined"}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">* required column</p>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    File
                  </label>
                  <label
                    className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-xl p-5 text-center cursor-pointer bg-slate-50 dark:bg-slate-800/40 ${
                      errors.file || fileProblem
                        ? "border-red-300"
                        : "border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    <Upload className="h-7 w-7 text-slate-400" />
                    <span className="text-xs font-semibold text-[#168FA8]">
                      {file
                        ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB`
                        : "Choose the file the institution sent"}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      CSV (UTF-8), XLSX or XML · max 50 MB
                    </span>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xml"
                      className="hidden"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        setFileTouched(true);
                        setErrors((prev) => ({ ...prev, file: "" }));
                      }}
                    />
                  </label>
                  <FieldError message={errors.file || fileProblem || undefined} />
                </div>
              </>
            )}
            {formError && <p className="sm:col-span-2 text-red-600 font-medium">{formError}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <SecondaryButton onClick={onClose}>{result ? "Close" : "Cancel"}</SecondaryButton>
          {!result && (
            <PrimaryButton
              onClick={submit}
              disabled={busy || !participantId || manualSources.length === 0}
            >
              {busy ? "Validating…" : "Validate & upload"}
            </PrimaryButton>
          )}
          {result?.ok && (
            <PrimaryButton onClick={() => uploadCorrection(undefined)}>
              Upload another file
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}
