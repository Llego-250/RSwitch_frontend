import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type {
  DocumentRosterRow,
  IntegrationRow,
  Issue,
  Overview,
  Participant,
  Submission,
  SubmissionRosterRow,
  Template,
  TemplateColumn,
  TrendPoint,
  AnomalyAlert,
  RiskRow,
  SystemSettings,
  ApiKeyRow,
  AuditEvent,
  EmailLogRow,
  NotificationEventSetting,
  NotificationRow,
  OrganizationSettings,
  PasswordPolicy,
  TrustedDeviceRow,
  UserRow,
} from "./types";

// One hook per backend read endpoint, so pages share cache keys.

export const useOverview = () =>
  useQuery({ queryKey: ["overview"], queryFn: () => api.get<Overview>("/reports/overview") });

export const useTrends = (months = 6) =>
  useQuery({
    queryKey: ["trends", months],
    queryFn: () => api.get<TrendPoint[]>(`/reports/trends?months=${months}`),
  });

export const useParticipants = () =>
  useQuery({ queryKey: ["participants"], queryFn: () => api.get<Participant[]>("/participants") });

export const useIntegrations = () =>
  useQuery({ queryKey: ["integrations"], queryFn: () => api.get<IntegrationRow[]>("/integrations") });

export const useIssues = () => useQuery({ queryKey: ["issues"], queryFn: () => api.get<Issue[]>("/issues") });

export const useSubmissions = (participantId?: number) =>
  useQuery({
    queryKey: ["submissions", participantId ?? "all"],
    queryFn: () => api.get<Submission[]>(participantId ? `/submissions?participant_id=${participantId}` : "/submissions"),
  });

export const useSubmissionRoster = () =>
  useQuery({ queryKey: ["submissions", "roster"], queryFn: () => api.get<SubmissionRosterRow[]>("/submissions/roster") });

export const useDocumentRoster = () =>
  useQuery({
    queryKey: ["documents", "roster"],
    queryFn: () => api.get<DocumentRosterRow[]>("/documents/roster"),
  });

export const useTemplates = () => useQuery({ queryKey: ["templates"], queryFn: () => api.get<Template[]>("/templates") });

export const useTemplateColumns = (templateId: number | undefined) =>
  useQuery({
    queryKey: ["templates", templateId, "columns"],
    queryFn: () => api.get<TemplateColumn[]>(`/templates/${templateId}/columns`),
    enabled: templateId !== undefined,
  });

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => api.get<SystemSettings>("/settings") });

export const useAlerts = () =>
  useQuery({ queryKey: ["alerts"], queryFn: () => api.get<AnomalyAlert[]>("/alerts") });

export const useRiskRanking = () =>
  useQuery({ queryKey: ["risk-ranking"], queryFn: () => api.get<RiskRow[]>("/alerts/risk-ranking") });

// ---- auth, users, settings, notifications ----------------------------------

/** Branding + formats, readable by every signed-in user. */
export const useOrganization = (enabled = true) =>
  useQuery({
    queryKey: ["settings", "organization"],
    queryFn: () => api.get<OrganizationSettings>("/settings/organization"),
    enabled,
    staleTime: 5 * 60_000,
  });

/** Public: the §11.1 rules as currently configured. */
export const usePasswordPolicy = () =>
  useQuery({ queryKey: ["password-policy"], queryFn: () => api.get<PasswordPolicy>("/auth/password-policy") });

export const useUsers = (enabled = true) =>
  useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users"), enabled });

export interface AuditFilters {
  q?: string;
  action?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export const auditQueryString = (f: AuditFilters) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") params.set(k, String(v));
  return params.toString();
};

export const useAuditLog = (filters: AuditFilters) =>
  useQuery({
    queryKey: ["audit", filters],
    queryFn: () => api.get<AuditEvent[]>(`/audit-log?${auditQueryString({ limit: 500, ...filters })}`),
  });

export const useAuditActions = () =>
  useQuery({ queryKey: ["audit", "actions"], queryFn: () => api.get<string[]>("/audit-log/actions") });

export const useNotificationEvents = (enabled = true) =>
  useQuery({
    queryKey: ["settings", "notification-events"],
    queryFn: () => api.get<NotificationEventSetting[]>("/settings/notification-events"),
    enabled,
  });

export const useEmailLog = (enabled = true) =>
  useQuery({ queryKey: ["settings", "email-log"], queryFn: () => api.get<EmailLogRow[]>("/settings/email-log"), enabled });

export const useApiKeys = (enabled = true) =>
  useQuery({ queryKey: ["settings", "api-keys"], queryFn: () => api.get<ApiKeyRow[]>("/settings/api-keys"), enabled });

export interface NotificationFilters {
  status?: "all" | "read" | "unread";
  severity?: string;
  q?: string;
}

export const useNotificationHistory = (filters: NotificationFilters) =>
  useQuery({
    queryKey: ["notifications", "history", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      return api.get<NotificationRow[]>(`/notifications/history?${params}`);
    },
  });

export const useTrustedDevices = () =>
  useQuery({ queryKey: ["trusted-devices"], queryFn: () => api.get<TrustedDeviceRow[]>("/auth/trusted-devices") });
