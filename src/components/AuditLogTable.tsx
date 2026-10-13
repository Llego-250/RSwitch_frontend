import React, { useState } from "react";
import { Search, FileText, Download } from "lucide-react";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { auditQueryString, useAuditActions, useAuditLog } from "@/lib/queries";
import { Input } from "./ui/input";

const selectClass =
  "h-9 px-3 text-xs bg-white dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 rounded-lg text-neutral-700 dark:text-slate-200 font-medium outline-none";

/** §17.2 audit trail (user, timestamp, IP, user agent). `actionPrefix` pins
 *  the view to one family of actions, e.g. "USER_*" for REQ-USR-006. Export
 *  (REQ-SET-005) covers the selected date range. */
export const AuditLogTable: React.FC<{ canExport?: boolean; actionPrefix?: string; title?: string }> = ({
  canExport = false,
  actionPrefix,
  title = "Audit log",
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [action, setAction] = useState(actionPrefix ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filters = { q: searchTerm.trim(), status: statusFilter, action, date_from: dateFrom, date_to: dateTo };
  const logs = useAuditLog(filters);
  const actions = useAuditActions();
  const rows = logs.data ?? [];
  const rangeError = dateFrom && dateTo && dateFrom > dateTo ? "The end date must be on or after the start date." : null;
  const serverFields = fieldErrors(logs.error);

  const exportCsv = async () => {
    setError(null);
    if (rangeError) return;
    setExporting(true);
    try {
      await api.download(
        `/audit-log/export?${auditQueryString({ date_from: dateFrom, date_to: dateTo, action: actionPrefix })}`,
        "rdip_audit_log.csv",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-neutral-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-neutral-200 dark:border-slate-800 space-y-3 bg-neutral-50/50 dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#168FA8]" />
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{title}</h3>
            {!logs.isLoading && (
              <span className="text-[11px] text-neutral-500">
                {rows.length === 500 ? "latest 500 matching events" : `${rows.length} event${rows.length === 1 ? "" : "s"}`}
              </span>
            )}
          </div>
          {canExport && (
            <button
              onClick={exportCsv}
              disabled={exporting || !!rangeError}
              title="Exports every event in the selected date range (all of them when no range is set)"
              className="h-9 px-3 text-xs rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-[#168FA8] hover:bg-[#E7F5F8] disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Export CSV for date range"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <Input
              type="search"
              aria-label="Search audit log"
              placeholder="Search actor, action, resource or IP…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          {!actionPrefix && (
            <select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)} className={selectClass}>
              <option value="">All actions</option>
              {(actions.data ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
          <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="">All statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="WARNING">Warning</option>
            <option value="FAILED">Failed</option>
          </select>
          <label className="text-[11px] font-semibold text-neutral-500">
            From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${selectClass} ml-1.5`} />
          </label>
          <label className="text-[11px] font-semibold text-neutral-500">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-invalid={!!(rangeError || serverFields.date_to)}
              className={`${selectClass} ml-1.5 ${rangeError ? "border-rose-400" : ""}`}
            />
          </label>
        </div>
        {(rangeError || serverFields.date_to) && (
          <p className="text-xs font-medium text-rose-600">{rangeError ?? serverFields.date_to}</p>
        )}
      </div>

      {(error || (logs.error && !serverFields.date_to)) && (
        <div className="px-4 py-2 text-xs text-rose-600">{error ?? errorMessage(logs.error)}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-100/70 dark:bg-slate-800 border-b border-neutral-200 dark:border-slate-700 text-neutral-600 dark:text-slate-300 uppercase font-mono text-[10px]">
            <tr>
              <th className="px-4 py-3 font-semibold">Time (local)</th>
              <th className="px-4 py-3 font-semibold">User / Role</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Resource</th>
              <th className="px-4 py-3 font-semibold">IP / User agent</th>
              <th className="px-4 py-3 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-slate-800">
            {logs.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            )}
            {!logs.isLoading && !logs.error && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  No audit events match these filters.
                </td>
              </tr>
            )}
            {rows.map((log) => (
              <tr key={log.id} className="hover:bg-neutral-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="font-mono text-neutral-900 dark:text-white font-semibold">#{log.id}</div>
                  <div className="text-[11px] text-neutral-500">{new Date(log.timestamp + "Z").toLocaleString()}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900 dark:text-white">{log.actor_name}</div>
                  <div className="text-[11px] text-neutral-500">
                    {log.actor_email} · {log.actor_role}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono font-medium text-[#168FA8]">{log.action}</td>
                <td className="px-4 py-3 text-neutral-700 dark:text-slate-300 max-w-xs break-words">{log.resource}</td>
                <td className="px-4 py-3">
                  <div className="font-mono text-neutral-600 dark:text-slate-300">{log.ip_address || "—"}</div>
                  <div className="text-[10px] text-neutral-400 max-w-[220px] truncate" title={log.user_agent}>
                    {log.user_agent || "—"}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      log.status === "SUCCESS"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : log.status === "WARNING"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {log.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
