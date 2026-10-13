import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarPlus, Upload } from "lucide-react";
import { AppShell, PrimaryButton, SecondaryButton } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { hasCap } from "@/lib/roles";
import { ActionItemsPanel } from "@/components/governance/ActionItems";
import { CommitteesPanel } from "@/components/governance/Committees";
import { DocumentsPanel, UploadDocumentForm } from "@/components/governance/Documents";
import {
  MeetingCalendar,
  MeetingDetail,
  MeetingForm,
  UpcomingMeetings,
} from "@/components/governance/Meetings";
import { OverviewPanel } from "@/components/governance/Overview";
import { SectionCard } from "@/components/AppShell";

export const Route = createFileRoute("/governance")({
  component: Governance,
});

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "calendar", label: "Meeting Calendar" },
  { id: "documents", label: "Documents" },
  { id: "actions", label: "Action Items" },
  { id: "committees", label: "Committees & Membership" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// SRS §5.7. Compliance manages governance records; Business and
// Technical/Admin users view them (REQ-GOV-011). The API enforces this; the
// page only hides controls a viewer can't use.
function Governance() {
  const { role } = useRole();
  const { user } = useAuth();
  const canManage = hasCap(role, "governance.manage");

  const [tab, setTab] = useState<Tab>("overview");
  const [openMeeting, setOpenMeeting] = useState<number | null>(null);
  const [scheduling, setScheduling] = useState<{ day?: Date } | null>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <AppShell
      title="Governance Center"
      subtitle="Board, committees & working groups"
      breadcrumb="GOVERN › GOVERNANCE"
      scope="Board & Working Groups"
      primaryAction={
        canManage ? (
          <div className="flex items-center gap-2">
            <SecondaryButton
              icon={<CalendarPlus className="h-4 w-4" />}
              onClick={() => setScheduling({})}
            >
              Schedule meeting
            </SecondaryButton>
            <PrimaryButton icon={<Upload className="h-4 w-4" />} onClick={() => setUploading(true)}>
              Upload document
            </PrimaryButton>
          </div>
        ) : undefined
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2 w-full">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`h-8 px-4 rounded-xl text-xs font-sans font-semibold border cursor-pointer ${
                tab === t.id
                  ? "bg-[#168FA8] text-white border-[#168FA8]"
                  : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
          {!canManage && (
            <span className="ml-auto text-[11px] text-[#7B8798]">
              View only · Compliance manages governance records
            </span>
          )}
        </div>
      }
    >
      {tab === "overview" && <OverviewPanel myEmail={user?.email} onOpenMeeting={setOpenMeeting} />}
      {tab === "calendar" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-9">
            <MeetingCalendar
              canManage={canManage}
              onOpen={setOpenMeeting}
              onCreate={(day) => setScheduling({ day })}
            />
          </div>
          <div className="xl:col-span-3">
            <SectionCard title="Upcoming">
              <UpcomingMeetings onOpen={setOpenMeeting} limit={10} />
            </SectionCard>
          </div>
        </div>
      )}
      {tab === "documents" && <DocumentsPanel canManage={canManage} />}
      {tab === "actions" && <ActionItemsPanel canManage={canManage} myEmail={user?.email} />}
      {tab === "committees" && <CommitteesPanel canManage={canManage} />}

      {openMeeting !== null && (
        <MeetingDetail
          meetingId={openMeeting}
          canManage={canManage}
          onClose={() => setOpenMeeting(null)}
        />
      )}
      {scheduling && <MeetingForm day={scheduling.day} onClose={() => setScheduling(null)} />}
      {uploading && <UploadDocumentForm onClose={() => setUploading(false)} />}
    </AppShell>
  );
}
