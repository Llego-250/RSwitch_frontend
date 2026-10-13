// Small building blocks shared by the Governance page's panels and dialogs.

import type { ReactNode } from "react";
import { AlertTriangle, Lock, X } from "lucide-react";
import { committeeColor, type ActionStatus } from "@/lib/governance";

export const inputCls =
  "w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-sm text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40 disabled:opacity-60";

export const textareaCls =
  "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-sm text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40";

export const linkBtnCls =
  "inline-flex items-center gap-1 text-xs font-semibold text-[#168FA8] hover:underline cursor-pointer disabled:opacity-50";

export function GovModal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE3E8] dark:border-slate-700 shadow-2xl my-8`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#DCE3E8] dark:border-slate-800">
          <div>
            <h2 className="font-bold text-base text-[#172033] dark:text-white">{title}</h2>
            {subtitle && (
              <div className="text-xs text-[#526174] dark:text-slate-400 mt-0.5">{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#DCE3E8] dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** A labelled input with its §20.2 inline error. */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[#526174] dark:text-slate-300 mb-1">
        {label}
      </span>
      {children}
      {error ? (
        <span className="block mt-1 text-xs text-[#DC3154]">{error}</span>
      ) : hint ? (
        <span className="block mt-1 text-xs text-[#7B8798]">{hint}</span>
      ) : null}
    </label>
  );
}

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#DC3154]/30 bg-[#FDECEF] dark:bg-red-950/40 px-3 py-2 text-xs text-[#DC3154]">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

const STATUS_STYLE: Record<ActionStatus, string> = {
  Open: "bg-slate-100 text-[#526174] border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  "In Progress": "bg-[#E7F5F8] text-[#168FA8] border-[#168FA8]/30 dark:bg-cyan-950/40",
  Completed: "bg-[#E8F7F1] text-[#16A979] border-[#16A979]/30 dark:bg-emerald-950/40",
  Overdue: "bg-[#FDECEF] text-[#DC3154] border-[#DC3154]/30 dark:bg-red-950/40",
};

export function ActionStatusPill({ status }: { status: ActionStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

export function AccessBadge({ level }: { level: string }) {
  if (level !== "Restricted") {
    return <span className="text-[11px] font-medium text-[#7B8798]">Internal</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF3DF] text-[#B45309] border border-[#D97706]/30 dark:bg-amber-950/40">
      <Lock className="h-3 w-3" />
      Restricted
    </span>
  );
}

export function CommitteeChip({ name, type }: { name: string; type?: string | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${committeeColor(type).chip}`}
    >
      {name}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 text-[#526174] dark:text-slate-400">
      {icon && <div className="mb-2 text-slate-300 dark:text-slate-600">{icon}</div>}
      <div className="font-semibold text-sm text-[#172033] dark:text-slate-200">{title}</div>
      {children && <div className="text-xs mt-1 max-w-sm">{children}</div>}
    </div>
  );
}

export function LoadState({ loading, error }: { loading: boolean; error: unknown }) {
  if (loading) return <div className="py-8 text-center text-xs text-[#7B8798]">Loading…</div>;
  if (error)
    return (
      <div className="p-4">
        <FormError message={error instanceof Error ? error.message : "Couldn't load this data."} />
      </div>
    );
  return null;
}
