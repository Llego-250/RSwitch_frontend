// REQ-P360-004: every data submission, newest first, with its status,
// record and error counts. §8.1 exception: none yet → "No data submitted
// yet" with the expected due date.
import { FileText } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDay } from "@/lib/compliance";
import { SUBMISSION_BADGE, formatDateTime } from "@/lib/integrations";
import { NO_DATA_MESSAGE, type ParticipantProfile } from "@/lib/participant360";
import { useParticipantSubmissions } from "@/lib/queries";
import { Empty, LoadError } from "./ui";

export function SubmissionHistoryCard({ profile }: { profile: ParticipantProfile }) {
  const submissions = useParticipantSubmissions(profile.id);
  const summary = profile.submissions;
  const rows = submissions.data ?? [];
  return (
    <SectionCard
      title={
        <>
          <FileText className="h-5 w-5 text-[#168FA8]" /> Data submission history
        </>
      }
      noPad
    >
      {summary.no_data ? (
        <div className="p-6">
          <div className="rounded-xl border border-dashed border-[#DCE3E8] dark:border-slate-700 p-4 text-center">
            <div className="font-semibold text-sm text-[#172033] dark:text-white">
              {summary.message ?? NO_DATA_MESSAGE}
            </div>
            <p className="text-xs text-[#526174] dark:text-slate-400 mt-1">
              {summary.expected_due
                ? `Expected by ${fmtDay(summary.expected_due.date)} — ${summary.expected_due.basis}.`
                : "No expected due date is configured for this institution."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="px-6 py-3 text-[11px] text-[#526174] dark:text-slate-400 border-b border-[#DCE3E8] dark:border-slate-800">
            {summary.total} transfer(s), newest first: {summary.passed} passed,{" "}
            {summary.failed_validation} failed validation ·{" "}
            {summary.records_received.toLocaleString()} records · first{" "}
            {formatDateTime(summary.first_submission_at)}
            {summary.expected_due && ` · next expected ${fmtDay(summary.expected_due.date)}`}
          </div>
          {submissions.error ? (
            <div className="p-4">
              <LoadError error={submissions.error} />
            </div>
          ) : submissions.isLoading ? (
            <div className="p-4">
              <Empty>Loading…</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 text-[10px] uppercase tracking-wide text-[#7B8798]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Received</th>
                    <th className="px-3 py-2 text-left font-semibold">Ref</th>
                    <th className="px-3 py-2 text-left font-semibold">Period · source</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Records</th>
                    <th className="px-4 py-2 text-right font-semibold">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F5] dark:divide-slate-800">
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatDateTime(s.uploaded_at)}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold">SUB-{s.id}</td>
                      <td className="px-3 py-2">
                        <div className="text-[#172033] dark:text-slate-100">{s.period}</div>
                        <div className="text-[11px] text-[#7B8798]">
                          {s.source_name ?? "—"}
                          {s.requirement_name ? ` · ${s.requirement_name}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={SUBMISSION_BADGE[s.status] ?? "draft"}>
                          {s.status}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {s.records_received.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {s.error_count}
                        {s.warning_count ? (
                          <span className="text-[#7B8798]"> +{s.warning_count}w</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
