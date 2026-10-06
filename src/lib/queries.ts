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
