// Which view renders which dashboard widget key (the keys the API returns).
import type { ReactNode } from "react";
import {
  ActivePipelines,
  AiAlerts,
  ComplianceOverview,
  ComplianceRate,
  DataFreshness,
  FailedIntegrations,
  InclusionSnapshot,
  IntegrationHealth,
  OpenIncidents,
  OverdueActionItems,
  OverdueSubmissions,
  PendingMappings,
  RecentActivity,
  RecentPipelineRuns,
  RecentReports,
  RiskOverview,
  SystemHealth,
  UpcomingDeadlines,
} from "./widgets";

/* eslint-disable @typescript-eslint/no-explicit-any -- each view narrows its own payload */
export const WIDGET_VIEWS: Record<string, (props: { data: any }) => ReactNode> = {
  overdue_submissions: OverdueSubmissions,
  upcoming_deadlines: UpcomingDeadlines,
  open_incidents: OpenIncidents,
  compliance_rate: ComplianceRate,
  overdue_action_items: OverdueActionItems,
  recent_activity: RecentActivity,
  integration_health: IntegrationHealth,
  ai_alerts: AiAlerts,
  inclusion_snapshot: InclusionSnapshot,
  risk_overview: RiskOverview,
  recent_reports: RecentReports,
  compliance_overview: ComplianceOverview,
  active_pipelines: ActivePipelines,
  failed_integrations: FailedIntegrations,
  data_freshness: DataFreshness,
  system_health: SystemHealth,
  pending_mappings: PendingMappings,
  recent_pipeline_runs: RecentPipelineRuns,
};
/* eslint-enable @typescript-eslint/no-explicit-any */
