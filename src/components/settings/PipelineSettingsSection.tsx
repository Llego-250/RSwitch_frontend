// Pipeline log retention (REQ-PIPE-009) and the overdue grace period behind
// integration Warning/Failed (REQ-INTG-010, §9.1). Owned by the pipelines
// module. Rendered inside the Settings page; editable only with "settings.manage".
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { PrimaryButton, SectionCard } from "@/components/AppShell";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { usePipelineSettings, type PipelineSettings } from "@/lib/pipelines";

const MIN_RETENTION_DAYS = 90;
const inputCls =
  "w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border text-sm text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40 disabled:opacity-70";

export function PipelineSettingsSection({ canEdit }: { canEdit: boolean }) {
  const settings = usePipelineSettings();
  const [form, setForm] = useState<PipelineSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (value: PipelineSettings) =>
      api.put<PipelineSettings>("/pipelines/settings", value),
    onSuccess: (value) => {
      queryClient.setQueryData(["pipeline-settings"], value);
      queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
      setErrors({});
      setSaved(true);
    },
    onError: (e) => {
      const inline = fieldErrors(e);
      setErrors(Object.keys(inline).length ? inline : { _: errorMessage(e) });
    },
  });

  function submit() {
    if (!form) return;
    if (form.log_retention_days < MIN_RETENTION_DAYS) {
      setErrors({
        log_retention_days: "Pipeline logs must be kept for at least 90 days (REQ-PIPE-009)",
      });
      return;
    }
    save.mutate(form);
  }

  const set = (patch: Partial<PipelineSettings>) => {
    setSaved(false);
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  return (
    <SectionCard title="Pipelines">
      {settings.isLoading && <p className="text-xs text-slate-400">Loading…</p>}
      {settings.error && <p className="text-xs text-red-600">{errorMessage(settings.error)}</p>}
      {form && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Execution log retention (days)
              </label>
              <input
                type="number"
                min={MIN_RETENTION_DAYS}
                value={form.log_retention_days}
                disabled={!canEdit}
                onChange={(e) => set({ log_retention_days: Number(e.target.value) })}
                className={`${inputCls} ${errors.log_retention_days ? "border-red-400" : "border-[#DCE3E8] dark:border-slate-700"}`}
              />
              {errors.log_retention_days ? (
                <p className="mt-1 text-[11px] text-red-600">{errors.log_retention_days}</p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">
                  Minimum 90 days. Finished jobs and their logs older than this are purged.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Overdue grace period (days)
              </label>
              <input
                type="number"
                min={0}
                max={30}
                value={form.overdue_grace_days}
                disabled={!canEdit}
                onChange={(e) => set({ overdue_grace_days: Number(e.target.value) })}
                className={`${inputCls} ${errors.overdue_grace_days ? "border-red-400" : "border-[#DCE3E8] dark:border-slate-700"}`}
              />
              {errors.overdue_grace_days ? (
                <p className="mt-1 text-[11px] text-red-600">{errors.overdue_grace_days}</p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">
                  A late data source shows Warning within this period, then Failed, and the
                  Technical team is notified.
                </p>
              )}
            </div>
          </div>
          {errors._ && <p className="text-xs text-red-600">{errors._}</p>}
          {canEdit && (
            <div className="flex items-center justify-end gap-3">
              {saved && <span className="text-xs text-emerald-600 font-semibold">Saved</span>}
              <PrimaryButton
                icon={<Save className="h-4 w-4" />}
                onClick={submit}
                disabled={save.isPending}
              >
                {save.isPending ? "Saving…" : "Save pipeline settings"}
              </PrimaryButton>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
