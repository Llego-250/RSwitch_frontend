import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, CheckCheck, Mail, MailOpen, Search } from "lucide-react";
import { AppShell, SectionCard, SecondaryButton } from "@/components/AppShell";
import { api, errorMessage } from "@/lib/api";
import { useNotificationHistory, type NotificationFilters } from "@/lib/queries";
import type { NotificationRow } from "@/lib/types";

// REQ-NOTIF-004 (90-day history, read and unread) and REQ-NOTIF-005 (mark one
// or all as read).
export const Route = createFileRoute("/notifications")({
  component: NotificationHistory,
});

const SEVERITY_DOT: Record<NotificationRow["severity"], string> = {
  alert: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
};

function NotificationHistory() {
  const [status, setStatus] = useState<NonNullable<NotificationFilters["status"]>>("all");
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const filters = { status, severity, q: search.trim() };
  const history = useNotificationHistory(filters);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const rows = history.data ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const run = (p: Promise<unknown>) =>
    p.then(refresh).catch((e) => setError(errorMessage(e)));

  const markAll = () => run(api.post("/notifications/read-all"));
  const setRead = (n: NotificationRow, read: boolean) => run(api.post(`/notifications/${n.id}/${read ? "read" : "unread"}`));

  return (
    <AppShell
      title="Notifications"
      subtitle="Everything sent to you in the last 90 days, read or unread"
      breadcrumb="NOTIFICATIONS › HISTORY"
      primaryAction={
        <SecondaryButton icon={<CheckCheck className="h-4 w-4" />} onClick={markAll}>
          Mark all as read
        </SecondaryButton>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2 w-full">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            {(["all", "unread", "read"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`h-7 px-3 rounded-lg text-xs font-semibold capitalize ${
                  status === s ? "bg-white dark:bg-slate-700 text-[#168FA8] shadow-xs" : "text-slate-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <select
            aria-label="Severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <option value="">All severities</option>
            <option value="alert">Alert</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              aria-label="Search notifications"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or message…"
              className="h-9 w-full pl-8 pr-3 rounded-lg text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
            />
          </div>
        </div>
      }
    >
      {(error || history.error) && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error ?? errorMessage(history.error)}
        </div>
      )}
      <SectionCard title={<><Bell className="h-4 w-4 text-[#168FA8]" /> History</>} noPad>
        {history.isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {status === "all" && !severity && !search
              ? "You haven't received any notifications in the last 90 days."
              : "No notifications match these filters."}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 px-6 py-4 ${n.read ? "" : "bg-sky-50/60 dark:bg-slate-800/50"}`}>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${SEVERITY_DOT[n.severity] ?? "bg-sky-500"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className={`text-left text-sm ${n.read ? "font-medium" : "font-bold"} text-slate-900 dark:text-white hover:underline disabled:no-underline`}
                      disabled={!n.link}
                      onClick={() => {
                        if (!n.read) setRead(n, true);
                        if (n.link) navigate({ to: n.link });
                      }}
                    >
                      {n.title}
                    </button>
                    {n.event_label && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        {n.event_label}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{n.message}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(n.created_at + "Z").toLocaleString()}</p>
                </div>
                <button
                  onClick={() => setRead(n, !n.read)}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[#168FA8] hover:underline"
                  title={n.read ? "Mark as unread" : "Mark as read"}
                >
                  {n.read ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                  {n.read ? "Mark unread" : "Mark read"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </AppShell>
  );
}
