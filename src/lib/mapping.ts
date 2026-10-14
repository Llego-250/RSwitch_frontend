// Standards & Mapping (SRS §5.5): mapping, version and standard shapes and
// hooks. Technical/Admin only (REQ-MAP-009); served under /integrations/mappings.

import { useQuery } from "@tanstack/react-query";
import type { Status } from "@/components/StatusBadge";
import { api } from "./api";

export type MappingStatus = "Healthy" | "Warning" | "Draft"; // REQ-MAP-003

export const MAPPING_BADGE: Record<MappingStatus, Status> = {
  Healthy: "healthy",
  Warning: "warning",
  Draft: "draft",
};

export interface FieldRule {
  id?: number;
  source_field: string;
  target_field: string;
  transform: string;
  position?: number;
}

export interface MappingVersion {
  id: number;
  label: string;
  number: number;
  is_draft: boolean;
  notes: string;
  mapped_count: number;
  total_count: number;
  published_by: string;
  published_at: string | null;
  created_by: string;
  created_at: string;
  rules?: FieldRule[];
}

export interface Mapping {
  id: number;
  code: string;
  name: string;
  source_system: string;
  target_standard: string;
  participant_id: number | null;
  participant_name: string | null;
  source_template_id: number | null;
  source_template_name: string | null;
  version: string | null;
  status: MappingStatus;
  mapped_count: number;
  total_count: number;
  has_draft: boolean;
  cloned_from_id: number | null;
  used_by: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  active_version?: MappingVersion | null;
  draft?: MappingVersion | null;
}

export interface TargetField {
  name: string;
  type: string;
  description: string;
  role: string;
}

export interface Standards {
  standards: Record<string, TargetField[]>;
  transforms: { key: string; label: string }[];
}

export const useMappings = (enabled = true) =>
  useQuery({
    queryKey: ["mappings"],
    queryFn: () => api.get<Mapping[]>("/integrations/mappings"),
    enabled,
  });

export const useMapping = (id: number | null) =>
  useQuery({
    queryKey: ["mappings", id],
    queryFn: () => api.get<Mapping>(`/integrations/mappings/${id}`),
    enabled: id !== null,
  });

export const useMappingVersions = (id: number | null) =>
  useQuery({
    queryKey: ["mappings", id, "versions"],
    queryFn: () => api.get<MappingVersion[]>(`/integrations/mappings/${id}/versions`),
    enabled: id !== null,
  });

export const useMappingVersion = (mappingId: number | null, versionId: number | null) =>
  useQuery({
    queryKey: ["mappings", mappingId, "versions", versionId],
    queryFn: () =>
      api.get<MappingVersion>(`/integrations/mappings/${mappingId}/versions/${versionId}`),
    enabled: mappingId !== null && versionId !== null,
  });

export const useStandards = (enabled = true) =>
  useQuery({
    queryKey: ["mapping-standards"],
    queryFn: () => api.get<Standards>("/integrations/mappings/standards"),
    staleTime: Infinity,
    enabled,
  });

export const unmappedOf = (rules: FieldRule[] | undefined) =>
  (rules ?? []).filter((r) => !r.target_field).map((r) => r.source_field);
