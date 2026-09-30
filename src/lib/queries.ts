import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
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
// Participant logins are scoped server-side to their own record, and the
// network-wide endpoints are staff-only, so those hooks switch to the scoped
// equivalent (or stay idle) for a participant.

const useIsStaff = () => useAuth().user?.participantId == null;

export const useOverview = () =>
  useQuery({ queryKey: ["overview"], queryFn: () => api.get<Overview>("/reports/overview"), enabled: useIsStaff() });

export const useTrends = (months = 6) =>
  useQuery({
    queryKey: ["trends", months],
    queryFn: () => api.get<TrendPoint[]>(`/reports/trends?months=${months}`),
    enabled: useIsStaff(),
  });

export const useParticipants = () => {
  const staff = useIsStaff();
  return useQuery({
    queryKey: ["participants", staff ? "all" : "me"],
    queryFn: async () =>
      staff ? api.get<Participant[]>("/participants") : [await api.get<Participant>("/participants/me")],
  });
};

export const useIntegrations = () =>
  useQuery({ queryKey: ["integrations"], queryFn: () => api.get<IntegrationRow[]>("/integrations") });

export const useIssues = () => useQuery({ queryKey: ["issues"], queryFn: () => api.get<Issue[]>("/issues") });

export const useSubmissions = (participantId?: number) =>
  useQuery({
    queryKey: ["submissions", participantId ?? "all"],
    queryFn: () => api.get<Submission[]>(participantId ? `/submissions?participant_id=${participantId}` : "/submissions"),
  });

export const useSubmissionRoster = () => {
  const staff = useIsStaff();
  return useQuery({
    queryKey: ["submissions", "roster", staff ? "all" : "me"],
    queryFn: async () => {
      if (staff) return api.get<SubmissionRosterRow[]>("/submissions/roster");
      // Same shape, built from the participant's own (server-scoped) history.
      const [me, subs] = await Promise.all([
        api.get<Participant>("/participants/me"),
        api.get<Submission[]>("/submissions"),
      ]);
      const latest = subs[0];
      return [
        {
          participant_id: me.id,
          participant_name: me.name,
          participant_code: me.code,
          submission_count: subs.length,
          last_period: latest?.period ?? null,
          last_uploaded_at: latest?.uploaded_at ?? null,
          last_result: latest?.result ?? null,
        },
      ] satisfies SubmissionRosterRow[];
    },
  });
};

export const useDocumentRoster = () =>
  useQuery({
    queryKey: ["documents", "roster"],
    queryFn: () => api.get<DocumentRosterRow[]>("/documents/roster"),
    enabled: useIsStaff(),
  });

export const useTemplates = () => useQuery({ queryKey: ["templates"], queryFn: () => api.get<Template[]>("/templates") });

export const useTemplateColumns = (templateId: number | undefined) =>
  useQuery({
    queryKey: ["templates", templateId, "columns"],
    queryFn: () => api.get<TemplateColumn[]>(`/templates/${templateId}/columns`),
    enabled: templateId !== undefined,
  });

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => api.get<SystemSettings>("/settings"), enabled: useIsStaff() });

export const useAlerts = () =>
  useQuery({ queryKey: ["alerts"], queryFn: () => api.get<AnomalyAlert[]>("/alerts"), enabled: useIsStaff() });

export const useRiskRanking = () =>
  useQuery({ queryKey: ["risk-ranking"], queryFn: () => api.get<RiskRow[]>("/alerts/risk-ranking"), enabled: useIsStaff() });
