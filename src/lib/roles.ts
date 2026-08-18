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
  | "governance"
  | "compliance"
  | "fraud"
  | "creditrisk"
  | "ai"
  | "inclusion"
  | "reports"
  | "users"
  | "settings";

// SRS Permission Matrix (§4.2 & §12.1)
export const CAPS: Record<ModuleKey, Record<Role, Capability>> = {
  dashboard:    { compliance: "V", business: "V", technical: "V" },
  integrations: { compliance: "V", business: "V", technical: "M" },
  mapping:      { compliance: "V", business: "X", technical: "M" },
  pipelines:    { compliance: "V", business: "V", technical: "M" },
  customer360:  { compliance: "V", business: "V", technical: "V" },
  governance:   { compliance: "M", business: "V", technical: "V" },
  compliance:   { compliance: "M", business: "V", technical: "V" },
  fraud:        { compliance: "M", business: "V", technical: "V" },
  creditrisk:   { compliance: "V", business: "M", technical: "V" },
  ai:           { compliance: "V", business: "M", technical: "V" },
  inclusion:    { compliance: "V", business: "M", technical: "V" },
  reports:      { compliance: "M", business: "M", technical: "V" },
  users:        { compliance: "X", business: "X", technical: "M" },
  settings:     { compliance: "X", business: "V", technical: "M" },
};

export const can = (role: Role, mod: ModuleKey): Capability => CAPS[mod]?.[role] ?? "X";
export const visible = (role: Role, mod: ModuleKey) => can(role, mod) !== "X";
export const canManage = (role: Role, mod: ModuleKey) => can(role, mod) === "M";

