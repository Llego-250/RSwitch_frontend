// Headline numbers for the Compliance page, from the §15.1 dashboard
// read model (GET /compliance/dashboard).

import { KpiCard } from "@/components/KpiCard";
import { pct, useComplianceDashboard } from "@/lib/compliance";
import { FormError } from "./ui";

export function ComplianceSummary({
  onTab,
}: {
  onTab: (tab: "calendar" | "incidents" | "review" | "rates") => void;
}) {
  const summary = useComplianceDashboard(30);
  if (summary.error)
    return (
      <FormError
        message={
          summary.error instanceof Error ? summary.error.message : "Couldn't load the summary."
        }
      />
    );
  const d = summary.data;
  const rate = d?.compliance_rate_30d;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiCard
        label="Overdue submissions"
        value={d ? String(d.overdue_submissions) : "–"}
        context="Deadline passed without an approved submission"
        source="compliance register"
        onClick={() => onTab("calendar")}
      />
      <KpiCard
        label="Upcoming deadlines (30d)"
        value={d ? String(d.upcoming_deadlines.length) : "–"}
        context={
          d && d.upcoming_deadlines[0]
            ? `Next: ${d.upcoming_deadlines[0].participant_code} · ${d.upcoming_deadlines[0].requirement_name}`
            : "None in the next 30 days"
        }
        source="compliance calendar"
        onClick={() => onTab("calendar")}
      />
      <KpiCard
        label="Open incidents"
        value={d ? String(d.open_incidents.total) : "–"}
        context={
          d
            ? `${d.open_incidents.Critical} Critical · ${d.open_incidents.High} High · ${d.open_incidents.Medium} Medium · ${d.open_incidents.Low} Low`
            : undefined
        }
        source="incidents"
        onClick={() => onTab("incidents")}
      />
      <KpiCard
        label="Compliance rate (30d)"
        value={rate ? pct(rate.rate_pct) : "–"}
        context={
          rate
            ? rate.total
              ? `${rate.on_time} of ${rate.total} deadlines approved on time`
              : "No deadline fell due in the last 30 days"
            : undefined
        }
        source="compliance cycles"
        onClick={() => onTab("rates")}
      />
      <KpiCard
        label="Overdue action items"
        value={d ? String(d.overdue_action_items.total) : "–"}
        context={
          d
            ? `${d.overdue_action_items.governance} governance · ${d.overdue_action_items.incident_remediation} incident remediation`
            : undefined
        }
        source="governance & incidents"
        onClick={() => onTab("incidents")}
      />
    </div>
  );
}
