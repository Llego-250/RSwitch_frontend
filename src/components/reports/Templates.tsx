// REQ-RPT-006 saved filter combinations: the user's own templates and those
// shared with everyone who may run the report. Applying one opens the
// generate dialog with its filters; only the owner can delete it.
import { useState } from "react";
import { Bookmark, Play, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import { EmptyState, LoadState, SmallButton, tdCls, thCls } from "@/components/compliance/ui";
import { FormError } from "@/components/governance/ui";
import { errorMessage } from "@/lib/api";
import { fmtDate } from "@/lib/governance";
import {
  useDeleteTemplate,
  useReportTemplates,
  type ReportCatalog,
  type ReportTemplate,
} from "@/lib/reports";

export function Templates({
  catalog,
  onApply,
}: {
  catalog: ReportCatalog;
  onApply: (t: ReportTemplate) => void;
}) {
  const templates = useReportTemplates();
  const remove = useDeleteTemplate();
  const [error, setError] = useState<string | null>(null);
  const name = (key: string) => catalog.types.find((t) => t.key === key)?.name ?? key;
  const label = (k: string) => catalog.filter_labels[k] ?? k;

  function describe(t: ReportTemplate): string {
    const parts = Object.entries(t.filters).map(([k, v]) => {
      if (k === "participant_id")
        return `${label(k)}: ${catalog.options.participants.find((p) => p.id === v)?.name ?? v}`;
      if (k === "committee_id")
        return `${label(k)}: ${catalog.options.committees.find((c) => c.id === v)?.name ?? v}`;
      return `${label(k)}: ${v}`;
    });
    return parts.join(" · ") || "No filters";
  }

  async function drop(t: ReportTemplate) {
    if (!window.confirm(`Delete the template "${t.name}"?`)) return;
    setError(null);
    try {
      await remove.mutateAsync(t.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <SectionCard noPad title="Saved filter templates">
      {error && (
        <div className="p-4">
          <FormError message={error} />
        </div>
      )}
      <LoadState loading={templates.isLoading} error={templates.error} />
      {templates.data && templates.data.length === 0 && (
        <EmptyState icon={<Bookmark className="h-8 w-8" />} title="No templates yet">
          Save a filter combination from the generate dialog to reuse it.
        </EmptyState>
      )}
      {templates.data && templates.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-[#DCE3E8] dark:border-slate-800">
              <tr>
                {["Template", "Report", "Filters", "Owner", ""].map((h) => (
                  <th key={h} className={thCls}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {templates.data.map((t) => (
                <tr key={t.id}>
                  <td className={tdCls}>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-[10.5px] text-[#7B8798]">
                      {t.shared ? "Shared" : "Private"} · {t.format.toUpperCase()} · saved{" "}
                      {fmtDate(t.created_at)}
                    </div>
                  </td>
                  <td className={tdCls}>{name(t.report)}</td>
                  <td className={`${tdCls} text-[#526174] dark:text-slate-400`}>{describe(t)}</td>
                  <td className={tdCls}>{t.mine ? "Me" : t.owner_name}</td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-1.5">
                      <SmallButton
                        tone="primary"
                        icon={<Play className="h-3.5 w-3.5" />}
                        onClick={() => onApply(t)}
                      >
                        Apply
                      </SmallButton>
                      {t.mine && (
                        <SmallButton
                          tone="danger"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => drop(t)}
                        >
                          Delete
                        </SmallButton>
                      )}
                    </div>
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
