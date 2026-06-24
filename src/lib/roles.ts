export type Role =
  | "analyst"
  | "risk"
  | "architect"
  | "regulator"
  | "compliance"
  | "fraud"
  | "admin";

export type Capability = "M" | "V" | "Vm" | "X"; // manage, view, view-masked, hidden

export const ROLES: { id: Role; label: string; scope: string }[] = [
  { id: "analyst", label: "Financial Analyst", scope: "Aggregates only" },
  { id: "risk", label: "Risk Manager", scope: "My portfolio" },
  { id: "architect", label: "Data Architect", scope: "All sources" },
  { id: "regulator", label: "Regulator", scope: "Read-only, masked" },
  { id: "compliance", label: "Compliance / Steward", scope: "All institutions" },
  { id: "fraud", label: "Fraud Investigator", scope: "Cases" },
  { id: "admin", label: "Administrator", scope: "Org-wide" },
];

export type ModuleKey =
  | "dashboard"
  | "integrations"
  | "mapping"
  | "pipelines"
  | "customer360"
  | "ai"
  | "credit"
  | "fraud"
  | "inclusion"
  | "compliance"
  | "governance"
  | "reports"
  | "users"
  | "settings";

// Capability matrix from spec §05
export const CAPS: Record<ModuleKey, Record<Role, Capability>> = {
  dashboard:    { analyst: "V",  risk: "V",  architect: "V",  regulator: "V",  compliance: "V",  fraud: "V",  admin: "V" },
  integrations: { analyst: "V",  risk: "V",  architect: "M",  regulator: "X",  compliance: "V",  fraud: "X",  admin: "M" },
  mapping:      { analyst: "X",  risk: "V",  architect: "M",  regulator: "X",  compliance: "V",  fraud: "X",  admin: "V" },
  pipelines:    { analyst: "V",  risk: "V",  architect: "M",  regulator: "X",  compliance: "V",  fraud: "X",  admin: "V" },
  customer360:  { analyst: "Vm", risk: "V",  architect: "V",  regulator: "Vm", compliance: "V",  fraud: "V",  admin: "V" },
  ai:           { analyst: "M",  risk: "M",  architect: "V",  regulator: "V",  compliance: "V",  fraud: "V",  admin: "V" },
  credit:       { analyst: "M",  risk: "M",  architect: "V",  regulator: "Vm", compliance: "V",  fraud: "X",  admin: "V" },
  fraud:        { analyst: "V",  risk: "V",  architect: "X",  regulator: "Vm", compliance: "V",  fraud: "M",  admin: "V" },
  inclusion:    { analyst: "V",  risk: "V",  architect: "V",  regulator: "V",  compliance: "V",  fraud: "X",  admin: "V" },
  compliance:   { analyst: "V",  risk: "V",  architect: "X",  regulator: "M",  compliance: "M",  fraud: "V",  admin: "V" },
  governance:   { analyst: "X",  risk: "V",  architect: "M",  regulator: "V",  compliance: "M",  fraud: "X",  admin: "V" },
  reports:      { analyst: "M",  risk: "M",  architect: "V",  regulator: "V",  compliance: "M",  fraud: "V",  admin: "V" },
  users:        { analyst: "X",  risk: "X",  architect: "X",  regulator: "X",  compliance: "X",  fraud: "X",  admin: "M" },
  settings:     { analyst: "X",  risk: "X",  architect: "V",  regulator: "X",  compliance: "V",  fraud: "X",  admin: "M" },
};

export const can = (role: Role, mod: ModuleKey): Capability => CAPS[mod][role];
export const visible = (role: Role, mod: ModuleKey) => can(role, mod) !== "X";
export const canManage = (role: Role, mod: ModuleKey) => can(role, mod) === "M";
