// REQ-RPT-001: the six report types with their §14 purpose and columns, and
// what the signed-in role may do with each (§14 per-report permissions, as
// the API reports them).
import { CalendarClock, Download, Eye, Lock } from "lucide-react";
import type { ReportCatalog, ReportType } from "@/lib/reports";

function Access({ type }: { type: ReportType }) {
  if (type.can_generate)
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#12825E]">
        <Download className="h-3 w-3" /> You can generate
      </span>
    );
  if (type.can_view)
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#526174] dark:text-slate-300">
        <Eye className="h-3 w-3" /> View generated reports
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#7B8798]">
      <Lock className="h-3 w-3" /> Not available to your role
    </span>
  );
}

export function Catalog({
  catalog,
  onGenerate,
  onSchedule,
}: {
  catalog: ReportCatalog;
  onGenerate: (key: string) => void;
  onSchedule: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {catalog.types.map((t) => (
        <div
          key={t.key}
          className={`rounded-2xl border p-4 flex flex-col gap-2 bg-white dark:bg-slate-900 ${
            t.can_view
              ? "border-[#DCE3E8] dark:border-slate-800"
              : "border-dashed border-slate-300 dark:border-slate-700 opacity-75"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-[#172033] dark:text-white">{t.name}</h3>
              <span className="text-[10.5px] font-mono text-[#7B8798]">SRS {t.section}</span>
            </div>
            <Access type={t} />
          </div>
          <p className="text-xs text-[#526174] dark:text-slate-400">{t.purpose}</p>
          <p className="text-[11px] text-[#7B8798] leading-snug">
            <span className="font-semibold">Columns:</span> {t.columns.join(", ")}
          </p>
          <p className="text-[11px] text-[#7B8798]">
            Generate: {t.generate_roles.join(", ")}
            {t.view_roles.length ? ` · View: ${t.view_roles.join(", ")}` : ""}
          </p>
          {(t.can_generate || t.can_schedule) && (
            <div className="mt-auto pt-2 flex items-center gap-3">
              {t.can_generate && (
                <button
                  onClick={() => onGenerate(t.key)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" /> Generate
                </button>
              )}
              {t.can_schedule && (
                <button
                  onClick={() => onSchedule(t.key)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer"
                >
                  <CalendarClock className="h-3.5 w-3.5" /> Schedule
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
