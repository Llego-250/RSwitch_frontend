import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
import { useState } from "react";
import {
  UserPlus, Key, Monitor, ClipboardList, Lock, Shield, Trash2, Edit2,
  MoreHorizontal, CheckCircle2, XCircle, Search, ChevronDown, AlertTriangle,
  ShieldCheck, ShieldAlert, RefreshCw, Copy, Eye, EyeOff,
} from "lucide-react";

export const Route = createFileRoute("/users")({
  component: Users,
});

// ─── DATA ────────────────────────────────────────────────────────────────────

const USERS_DATA = [
  { id: "USR-001", name: "Amara Diallo",      email: "amara@fdi.org",       role: "Financial Analyst",  institution: "HQ",       status: "active"   as const, login: "10m ago",  mfa: true  },
  { id: "USR-002", name: "Samuel Osei",        email: "samuel@fdi.org",      role: "Risk Manager",       institution: "HQ",       status: "active"   as const, login: "2h ago",   mfa: true  },
  { id: "USR-003", name: "Fatima Al-Rashid",   email: "fatima@partner.org",  role: "Regulator",          institution: "External", status: "active"   as const, login: "1d ago",   mfa: true  },
  { id: "USR-004", name: "Jean-Pierre M.",     email: "jp@fdi.org",          role: "Administrator",      institution: "HQ",       status: "active"   as const, login: "5h ago",   mfa: true  },
  { id: "USR-005", name: "Aisha Konteh",       email: "aisha@fdi.org",       role: "Compliance Officer", institution: "HQ",       status: "active"   as const, login: "3d ago",   mfa: false },
  { id: "USR-006", name: "David Mensah",       email: "david@fdi.org",       role: "Data Architect",     institution: "HQ",       status: "inactive" as const, login: "7d ago",   mfa: true  },
  { id: "USR-007", name: "Maria Santos",       email: "maria@regulator.gov", role: "Regulator",          institution: "RegBody",  status: "active"   as const, login: "2h ago",   mfa: true  },
];

const CAPABILITIES = [
  "Dashboard View",
  "Integrations Manage",
  "Pipeline View",
  "Pipeline Manage",
  "Customer 360 View",
  "Governance View",
  "Compliance Manage",
  "AI Decision View",
  "Credit Risk Manage",
  "Fraud Manage",
  "Reports Export",
  "Users Manage",
  "Settings Manage",
];

const ROLE_COLS = [
  "Financial Analyst",
  "Risk Manager",
  "Data Architect",
  "Regulator",
  "Compliance Officer",
  "Fraud Investigator",
  "Administrator",
];

// M = manage, V = view, X = none
const PERM_MATRIX: Record<string, ("M" | "V" | "X")[]> = {
  "Dashboard View":        ["V", "V", "V", "V", "V", "V", "V"],
  "Integrations Manage":   ["X", "X", "M", "X", "X", "X", "M"],
  "Pipeline View":         ["V", "V", "M", "X", "V", "X", "V"],
  "Pipeline Manage":       ["X", "X", "M", "X", "X", "X", "M"],
  "Customer 360 View":     ["V", "V", "V", "V", "V", "V", "V"],
  "Governance View":       ["X", "V", "M", "V", "M", "X", "V"],
  "Compliance Manage":     ["X", "X", "X", "M", "M", "X", "V"],
  "AI Decision View":      ["M", "M", "V", "V", "V", "V", "V"],
  "Credit Risk Manage":    ["M", "M", "V", "V", "V", "X", "V"],
  "Fraud Manage":          ["X", "X", "X", "V", "V", "M", "V"],
  "Reports Export":        ["M", "M", "V", "V", "M", "V", "V"],
  "Users Manage":          ["X", "X", "X", "X", "X", "X", "M"],
  "Settings Manage":       ["X", "X", "V", "X", "V", "X", "M"],
};

