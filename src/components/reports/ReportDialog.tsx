// Generate a report now (REQ-RPT-001/003) or schedule it (REQ-RPT-005), with
// the report's filters (REQ-RPT-002/006) — optionally started from, or saved
// as, a named filter template. Generation is queued by the API (§17.3): the
// dialog waits for the run and downloads the file when it is ready.
import { useState } from "react";
import { CalendarClock, CheckCircle2, Download, Save } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/AppShell";
import { Field, FormError, GovModal, inputCls } from "@/components/governance/ui";
import { errorMessage, fieldErrors } from "@/lib/api";
import {
  FORMAT_LABEL,
  compactFilters,
  downloadRun,
  useCreateSchedule,
  useCreateTemplate,
  useGenerateReport,
  useReportTemplates,
  waitForRun,
  type Frequency,
  type ReportCatalog,
  type ReportFilters,
  type ReportFormat,
  type ReportRun,
} from "@/lib/reports";
import { ReportFilterFields } from "./ReportFilterFields";

export interface DialogStart {
  mode: "generate" | "schedule";
  report?: string;
  filters?: ReportFilters;
  format?: ReportFormat;
}

export function ReportDialog({
  catalog,
  start,
  onClose,
}: {
  catalog: ReportCatalog;
  start: DialogStart;
  onClose: () => void;
}) {
  const mode = start.mode;
  const choices = catalog.types.filter((t) =>
    mode === "schedule" ? t.can_schedule : t.can_generate,
  );
  const [report, setReport] = useState(
    choices.find((t) => t.key === start.report)?.key ?? choices[0]?.key ?? "",
  );
  const type = catalog.types.find((t) => t.key === report);
  const [filters, setFilters] = useState<ReportFilters>(start.filters ?? {});
  const [format, setFormat] = useState<ReportFormat>(start.format ?? "pdf");
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("Weekly");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [run, setRun] = useState<ReportRun | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [shared, setShared] = useState(false);
  const [templateSaved, setTemplateSaved] = useState<string | null>(null);

  const templates = useReportTemplates(report || undefined);
  const generate = useGenerateReport();
  const schedule = useCreateSchedule();
  const saveTemplate = useCreateTemplate();
  const errors = fieldErrors(error);

  function chooseReport(key: string) {
    setReport(key);
    setFilters({});
    setError(null);
    setRun(null);
  }

  async function submit() {
    setError(null);
    setRun(null);
    try {
      if (mode === "schedule") {
        await schedule.mutateAsync({
          report,
          format,
          frequency,
          filters: compactFilters(filters),
          name: name.trim() || undefined,
          start_date: startDate || undefined,
        });
        onClose();
        return;
      }
      const queued = await generate.mutateAsync({
        report,
        format,
        filters: compactFilters(filters),
        name: name.trim() || undefined,
      });
      setWaiting(true);
      const done = await waitForRun(queued.id);
      setRun(done);
      if (done.status === "Completed") await downloadRun(done);
    } catch (e) {
      setError(e);
    } finally {
      setWaiting(false);
    }
  }

  async function storeTemplate() {
    setError(null);
    setTemplateSaved(null);
    try {
      const t = await saveTemplate.mutateAsync({
        name: templateName.trim(),
        report,
        filters: compactFilters(filters),
        format,
        shared,
      });
      setTemplateSaved(t.name);
      setTemplateName("");
    } catch (e) {
      setError(e);
    }
  }

  const busy = generate.isPending || schedule.isPending || waiting;

  if (!type) {
    return (
      <GovModal
        title={mode === "schedule" ? "Schedule a report" : "Generate a report"}
        onClose={onClose}
      >
        <p className="text-sm text-[#526174]">
          {mode === "schedule"
            ? "Your role can't schedule reports (SRS §12.1: Compliance and Business users)."
            : "Your role can't generate any report type (SRS §14)."}
        </p>
      </GovModal>
    );
  }

  return (
    <GovModal
      wide
      title={mode === "schedule" ? "Schedule a recurring report" : "Generate a report"}
      subtitle={`${type.name} — ${type.purpose} (SRS ${type.section})`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>{run ? "Close" : "Cancel"}</SecondaryButton>
          <PrimaryButton
            onClick={submit}
            disabled={busy || !report}
            icon={
              mode === "schedule" ? (
                <CalendarClock className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )
            }
          >
            {mode === "schedule"
              ? schedule.isPending
                ? "Saving…"
                : "Create schedule"
              : waiting
                ? "Generating…"
                : generate.isPending
                  ? "Queuing…"
                  : "Generate & download"}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Report" error={errors.report}>
          <select
            value={report}
            onChange={(e) => chooseReport(e.target.value)}
            className={inputCls}
          >
            {choices.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Format" error={errors.format}>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ReportFormat)}
            className={inputCls}
          >
            {type.formats.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Name (optional)"
          hint="Defaults to the report type and its filters."
          error={errors.name}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            className={inputCls}
          />
        </Field>
        {(templates.data?.length ?? 0) > 0 && (
          <Field label="Start from a saved template">
            <select
              value=""
              onChange={(e) => {
                const t = templates.data?.find((x) => String(x.id) === e.target.value);
                if (t) {
                  setFilters(t.filters);
                  setFormat(t.format);
                }
              }}
              className={inputCls}
            >
              <option value="">Choose a template…</option>
              {templates.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.mine ? "" : ` (shared by ${t.owner_name})`}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {mode === "schedule" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Frequency" error={errors.frequency}>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className={inputCls}
            >
              {catalog.frequencies.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field
            label="First delivery (optional)"
            error={errors.start_date}
            hint={`Delivered at ${String(catalog.delivery_hour).padStart(2, "0")}:00 organisation time; default: the next one.`}
          >
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          <p className="sm:col-span-2 text-[11px] text-[#526174] dark:text-slate-400">
            Each run is kept in the report history and emailed to you with the file attached (SRS
            §13).
          </p>
        </div>
      )}

      <div className="rounded-xl border border-[#DCE3E8] dark:border-slate-800 p-4">
        <div className="text-xs font-bold text-[#172033] dark:text-white mb-3">Filters</div>
        <ReportFilterFields
          type={type}
          catalog={catalog}
          value={filters}
          onChange={setFilters}
          errors={errors}
        />
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-end gap-2">
          <Field
            label="Save these filters as a template"
            error={errors.name && saveTemplate.isError ? errors.name : undefined}
          >
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              maxLength={100}
              className={`${inputCls} w-56`}
            />
          </Field>
          <label className="inline-flex items-center gap-1.5 text-xs text-[#526174] dark:text-slate-300 h-9">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Share with everyone who can run this report
          </label>
          <SecondaryButton icon={<Save className="h-4 w-4" />} onClick={storeTemplate}>
            {saveTemplate.isPending ? "Saving…" : "Save template"}
          </SecondaryButton>
          {templateSaved && (
            <span className="text-xs text-[#12825E] inline-flex items-center gap-1 h-9">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved “{templateSaved}”
            </span>
          )}
        </div>
      </div>

      {error ? <FormError message={errorMessage(error)} /> : null}
      {run?.status === "Completed" && (
        <div className="rounded-xl border border-[#16A979]/30 bg-[#E8F7F1] dark:bg-emerald-950/40 px-3 py-2 text-xs text-[#12825E] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {run.ref} generated ({run.row_count ?? 0} records) and downloaded — it is also in the
          report history.
          <button
            className="ml-auto font-semibold underline cursor-pointer"
            onClick={() => downloadRun(run)}
          >
            Download again
          </button>
        </div>
      )}
      {run?.status === "Failed" && (
        <FormError message={run.error || "The report could not be generated."} />
      )}
      {run && (run.status === "Queued" || run.status === "Running") && (
        <p className="text-xs text-[#526174]">
          {run.ref} is still being generated — it will appear in the history when ready.
        </p>
      )}
    </GovModal>
  );
}
