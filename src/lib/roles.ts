export type Role =
  | "compliance"
  | "business"
  | "technical";

export type Capability = "M" | "V" | "Vm" | "X"; // manage, view, view-masked, hidden

export const ROLES: { id: Role; label: string; scope: string; description: string }[] = [
  {
    id: "compliance",
    label: "Compliance User",
    scope: "Compliance & Incidents",
    description: "Monitors participant compliance, deadlines, incidents, and remediation actions",
  },
  {
    id: "business",
    label: "Business User",
    scope: "Analytics & Governance",
    description: "Reviews reports, financial inclusion analytics, governance records, and AI insights",
  },
  {
    id: "technical",
    label: "Technical / Admin User",
    scope: "Integrations & Admin",
    description: "Manages integrations, pipelines, data mappings, system settings, and user accounts",
  },
];

export type ModuleKey =
  | "dashboard"
  | "integrations"
  | "mapping"
  | "pipelines"
  | "customer360"
  | "participant360"
  | "governance"
  | "compliance"
  | "ai"
  | "inclusion"
  | "reports"
  | "users"
  | "settings";

// SRS Permission Matrix (§4.2 & §12.1)
export const CAPS: Record<ModuleKey, Record<Role, Capability>> = {
  dashboard:      { compliance: "V", business: "V", technical: "V" },
  integrations:   { compliance: "V", business: "V", technical: "M" },
  // REQ-MAP-009: Standards & Mapping is accessible only to Technical/Admin.
  mapping:        { compliance: "X", business: "X", technical: "M" },
  pipelines:      { compliance: "V", business: "V", technical: "M" },
  customer360:    { compliance: "V", business: "V", technical: "V" },
  participant360: { compliance: "V", business: "V", technical: "V" },
  governance:     { compliance: "M", business: "V", technical: "V" },
  compliance:     { compliance: "M", business: "V", technical: "V" },
  ai:             { compliance: "V", business: "M", technical: "V" },
  inclusion:      { compliance: "V", business: "M", technical: "V" },
  reports:        { compliance: "M", business: "M", technical: "V" },
  users:          { compliance: "X", business: "X", technical: "M" },
  settings:       { compliance: "X", business: "V", technical: "M" },
};

export const can = (role: Role, mod: ModuleKey): Capability => CAPS[mod]?.[role] ?? "X";
export const visible = (role: Role, mod: ModuleKey) => can(role, mod) !== "X";
export const canManage = (role: Role, mod: ModuleKey) => can(role, mod) === "M";

// Fine-grained actions (SRS §12.1) — mirror of backend/app/core/permissions.py
// CAPS. The backend enforces these; the UI only uses them to hide controls.
export type Action =
  | "dashboard.view"
  | "integrations.view"
  | "integrations.manage"
  | "integrations.upload"
  | "pipelines.view"
  | "pipelines.manage"
  | "mapping.view"
  | "mapping.manage"
  | "participant360.view"
  | "participant360.notes"
  | "participant360.risk_methodology"
  | "governance.view"
  | "governance.manage"
  | "compliance.view"
  | "compliance.manage"
  | "compliance.upload"
  | "ai.view"
  | "ai.manage"
  | "ai.alerts.transition"
  | "inclusion.view"
  | "inclusion.manage"
  | "reports.view"
  | "reports.generate"
  | "reports.schedule"
  | "notifications.view"
  | "notifications.manage"
  | "users.manage"
  | "settings.view"
  | "settings.manage"
  | "audit.view";

const C: Role = "compliance";
const B: Role = "business";
const T: Role = "technical";

export const ACTIONS: Record<Action, Role[]> = {
  "dashboard.view": [C, B, T],
  "integrations.view": [C, B, T],
  "integrations.manage": [T],
  "integrations.upload": [C, T],
  "pipelines.view": [C, B, T],
  "pipelines.manage": [T],
  "mapping.view": [T],
  "mapping.manage": [T],
  "participant360.view": [C, B, T],
  "participant360.notes": [C],
  "participant360.risk_methodology": [C, B, T],
  "governance.view": [C, B, T],
  "governance.manage": [C],
  "compliance.view": [C, B, T],
  "compliance.manage": [C],
  "compliance.upload": [C, T],
  "ai.view": [C, B, T],
  "ai.manage": [B],
  "ai.alerts.transition": [C, B],
  "inclusion.view": [C, B, T],
  "inclusion.manage": [B],
  "reports.view": [C, B, T],
  "reports.generate": [C, B],
  "reports.schedule": [C, B],
  "notifications.view": [C, B, T],
  "notifications.manage": [T],
  "users.manage": [T],
  "settings.view": [B, T],
  "settings.manage": [T],
  "audit.view": [C, T],
};

export const hasCap = (role: Role | undefined, action: Action) => !!role && ACTIONS[action].includes(role);

// Participants never log in: they send files to RSwitch offline and
// Compliance or Technical/Admin staff upload them on their behalf (REQ-INTG-007).
export const canUploadOnBehalf = (role: Role | undefined) => hasCap(role, "integrations.upload");

