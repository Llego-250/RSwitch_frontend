import React, { useState } from "react";
import { Search, Filter, ShieldAlert, FileText, UserCheck, Key, ArrowUpDown } from "lucide-react";
import { Input } from "./ui/input";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorEmail: string;
  role: string;
  action: string;
  resource: string;
  ipAddress: string;
  status: "SUCCESS" | "WARNING" | "FAILED";
}

const MOCK_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: "LOG-9081",
    timestamp: "2026-08-18 11:24:02",
    actor: "Clarisse Keza",
    actorEmail: "clarisse.keza@rswitch.rw",
    role: "Technical Admin",
    action: "UPDATE_USER_ROLE",
    resource: "User: Jean Paul (Bank of Kigali)",
    ipAddress: "197.243.12.89",
    status: "SUCCESS",
  },
  {
    id: "LOG-9080",
    timestamp: "2026-08-18 10:45:19",
    actor: "System Scheduler",
    actorEmail: "system@rswitch.rw",
    role: "System Worker",
    action: "PIPELINE_EXECUTION",
    resource: "Pipeline: SWIFT Ingestion #892",
    ipAddress: "10.0.4.12",
    status: "SUCCESS",
  },
  {
    id: "LOG-9079",
    timestamp: "2026-08-18 09:12:40",
    actor: "David Mugisha",
    actorEmail: "d.mugisha@equitybank.rw",
    role: "Compliance Officer",
    action: "MFA_VERIFICATION",
    resource: "Auth Service",
    ipAddress: "197.243.55.101",
    status: "SUCCESS",
  },
  {
    id: "LOG-9078",
    timestamp: "2026-08-18 08:30:11",
    actor: "Unknown User",
    actorEmail: "external.attempt@untrusted.com",
    role: "Guest",
    action: "FAILED_LOGIN_ATTEMPT",
    resource: "/api/auth/login",
    ipAddress: "45.12.89.201",
    status: "FAILED",
  },
  {
    id: "LOG-9077",
    timestamp: "2026-08-17 17:55:00",
    actor: "Amina Umutoni",
    actorEmail: "a.umutoni@rswitch.rw",
    role: "Business Analyst",
    action: "EXPORT_COMPLIANCE_REPORT",
    resource: "Report: Q3 Financial Inclusion Summary",
    ipAddress: "197.243.12.92",
    status: "SUCCESS",
  },
];

export const AuditLogTable: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filteredLogs = MOCK_AUDIT_LOGS.filter((log) => {
    const matchesSearch =
      log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resource.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
            {filteredLogs.map((log) => (
              <tr key={log.id} className="hover:bg-neutral-50/70 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-mono text-neutral-900 font-semibold">{log.id}</div>
                  <div className="text-[11px] text-neutral-500">{log.timestamp}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900">{log.actor}</div>
                  <div className="text-[11px] text-neutral-500">{log.role}</div>
                </td>
                <td className="px-4 py-3 font-mono font-medium text-[#168FA8]">
                  {log.action}
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {log.resource}
                </td>
                <td className="px-4 py-3 font-mono text-neutral-500">
                  {log.ipAddress}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      log.status === "SUCCESS"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
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
