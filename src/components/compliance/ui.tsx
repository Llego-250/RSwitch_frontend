// Small building blocks shared by the Compliance page's panels and dialogs.
// Modals, fields and empty/loading states reuse the governance ones so both
// modules look and behave the same.

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Download, FileWarning } from "lucide-react";
import { issueWhere } from "@/lib/integrations";
import {
  SEVERITY_STYLE,
  STATUS_STYLE,
  downloadItem,
  fmtDateTime,
  type CycleItem,
  type Severity,
} from "@/lib/compliance";

export {
  EmptyState,
  Field,
  FormError,
  GovModal as Modal,
  LoadState,
} from "@/components/governance/ui";

export function StatusPill({ status, title }: { status: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${
        STATUS_STYLE[status] ?? STATUS_STYLE.Pending
      }`}
    >
      {status}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-bold uppercase tracking-wide ${SEVERITY_STYLE[severity]}`}
    >
      {severity}
    </span>
  );
}

export const thCls =
  "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7B8798] whitespace-nowrap";
export const tdCls = "px-4 py-3 align-top text-xs text-[#172033] dark:text-slate-200";
export const selectCls =
  "h-9 px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-xs text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40";

export function DangerButton({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-10 px-4 rounded-xl text-sm font-semibold bg-[#DC3154] hover:bg-[#B91C3C] text-white shadow-xs disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
    >
      {icon}
      {children}
    </button>
  );
}

export function SmallButton({
  children,
  onClick,
  icon,
  tone = "default",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  tone?: "default" | "primary" | "danger" | "success";
  disabled?: boolean;
}) {
  const tones = {
    default:
      "bg-white dark:bg-slate-800 text-[#172033] dark:text-slate-100 border-[#DCE3E8] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700",
    primary: "bg-[#168FA8] text-white border-[#168FA8] hover:bg-[#0F6F83]",
    danger:
      "bg-white dark:bg-slate-800 text-[#DC3154] border-[#DC3154]/40 hover:bg-[#FDECEF] dark:hover:bg-red-950/40",
    success: "bg-[#16A979] text-white border-[#16A979] hover:bg-[#12825E]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-8 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap ${tones[tone]}`}
    >
      {icon}
      {children}
    </button>
  );
}

/** §20.2 row/column report of a submission (never cell values). */
export function IssueReport({
  title,
  issues,
  total,
  tone,
}: {
  title: string;
  issues: CycleItem["errors"];
  total: number;
  tone: "error" | "warning";
}) {
  if (!issues || issues.length === 0) return null;
  const colour = tone === "error" ? "text-[#DC3154]" : "text-[#B45309]";
  return (
    <div className="rounded-xl border border-[#DCE3E8] dark:border-slate-700 overflow-hidden">
      <div
        className={`px-3 py-1.5 text-[11px] font-semibold bg-slate-50 dark:bg-slate-800 ${colour}`}
      >
        {title} — {total} {total === 1 ? "issue" : "issues"}
        {total > issues.length ? ` (first ${issues.length} shown)` : ""}
      </div>
      <div className="max-h-48 overflow-y-auto">
        <table className="w-full text-[11px]">
          <tbody>
            {issues.map((i, n) => (
              <tr key={n} className="border-t border-[#EEF2F5] dark:border-slate-800">
                <td className="px-3 py-1 whitespace-nowrap text-[#526174]">{issueWhere(i)}</td>
                <td className="px-3 py-1 font-mono">{i.column}</td>
                <td className="px-3 py-1 text-[#7B8798]">{i.rule}</td>
                <td className="px-3 py-1">{i.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One file sent for a cycle: what it is, how validation and review went. */
export function ItemSummary({ item, compact }: { item: CycleItem; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasReport = (item.errors?.length ?? 0) > 0 || (item.warnings?.length ?? 0) > 0;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-[#526174]">{item.ref}</span>
        <StatusPill status={item.status} />
        <span
          className="text-xs text-[#172033] dark:text-slate-200 truncate max-w-[16rem]"
          title={item.filename}
        >
          {item.filename}
        </span>
        <button
          onClick={() => downloadItem(item)}
          className="text-[#168FA8] hover:text-[#0F6F83] cursor-pointer"
          title="Download the file as received"
          aria-label={`Download ${item.ref}`}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="text-[11px] text-[#7B8798]">
        Received {fmtDateTime(item.uploaded_at)}
        {item.uploaded_by ? ` · ${item.uploaded_by}` : ""}
        {item.automated ? " · automated pull" : ""}
        {item.kind === "submission" && item.records_received !== null
          ? ` · ${item.records_received} record(s), ${item.error_count} error(s), ${item.warning_count} warning(s)`
          : ""}
        {item.expiry_date ? ` · expires ${item.expiry_date}` : ""}
        {item.replaces_id
          ? ` · corrects ${item.kind === "document" ? "DOC" : "SUB"}-${item.replaces_id}`
          : ""}
        {item.replaced_by_id
          ? ` · corrected by ${item.kind === "document" ? "DOC" : "SUB"}-${item.replaced_by_id}`
          : ""}
      </div>
      {item.status === "Rejected" && item.rejection_reason && (
        <div className="text-[11px] text-[#C2410C]">
          Rejected by {item.reviewed_by || "Compliance"}
          {item.reviewed_at ? ` on ${fmtDateTime(item.reviewed_at)}` : ""}: {item.rejection_reason}
        </div>
      )}
      {item.status !== "Rejected" && item.reviewed_by && (
        <div className="text-[11px] text-[#526174]">
          {item.status === "Under Review" ? "Review started" : "Reviewed"} by {item.reviewed_by}
          {item.reviewed_at ? ` · ${fmtDateTime(item.reviewed_at)}` : ""}
          {item.review_note ? ` — “${item.review_note}”` : ""}
        </div>
      )}
      {hasReport && !compact && (
        <div>
          <button
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#168FA8] cursor-pointer"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <FileWarning className="h-3 w-3" /> Validation report
          </button>
          {open && (
            <div className="mt-1.5 space-y-2">
              <IssueReport
                title="Errors"
                issues={item.errors}
                total={item.error_count}
                tone="error"
              />
              <IssueReport
                title="Warnings"
                issues={item.warnings}
                total={item.warning_count}
                tone="warning"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TabButton({
  active,
  onClick,
  children,
  count,
  alert,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  alert?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-4 rounded-xl text-xs font-sans font-semibold border cursor-pointer inline-flex items-center gap-1.5 ${
        active
          ? "bg-[#168FA8] text-white border-[#168FA8]"
          : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${
            active
              ? "bg-white/25 text-white"
              : alert
                ? "bg-[#DC3154] text-white"
                : "bg-slate-200 text-[#526174] dark:bg-slate-700 dark:text-slate-200"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