const API_KEYS = [
  { id: "KEY-001", name: "Pipeline Ingest",      owner: "Samuel Osei",      scopes: ["pipelines:read", "pipelines:write"], created: "2026-01-12", lastUsed: "10m ago",  status: "active"   as const },
  { id: "KEY-002", name: "Reporting Connector",  owner: "Amara Diallo",     scopes: ["reports:read"],                     created: "2026-03-04", lastUsed: "2h ago",   status: "active"   as const },
  { id: "KEY-003", name: "Legacy ETL Bridge",    owner: "David Mensah",     scopes: ["integrations:read", "mapping:read"],created: "2025-11-20", lastUsed: "14d ago",  status: "inactive" as const },
];

const AUDIT_LOGS = [
  { id: "EVT-001", ts: "2026-06-25 09:42:11", actor: "jp@fdi.org",          action: "USER_LOGIN",          object: "USR-004",       ip: "41.215.12.88",  status: "active"   as const },
  { id: "EVT-002", ts: "2026-06-25 09:38:04", actor: "amara@fdi.org",       action: "DATA_ACCESS",         object: "RPT-2026-Q2",   ip: "41.215.12.91",  status: "active"   as const },
  { id: "EVT-003", ts: "2026-06-25 09:15:33", actor: "jp@fdi.org",          action: "CONFIG_CHANGE",       object: "USR-005 (MFA)", ip: "41.215.12.88",  status: "warning"  as const },
  { id: "EVT-004", ts: "2026-06-25 08:50:17", actor: "samuel@fdi.org",      action: "USER_LOGIN",          object: "USR-002",       ip: "196.44.78.22",  status: "active"   as const },
  { id: "EVT-005", ts: "2026-06-25 08:22:49", actor: "fatima@partner.org",  action: "EXPORT",              object: "COMP-RPT-44",   ip: "212.58.100.5",  status: "active"   as const },
  { id: "EVT-006", ts: "2026-06-24 17:05:02", actor: "jp@fdi.org",          action: "ROLE_CHANGE",         object: "USR-006",       ip: "41.215.12.88",  status: "warning"  as const },
  { id: "EVT-007", ts: "2026-06-24 14:33:58", actor: "aisha@fdi.org",       action: "USER_LOGIN",          object: "USR-005",       ip: "41.215.14.03",  status: "active"   as const },
  { id: "EVT-008", ts: "2026-06-24 11:18:27", actor: "SYSTEM",              action: "API_KEY_ROTATE",      object: "KEY-001",       ip: "internal",      status: "active"   as const },
];

const TABS = [
  { id: "users",     label: "Users",      icon: Shield },
  { id: "roles",     label: "Roles",      icon: Lock },
  { id: "apikeys",   label: "API Keys",   icon: Key },
  { id: "sessions",  label: "Sessions",   icon: Monitor },
  { id: "audit",     label: "Audit Logs", icon: ClipboardList },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function MfaIndicator({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: "var(--ok)" }}>
      <ShieldCheck className="h-3.5 w-3.5" />
      On
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: "var(--warn)" }}>
      <ShieldAlert className="h-3.5 w-3.5" />
      Off
    </span>
  );
}

function PermCell({ cap }: { cap: "M" | "V" | "X" }) {
  if (cap === "M") return (
    <td className="px-3 py-2.5 text-center">
      <span className="inline-flex items-center justify-center gap-0.5">
        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--ok)" }} />
        <span className="text-[10px] font-mono font-medium" style={{ color: "var(--ok)" }}>M</span>
      </span>
    </td>
  );
  if (cap === "V") return (
    <td className="px-3 py-2.5 text-center">
      <CheckCircle2 className="h-4 w-4 mx-auto" style={{ color: "var(--primary-500)", opacity: 0.6 }} />
    </td>
  );
  return (
    <td className="px-3 py-2.5 text-center">
      <Lock className="h-3.5 w-3.5 mx-auto" style={{ color: "var(--neutral-300)" }} />
    </td>
  );
}

