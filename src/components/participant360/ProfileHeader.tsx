// REQ-P360-002: institution name, type, registration date, assigned contact
// and current overall status (the registered §10.1 status plus what needs
// attention, each with its reason).
import { AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { SectionCard } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDay } from "@/lib/compliance";
import type { ParticipantProfile } from "@/lib/participant360";
import { Field, RiskBadge } from "./ui";

const STATUS_BADGE = { Active: "active", Inactive: "paused", Suspended: "failed" } as const;

export function ProfileHeader({ profile }: { profile: ParticipantProfile }) {
  const { overall, risk } = profile;
  const attention = overall.health === "Attention needed";
  return (
    <SectionCard noPad>
      <div className="p-5 sm:p-6 flex flex-wrap items-start justify-between gap-4 border-b border-[#DCE3E8] dark:border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-12 w-12 shrink-0 rounded-xl bg-[#168FA8] text-white font-bold text-lg flex items-center justify-center">
            {(profile.short_name || profile.code).charAt(0)}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#172033] dark:text-white truncate">
              {profile.name}
            </h1>
            <p className="text-xs text-[#526174] dark:text-slate-400 mt-0.5">
              <span className="font-mono">{profile.code}</span> · ID {profile.id} ·{" "}
              {profile.type || "Type not set"}
              {profile.region ? ` · ${profile.region}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={STATUS_BADGE[overall.status] ?? "draft"}>
            {overall.status}
          </StatusBadge>
          <RiskBadge composite={risk?.composite} band={risk?.band} />
        </div>
      </div>
      <dl className="p-5 sm:p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Institution type">{profile.type || "—"}</Field>
        <Field label="Registration date">
          {profile.registration_date ? fmtDay(profile.registration_date) : "—"}
        </Field>
        <Field label="Assigned contact">
          {profile.assigned_contact.name || "—"}
          {profile.assigned_contact.email && (
            <a
              href={`mailto:${profile.assigned_contact.email}`}
              className="flex items-center gap-1 text-[11px] text-[#168FA8] hover:underline break-all"
            >
              <Mail className="h-3 w-3 shrink-0" /> {profile.assigned_contact.email}
            </a>
          )}
        </Field>
        <Field label="Reporting frequency">every {profile.expected_frequency_days} day(s)</Field>
      </dl>
      <div
        className={`px-5 sm:px-6 py-3 border-t text-xs flex items-start gap-2 ${
          attention
            ? "bg-[#FFF8EC] border-[#F5D9A8] text-[#7A4B00] dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200"
            : "bg-[#F1FAF6] border-[#CBEBDD] text-[#0E7A57] dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300"
        }`}
      >
        {attention ? (
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        )}
        <div>
          <span className="font-semibold">
            Overall status: {overall.status} — {overall.health}.
          </span>
          {attention && <span> {overall.attention.join(" · ")}.</span>}
        </div>
      </div>
    </SectionCard>
  );
}
