import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, ShieldAlert, Upload } from "lucide-react";
import { AppShell, PrimaryButton, SecondaryButton } from "@/components/AppShell";
import { UploadSubmissionModal } from "@/components/UploadSubmissionModal";
import { CalendarPanel } from "@/components/compliance/Calendar";
import { DocumentsPanel, DocumentUploadModal } from "@/components/compliance/Documents";
import { FailureRatesPanel } from "@/components/compliance/FailureRates";
import {
  IncidentDetailModal,
  IncidentForm,
  IncidentsPanel,
} from "@/components/compliance/Incidents";
import {
  RegisterPanel,
  RequirementDetailModal,
  RequirementForm,
} from "@/components/compliance/Register";
import { ReviewQueuePanel } from "@/components/compliance/ReviewQueue";
import { ComplianceSummary } from "@/components/compliance/Summary";
import { TabButton } from "@/components/compliance/ui";
import { useRole } from "@/context/RoleContext";
import {
  useRefreshCompliance,
  useReviewQueue,
  type Incident,
  type RequirementDetail,
  type UploadTarget,
} from "@/lib/compliance";
import { hasCap } from "@/lib/roles";

const TABS = [
  { id: "register", label: "Register" },
  { id: "calendar", label: "Calendar" },
  { id: "review", label: "Review queue" },
  { id: "incidents", label: "Incidents" },
  { id: "documents", label: "Documents" },
  { id: "rates", label: "Failure rates" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/compliance")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab: TABS.some((t) => t.id === search.tab) ? (search.tab as Tab) : undefined,
  }),
  component: Compliance,
});

// SRS §5.8 Compliance Monitoring. Compliance manages the register, reviews
// submissions and runs incidents; Compliance and Technical/Admin upload files
// on a participant's behalf; Business and Technical/Admin otherwise view
// (§12.1). The API enforces this; the page only hides controls.
function Compliance() {
  const { role } = useRole();
  const canManage = hasCap(role, "compliance.manage");
  const canUpload = hasCap(role, "compliance.upload");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const refresh = useRefreshCompliance();
  const queue = useReviewQueue();

  const [tab, setTabState] = useState<Tab>(search.tab ?? "register");
  const setTab = (next: Tab) => {
    setTabState(next);
    navigate({ search: { tab: next }, replace: true });
  };
  const [openRequirement, setOpenRequirement] = useState<number | null>(null);
  const [requirementForm, setRequirementForm] = useState<{
    requirement?: RequirementDetail;
  } | null>(null);
  const [upload, setUpload] = useState<Partial<UploadTarget> | null>(null);
  const [openIncident, setOpenIncident] = useState<number | null>(null);
  const [incidentForm, setIncidentForm] = useState<{ incident?: Incident } | null>(null);

  const reviewCount = queue.data
    ? queue.data.awaiting_review.length + queue.data.needs_follow_up.length
    : undefined;
  const dataUpload = upload && upload.kind !== "Document" ? upload : null;
  const documentUpload =
    upload && upload.kind === "Document" && upload.participantId ? (upload as UploadTarget) : null;

  return (
    <AppShell
      title="Compliance Monitoring"
      subtitle="Register, deadlines, submission review & incidents"
      breadcrumb="GOVERN › COMPLIANCE"
      scope="All Institutions"
      primaryAction={
        <div className="flex items-center gap-2">
          {canManage && (
            <SecondaryButton
              icon={<ShieldAlert className="h-4 w-4" />}
              onClick={() => setIncidentForm({})}
            >
              Record incident
            </SecondaryButton>
          )}
          {canManage && (
            <SecondaryButton
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setRequirementForm({})}
            >
              New requirement
            </SecondaryButton>
          )}
          {canUpload && (
            <PrimaryButton
              icon={<Upload className="h-4 w-4" />}
              onClick={() => setUpload({ kind: "Data Return" })}
            >
              Upload Submission
            </PrimaryButton>
          )}
        </div>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2 w-full">
          {TABS.map((t) => (
            <TabButton
              key={t.id}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
              count={t.id === "review" ? reviewCount : undefined}
              alert={t.id === "review"}
            >
              {t.label}
            </TabButton>
          ))}
          {!canManage && (
            <span className="ml-auto text-[11px] text-[#7B8798]">
              View only · Compliance manages the register, reviews and incidents
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <ComplianceSummary onTab={setTab} />
        {tab === "register" && (
          <RegisterPanel
            canManage={canManage}
            canUpload={canUpload}
            onOpen={setOpenRequirement}
            onUpload={setUpload}
            onCreate={() => setRequirementForm({})}
          />
        )}
        {tab === "calendar" && <CalendarPanel onOpen={setOpenRequirement} />}
        {tab === "review" && (
          <ReviewQueuePanel
            canManage={canManage}
            canUpload={canUpload}
            onOpen={setOpenRequirement}
            onUpload={setUpload}
          />
        )}
        {tab === "incidents" && (
          <IncidentsPanel
            canManage={canManage}
            onCreate={() => setIncidentForm({})}
            onOpen={setOpenIncident}
          />
        )}
        {tab === "documents" && (
          <DocumentsPanel canUpload={canUpload} onOpen={setOpenRequirement} onUpload={setUpload} />
        )}
        {tab === "rates" && <FailureRatesPanel onOpenIncident={setOpenIncident} />}
      </div>

      {openRequirement !== null && (
        <RequirementDetailModal
          id={openRequirement}
          canManage={canManage}
          canUpload={canUpload}
          onClose={() => setOpenRequirement(null)}
          onUpload={setUpload}
          onEdit={(requirement) => setRequirementForm({ requirement })}
        />
      )}
      {requirementForm && (
        <RequirementForm
          requirement={requirementForm.requirement}
          onClose={() => setRequirementForm(null)}
          onSaved={(saved) => {
            setRequirementForm(null);
            setOpenRequirement(saved.id);
          }}
        />
      )}
      {openIncident !== null && (
        <IncidentDetailModal
          id={openIncident}
          onClose={() => setOpenIncident(null)}
          onEdit={(incident) => setIncidentForm({ incident })}
        />
      )}
      {incidentForm && (
        <IncidentForm
          incident={incidentForm.incident}
          onClose={() => setIncidentForm(null)}
          onSaved={(saved) => {
            setIncidentForm(null);
            setOpenIncident(saved.id);
          }}
        />
      )}
      {/* §6.1 step 2: Compliance → Upload Submission, with the requirement preselected when known. */}
      <UploadSubmissionModal
        open={dataUpload !== null}
        onClose={() => setUpload(null)}
        participantId={dataUpload?.participantId}
        requirementId={dataUpload?.requirementId}
        replacesSubmissionId={dataUpload?.replacesId}
        onUploaded={refresh}
      />
      {documentUpload && (
        <DocumentUploadModal target={documentUpload} onClose={() => setUpload(null)} />
      )}
    </AppShell>
  );
}