// ─── TABS CONTENT ─────────────────────────────────────────────────────────────

function UsersTab() {
  const [search, setSearch] = useState("");
  const filtered = USERS_DATA.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SectionCard noPad>
      {/* Search + bulk actions bar */}
      <div
        className="px-4 py-3 flex flex-wrap items-center gap-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--neutral-400)" }} />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, role…"
            className="w-full h-9 pl-9 pr-3 rounded-md text-sm focus:outline-none focus:ring-2"
            style={{
              border: "1px solid var(--border)",
              backgroundColor: "var(--paper)",
              color: "var(--neutral-900)",
              focusRingColor: "var(--primary-500)",
            }}
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <SecondaryButton icon={<ChevronDown className="h-3.5 w-3.5" />}>Bulk Actions</SecondaryButton>
          <SecondaryButton>
            <span className="text-[12px] font-mono" style={{ color: "var(--neutral-500)" }}>
              {filtered.length} of {USERS_DATA.length} users
            </span>
          </SecondaryButton>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
            <tr>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Name</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Email</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Role</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Institution</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Status</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Last Login</th>
              <th className="text-center px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>MFA</th>
              <th className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr
                key={u.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                }}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-7 w-7 rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0"
                      style={{ backgroundColor: "var(--primary-500)" }}
                    >
                      {u.name.charAt(0)}
                    </div>
                    <span className="font-medium text-[13px]" style={{ color: "var(--neutral-900)" }}>{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-500)" }}>{u.email}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neutral-700)" }}>{u.role}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block rounded px-2 py-0.5 text-[11px] font-mono"
                    style={{
                      backgroundColor: u.institution === "External" || u.institution === "RegBody"
                        ? "var(--ai-bg)" : "var(--neutral-100)",
                      color: u.institution === "External" || u.institution === "RegBody"
                        ? "var(--ai)" : "var(--neutral-700)",
                    }}
                  >
                    {u.institution}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.status === "active"
                    ? <StatusBadge status="active" />
                    : <StatusBadge status="draft">Inactive</StatusBadge>
                  }
                </td>
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-500)" }}>{u.login}</td>
                <td className="px-4 py-3 text-center">
                  <MfaIndicator enabled={u.mfa} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      aria-label="Edit user"
                      className="h-7 w-7 rounded grid place-items-center transition-colors"
                      style={{ color: "var(--neutral-400)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--primary-500)"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-50)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--neutral-400)"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label="Revoke user"
                      className="h-7 w-7 rounded grid place-items-center transition-colors"
                      style={{ color: "var(--neutral-400)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--fail)"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--fail-bg)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--neutral-400)"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label="More options"
                      className="h-7 w-7 rounded grid place-items-center transition-colors"
                      style={{ color: "var(--neutral-400)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--neutral-700)"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--neutral-100)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--neutral-400)"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function RolesTab() {
  return (
    <SectionCard
      title="Permission Matrix"
      action={<PrimaryButton icon={<Shield className="h-4 w-4" />}>Create Role</PrimaryButton>}
    >
      <div className="overflow-x-auto -mx-5 px-0">
        <table className="w-full text-sm" style={{ minWidth: "760px" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              <th
                className="text-left px-5 py-3 text-[11px] font-medium uppercase tracking-wide sticky left-0"
                style={{ color: "var(--neutral-500)", backgroundColor: "var(--card)", minWidth: "200px" }}
              >
                Capability
              </th>
              {ROLE_COLS.map(r => (
                <th
                  key={r}
                  className="px-3 py-3 text-[11px] font-medium text-center"
                  style={{ color: "var(--neutral-700)", minWidth: "92px" }}
                >
                  <div style={{ writingMode: "horizontal-tb" }} className="leading-tight">
                    {r}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((cap, i) => (
              <tr
                key={cap}
                style={{
                  borderBottom: "1px solid var(--border)",
                  backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                }}
              >
                <td
                  className="px-5 py-2.5 text-[13px] font-medium sticky left-0"
                  style={{ color: "var(--neutral-700)", backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--neutral-50)" }}
                >
                  {cap}
                </td>
                {(PERM_MATRIX[cap] ?? []).map((perm, j) => (
                  <PermCell key={j} cap={perm} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 pt-4 pb-1 flex items-center gap-5 text-[11px]" style={{ color: "var(--neutral-500)" }}>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--ok)" }} />
            <span className="font-mono" style={{ color: "var(--ok)" }}>M</span> Manage
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--primary-500)", opacity: 0.6 }} />
            View only
          </span>
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" style={{ color: "var(--neutral-300)" }} />
            Restricted
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

function ApiKeysTab() {
  const [revealed, setRevealed] = useState<string | null>(null);

  return (
    <SectionCard
      title="API Keys"
      action={<PrimaryButton icon={<Key className="h-4 w-4" />}>Generate Key</PrimaryButton>}
      noPad
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
            <tr>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Key Name</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Owner</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Scopes</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Created</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Last Used</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Status</th>
              <th className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {API_KEYS.map((k, i) => (
              <tr
                key={k.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                }}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-[13px]" style={{ color: "var(--neutral-900)" }}>{k.name}</div>
                  <div
                    className="font-mono text-[11px] mt-0.5 flex items-center gap-1.5"
                    style={{ color: "var(--neutral-400)" }}
                  >
                    {revealed === k.id ? "sk_live_••••••••••••••••abcd1234" : "sk_live_••••••••••••••••••••••••"}
                    <button
                      onClick={() => setRevealed(revealed === k.id ? null : k.id)}
                      className="hover:opacity-80 transition-opacity"
                      aria-label={revealed === k.id ? "Hide key" : "Reveal key"}
                    >
                      {revealed === k.id
                        ? <EyeOff className="h-3 w-3" />
                        : <Eye className="h-3 w-3" />
                      }
                    </button>
                    <button aria-label="Copy key" className="hover:opacity-80 transition-opacity">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neutral-700)" }}>{k.owner}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map(s => (
                      <span
                        key={s}
                        className="inline-block font-mono text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "var(--info-bg)", color: "var(--info)" }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-500)" }}>{k.created}</td>
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-500)" }}>{k.lastUsed}</td>
                <td className="px-4 py-3">
                  {k.status === "active"
                    ? <StatusBadge status="active" />
                    : <StatusBadge status="draft">Inactive</StatusBadge>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      aria-label="Rotate key"
                      className="h-7 w-7 rounded grid place-items-center transition-colors"
                      style={{ color: "var(--neutral-400)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--primary-500)"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-50)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--neutral-400)"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label="Revoke key"
                      className="h-7 w-7 rounded grid place-items-center transition-colors"
                      style={{ color: "var(--neutral-400)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--fail)"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--fail-bg)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--neutral-400)"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label="More options"
                      className="h-7 w-7 rounded grid place-items-center transition-colors"
                      style={{ color: "var(--neutral-400)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--neutral-700)"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--neutral-100)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--neutral-400)"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function SessionsTab() {
  const SESSIONS = [
    { user: "Jean-Pierre M.",   email: "jp@fdi.org",         ip: "41.215.12.88",  location: "Accra, GH",     device: "Chrome 124 / macOS", started: "2h ago",  active: true  },
    { user: "Amara Diallo",     email: "amara@fdi.org",      ip: "41.215.12.91",  location: "Accra, GH",     device: "Firefox 125 / Win",  started: "10m ago", active: true  },
    { user: "Samuel Osei",      email: "samuel@fdi.org",     ip: "196.44.78.22",  location: "Kumasi, GH",    device: "Safari / iOS 17",    started: "2h ago",  active: true  },
    { user: "Maria Santos",     email: "maria@regulator.gov",ip: "212.58.100.5",  location: "Lagos, NG",     device: "Chrome 123 / Linux", started: "3h ago",  active: false },
    { user: "Fatima Al-Rashid", email: "fatima@partner.org", ip: "41.75.188.12",  location: "Nairobi, KE",   device: "Edge 124 / Win",     started: "1d ago",  active: false },
  ];

  return (
    <SectionCard
      title="Active Sessions"
      action={
        <SecondaryButton icon={<XCircle className="h-4 w-4" />}>Revoke All</SecondaryButton>
      }
      noPad
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
            <tr>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>User</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>IP Address</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Location</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Device / Browser</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Started</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>State</th>
              <th className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {SESSIONS.map((s, i) => (
              <tr
                key={s.email}
                style={{
                  borderBottom: "1px solid var(--border)",
                  backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                }}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-[13px]" style={{ color: "var(--neutral-900)" }}>{s.user}</div>
                  <div className="font-mono text-[11px]" style={{ color: "var(--neutral-400)" }}>{s.email}</div>
                </td>
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-600)" }}>{s.ip}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neutral-700)" }}>{s.location}</td>
                <td className="px-4 py-3 text-[12px]" style={{ color: "var(--neutral-600)" }}>{s.device}</td>
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-500)" }}>{s.started}</td>
                <td className="px-4 py-3">
                  {s.active
                    ? <StatusBadge status="running">Active</StatusBadge>
                    : <StatusBadge status="draft">Expired</StatusBadge>
                  }
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="text-[12px] font-medium transition-colors px-2 py-1 rounded"
                    style={{ color: "var(--fail)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--fail-bg)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function AuditLogsTab() {
  const [actor, setActor] = useState("");
  const [actionType, setActionType] = useState("all");

  const filtered = AUDIT_LOGS.filter(e => {
    const matchActor = !actor || e.actor.toLowerCase().includes(actor.toLowerCase());
    const matchAction = actionType === "all" || e.action.startsWith(actionType);
    return matchActor && matchAction;
  });

  const actionColor = (action: string) => {
    if (action.includes("LOGIN")) return { color: "var(--info)", bg: "var(--info-bg)" };
    if (action.includes("CHANGE") || action.includes("CONFIG")) return { color: "var(--warn)", bg: "var(--warn-bg)" };
    if (action.includes("ROLE")) return { color: "var(--ai)", bg: "var(--ai-bg)" };
    if (action.includes("EXPORT")) return { color: "var(--ok)", bg: "var(--ok-bg)" };
    return { color: "var(--neutral-500)", bg: "var(--neutral-100)" };
  };

  return (
    <SectionCard noPad>
      {/* Filter row */}
      <div
        className="px-4 py-3 flex flex-wrap items-center gap-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-mono uppercase tracking-wide" style={{ color: "var(--neutral-400)" }}>
            Actor
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--neutral-400)" }} />
            <input
              type="text"
              value={actor}
              onChange={e => setActor(e.target.value)}
              placeholder="Filter by actor…"
              className="h-8 pl-8 pr-3 rounded-md text-[13px] focus:outline-none w-48"
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--paper)",
                color: "var(--neutral-900)",
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-mono uppercase tracking-wide" style={{ color: "var(--neutral-400)" }}>
            Action
          </label>
          <select
            value={actionType}
            onChange={e => setActionType(e.target.value)}
            className="h-8 px-3 rounded-md text-[13px] focus:outline-none"
            style={{
              border: "1px solid var(--border)",
              backgroundColor: "var(--paper)",
              color: "var(--neutral-900)",
            }}
          >
            <option value="all">All actions</option>
            <option value="USER_LOGIN">Login</option>
            <option value="DATA_ACCESS">Data Access</option>
            <option value="CONFIG">Config Change</option>
            <option value="ROLE">Role Change</option>
            <option value="EXPORT">Export</option>
            <option value="API_KEY">API Key</option>
          </select>
        </div>
        <span className="ml-auto font-mono text-[11px]" style={{ color: "var(--neutral-400)" }}>
          {filtered.length} events
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
            <tr>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Timestamp</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Actor</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Action</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Object</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>IP Address</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neutral-500)" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => {
              const ac = actionColor(e.action);
              return (
                <tr
                  key={e.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                  }}
                >
                  <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap" style={{ color: "var(--neutral-500)" }}>
                    {e.ts}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-700)" }}>
                    {e.actor}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block font-mono text-[11px] px-2 py-0.5 rounded font-medium"
                      style={{ backgroundColor: ac.bg, color: ac.color }}
                    >
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-600)" }}>
                    {e.object}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--neutral-500)" }}>
                    {e.ip}
                  </td>
                  <td className="px-4 py-3">
                    {e.status === "warning"
                      ? <StatusBadge status="warning" />
                      : <StatusBadge status="active">OK</StatusBadge>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div
        className="px-4 py-2.5 flex items-center gap-2 text-[11px] font-mono"
        style={{ borderTop: "1px solid var(--border)", color: "var(--neutral-400)" }}
      >
        <AlertTriangle className="h-3 w-3" style={{ color: "var(--warn)" }} />
        Append-only audit trail · SYS-10 · NFR-SEC-04
      </div>
    </SectionCard>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

function Users() {
  const { role } = useRole();
  const [activeTab, setActiveTab] = useState<TabId>("users");

  if (!canManage(role, "users")) {
    return (
      <AppShell title="Users & Security" breadcrumb="ADMIN › USERS">
        <div
          className="max-w-md mx-auto mt-12 rounded-lg p-8 text-center"
          style={{ border: "1px solid var(--border)", backgroundColor: "var(--card)" }}
        >
          <div
            className="mx-auto h-12 w-12 rounded-full grid place-items-center mb-4"
            style={{ backgroundColor: "var(--fail-bg)", color: "var(--fail)" }}
          >
            <Lock className="h-5 w-5" />
          </div>
          <h2 className="font-semibold text-lg mb-1" style={{ color: "var(--neutral-900)" }}>
            Permission required
          </h2>
          <p className="text-sm" style={{ color: "var(--neutral-500)" }}>
            This module is restricted to Administrators.
          </p>
          <div className="mt-4 font-mono text-[11px]" style={{ color: "var(--neutral-400)" }}>
            SYS-09 · NFR-SEC-04 · role=<span style={{ color: "var(--fail)" }}>{role}</span> · required=admin
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Users & Security"
      breadcrumb="ADMIN › USERS"
      scope="Org-wide"
      primaryAction={
        canManage(role, "users")
          ? <PrimaryButton icon={<UserPlus className="h-4 w-4" />}>Add User</PrimaryButton>
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {/* Tab bar */}
        <div
          className="flex items-end gap-0 overflow-x-auto"
          style={{
            borderBottom: "1px solid var(--border)",
          }}
          role="tablist"
          aria-label="User administration sections"
        >
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className="inline-flex items-center gap-2 px-4 pb-3 pt-1 text-[13px] font-medium transition-colors relative shrink-0"
                style={{
                  color: isActive ? "var(--primary-500)" : "var(--neutral-500)",
                  borderBottom: isActive ? "2px solid var(--primary-500)" : "2px solid transparent",
                  marginBottom: "-1px",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--neutral-700)";
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--neutral-500)";
                }}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        {activeTab === "users"    && <UsersTab />}
        {activeTab === "roles"    && <RolesTab />}
        {activeTab === "apikeys"  && <ApiKeysTab />}
        {activeTab === "sessions" && <SessionsTab />}
        {activeTab === "audit"    && <AuditLogsTab />}
      </div>
    </AppShell>
  );
}
