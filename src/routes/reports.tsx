import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { AppShell, PrimaryButton, SecondaryButton } from "@/components/AppShell";
import { TabButton } from "@/components/compliance/ui";
import { LoadState } from "@/components/governance/ui";
import { Catalog } from "@/components/reports/Catalog";
import { History } from "@/components/reports/History";
import { ReportDialog, type DialogStart } from "@/components/reports/ReportDialog";
import { Schedules } from "@/components/reports/Schedules";
import { Templates } from "@/components/reports/Templates";
import { useReportCatalog, useReportSchedules } from "@/lib/reports";

const TABS = [
  { id: "history", label: "History" },
  { id: "schedules", label: "Schedules" },
  { id: "templates", label: "Templates" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/reports")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab: TABS.some((t) => t.id === search.tab) ? (search.tab as Tab) : undefined,
  }),
  component: Reports,
});

// SRS §5.11 Reports. Generate / view rights are per report type (§14) and
// come from the API's catalogue; the history, schedules and templates are
// all stored server-side (REQ-RPT-004..006).
function Reports() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "history");
  const [dialog, setDialog] = useState<DialogStart | null>(null);
  const catalog = useReportCatalog();
  const schedules = useReportSchedules();
  const c = catalog.data;
  const canGenerate = !!c?.types.some((t) => t.can_generate);
  const canSchedule = !!c?.types.some((t) => t.can_schedule);

  return (
    <AppShell
      title="Reports"
      subtitle="Generate, schedule and download structured reports"
      breadcrumb="INTELLIGENCE › REPORTS"
      scope="All Institutions"
      primaryAction={
        <div className="flex items-center gap-2">
          {canSchedule && (
            <SecondaryButton
              icon={<CalendarClock className="h-4 w-4" />}
              onClick={() => setDialog({ mode: "schedule" })}
            >
              Schedule
            </SecondaryButton>
          )}
          {canGenerate && (
            <PrimaryButton
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setDialog({ mode: "generate" })}
            >
              Generate report
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
              count={t.id === "schedules" ? schedules.data?.length : undefined}
            >
              {t.label}
            </TabButton>
          ))}
          {c && !canGenerate && (
            <span className="ml-auto text-[11px] text-[#7B8798]">
              View only · you can download the reports your role may view
            </span>
          )}
        </div>
      }
    >
      <LoadState loading={catalog.isLoading} error={catalog.error} />
      {c && (
        <div className="space-y-5">
          <Catalog
            catalog={c}
            onGenerate={(key) => setDialog({ mode: "generate", report: key })}
            onSchedule={(key) => setDialog({ mode: "schedule", report: key })}
          />
          {tab === "history" && <History catalog={c} />}
          {tab === "schedules" && (
            <Schedules canSchedule={canSchedule} onNew={() => setDialog({ mode: "schedule" })} />
          )}
          {tab === "templates" && (
            <Templates
              catalog={c}
              onApply={(t) =>
                setDialog({
                  mode: "generate",
                  report: t.report,
                  filters: t.filters,
                  format: t.format,
                })
              }
            />
          )}
        </div>
      )}
      {c && dialog && <ReportDialog catalog={c} start={dialog} onClose={() => setDialog(null)} />}
    </AppShell>
  );
}
