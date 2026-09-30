import React, { useState } from "react";
import { Search, FileText, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import type { AuditEvent } from "@/lib/types";
import { Input } from "./ui/input";

export const AuditLogTable: React.FC<{ canExport?: boolean }> = ({ canExport = false }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [error, setError] = useState<string | null>(null);

  const logs = useQuery({
    queryKey: ["audit", searchTerm, statusFilter],
    queryFn: () => {
      const q = new URLSearchParams({ limit: "500" });
      if (searchTerm.trim()) q.set("q", searchTerm.trim());
      if (statusFilter !== "ALL") q.set("status", statusFilter);
      return api.get<AuditEvent[]>(`/audit?${q}`);
    },
  });
  const filteredLogs = logs.data ?? [];

  const exportCsv = () =>
    api.download(`/audit/export${searchTerm.trim() ? `?q=${encodeURIComponent(searchTerm.trim())}` : ""}`, "audit_log.csv")
      .catch((e) => setError(errorMessage(e)));

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 bg-neutral-50/50">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-[#168FA8]" />
          <h3 className="text-sm font-bold text-neutral-900">Security & Administrative Audit Logs</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <Input
              type="text"
              placeholder="Search logs by actor or action..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          {canExport && (
            <button
              onClick={exportCsv}
              className="h-9 px-3 text-xs rounded-lg border border-neutral-200 bg-white font-semibold text-[#168FA8] hover:bg-[#E7F5F8] inline-flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          )}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-700 font-medium outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="WARNING">Warning</option>
          </select>
        </div>
      </div>

      {(error || logs.error) && <div className="px-4 py-2 text-xs text-rose-600">{error ?? errorMessage(logs.error)}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-100/70 border-b border-neutral-200 text-neutral-600 uppercase font-mono text-[10px]">
            <tr>
              <th className="px-4 py-3 font-semibold">Log ID / Time</th>
              <th className="px-4 py-3 font-semibold">Actor / Role</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Resource</th>
              <th className="px-4 py-3 font-semibold">IP Address</th>
              <th className="px-4 py-3 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {logs.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">Loading…</td></tr>
            )}
            {!logs.isLoading && filteredLogs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">No audit events match.</td></tr>
            )}
            {filteredLogs.map((log) => (
              <tr key={log.id} className="hover:bg-neutral-50/70 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-mono text-neutral-900 font-semibold">EVT-{log.id}</div>
                  <div className="text-[11px] text-neutral-500">{new Date(log.timestamp + "Z").toLocaleString()}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900">{log.actor_name}</div>
                  <div className="text-[11px] text-neutral-500">{log.actor_email} · {log.actor_role}</div>
                </td>
                <td className="px-4 py-3 font-mono font-medium text-[#168FA8]">
                  {log.action}
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {log.resource}
                </td>
                <td className="px-4 py-3 font-mono text-neutral-500">
                  {log.ip_address || "—"}
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
