import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { canManage, type Role } from "@/lib/roles";
import { useState } from "react";
import {
  UserPlus, Key, Monitor, ClipboardList, Lock, Shield, Trash2, Edit2,
  MoreHorizontal, CheckCircle2, XCircle, Search, ChevronDown, AlertTriangle,
  ShieldCheck, ShieldAlert, RefreshCw, Copy, Eye, EyeOff, X,
} from "lucide-react";

export const Route = createFileRoute("/users")({
  component: Users,
});

type UserStatus = "active" | "inactive" | "invited";

type UserEntry = {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  status: UserStatus;
  login: string;
  mfa: boolean;
};

const INITIAL_USERS: UserEntry[] = [
  { id: "USR-001", name: "Aline Uwamahoro", email: "aline@rswitch.rw", role: "compliance", roleLabel: "Compliance User", status: "active", login: "10m ago", mfa: true },
  { id: "USR-002", name: "Jean-Paul Nshimiyimana", email: "jp.nshimi@rswitch.rw", role: "business", roleLabel: "Business User", status: "active", login: "2h ago", mfa: true },
  { id: "USR-003", name: "Eric Manzi", email: "eric.m@rswitch.rw", role: "technical", roleLabel: "Technical / Admin User", status: "active", login: "5h ago", mfa: true },
  { id: "USR-004", name: "Clarisse Gasana", email: "cgasana@rswitch.rw", role: "compliance", roleLabel: "Compliance User", status: "invited", login: "Never (Pending 48h)", mfa: false },
  { id: "USR-005", name: "Patrick Habimana", email: "phabimana@rswitch.rw", role: "business", roleLabel: "Business User", status: "inactive", login: "14d ago", mfa: true },
];

type AuditEvent = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  object: string;
  ip: string;
  status: "active" | "warning";
};

const AUDIT_LOGS: AuditEvent[] = [
  { id: "EVT-001", ts: "2026-07-24 12:04:11", actor: "eric.m@rswitch.rw", action: "USER_INVITE", object: "cgasana@rswitch.rw", ip: "197.243.12.88", status: "active" },
  { id: "EVT-002", ts: "2026-07-24 11:30:04", actor: "aline@rswitch.rw", action: "SUBMISSION_REVIEW", object: "SUB-102 (Approved)", ip: "197.243.12.91", status: "active" },
  { id: "EVT-003", ts: "2026-07-24 10:15:33", actor: "eric.m@rswitch.rw", action: "ROLE_CHANGE", object: "USR-005 (Deactivated)", ip: "197.243.12.88", status: "warning" },
  { id: "EVT-004", ts: "2026-07-24 09:12:00", actor: "jp.nshimi@rswitch.rw", action: "REPORT_GENERATE", object: "RPT-001 (PDF)", ip: "197.243.14.02", status: "active" },
];

function Users() {
  const { role } = useRole();
  const canManageUsers = canManage(role, "users");

  const [users, setUsers]                 = useState<UserEntry[]>(INITIAL_USERS);
  const [search, setSearch]               = useState("");
  const [activeTab, setActiveTab]         = useState<"users" | "audit">("users");

  // Invite Modal State (§5.13 REQ-USR-001, REQ-USR-002)
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail]         = useState("");
  const [inviteName, setInviteName]           = useState("");
  const [inviteRole, setInviteRole]           = useState<Role>("compliance");
  const [inviteLink, setInviteLink]           = useState<string | null>(null);
  const [emailError, setEmailError]           = useState<string | null>(null);

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.roleLabel.toLowerCase().includes(search.toLowerCase())
  );

  // RFC 5322 Email Validation (§11.2)
  function validateEmail(emailStr: string): boolean {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(emailStr);
  }

  function handleSendInvite() {
    setEmailError(null);
    if (!validateEmail(inviteEmail)) {
      setEmailError("Rule §11.2 Violation: Must match RFC 5322 valid email format (e.g. user@domain.com).");
      return;
    }
    if (!inviteName) return;

    const roleLabelMap: Record<Role, string> = {
      compliance: "Compliance User",
      business: "Business User",
      technical: "Technical / Admin User",
    };

    const newUser: UserEntry = {
      id: `USR-00${users.length + 1}`,
      name: inviteName,
      email: inviteEmail,
      role: inviteRole,
      roleLabel: roleLabelMap[inviteRole],
      status: "invited",
      login: "Never (Pending 48h)",
      mfa: false,
    };

    setUsers([newUser, ...users]);
    setInviteLink(`https://rdip.rswitch.rw/register?token=inv_${Date.now()}`);
  }

  function handleDeactivate(id: string) {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: "inactive" } : u))
    );
  }

  function handleChangeRole(id: string, newR: Role) {
    const roleLabelMap: Record<Role, string> = {
      compliance: "Compliance User",
      business: "Business User",
      technical: "Technical / Admin User",
    };
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, role: newR, roleLabel: roleLabelMap[newR] } : u))
    );
  }

  return (
    <AppShell
      title="User Management & Audit Trail (§5.13)"
      breadcrumb="ADMIN › USERS & SECURITY"
      scope="Technical Administration"
      primaryAction={
        canManageUsers ? (
          <PrimaryButton icon={<UserPlus className="h-4 w-4" />} onClick={() => { setShowInviteModal(true); setInviteLink(null); }}>
            Invite New User
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("users")}
              className={`h-8 px-4 rounded-lg text-xs font-semibold border cursor-pointer ${
                activeTab === "users" ? "bg-[#56B4D3] text-[#092E3D] border-[#56B4D3]" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
            >
              Users Directory ({users.length})
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`h-8 px-4 rounded-lg text-xs font-semibold border cursor-pointer ${
                activeTab === "audit" ? "bg-[#56B4D3] text-[#092E3D] border-[#56B4D3]" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
            >
              Audit Log Register ({AUDIT_LOGS.length})
            </button>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            REQ-USR-003: User Deactivation Preserves Audit History
          </span>
        </div>
      }
    >
      {activeTab === "users" ? (
        <div className="space-y-6">
          {/* User Table (§5.13 REQ-USR-005) */}
          <SectionCard title="Registered User Accounts (§5.13 REQ-USR-005)" noPad>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search user name or email…"
                  className="h-8 pl-8 pr-3 rounded-lg text-xs w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    {["User Name", "Email Address", "Assigned Role", "Account Status", "MFA", "Last Login", "Actions"].map((col) => (
                      <th key={col} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-sans font-bold text-slate-900 dark:text-white">{u.name}</td>
                      <td className="px-4 py-3 text-[#56B4D3]">{u.email}</td>
                      <td className="px-4 py-3 font-sans font-medium text-slate-700 dark:text-slate-300">{u.roleLabel}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === "active" ? "bg-emerald-100 text-emerald-700" : u.status === "invited" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{u.mfa ? <span className="text-emerald-500 font-bold">Enabled</span> : <span className="text-slate-400">Pending</span>}</td>
                      <td className="px-4 py-3 text-slate-500">{u.login}</td>
                      <td className="px-4 py-3 font-sans">
                        <div className="flex items-center gap-2">
                          {canManageUsers && u.status === "active" && (
                            <>
                              <select
                                value={u.role}
                                onChange={(e) => handleChangeRole(u.id, e.target.value as Role)}
                                className="h-7 px-2 text-[11px] rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-mono"
                              >
                                <option value="compliance">Compliance User</option>
                                <option value="business">Business User</option>
                                <option value="technical">Technical / Admin User</option>
                              </select>
                              <button
                                onClick={() => handleDeactivate(u.id)}
                                className="text-red-500 hover:underline text-[11px] font-semibold cursor-pointer"
                                title="Deactivate without deleting (§5.13 REQ-USR-003)"
                              >
                                Deactivate
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Password Validation Rules Display (§11.1) */}
          <SectionCard title="Password Complexity Security Policies (§11.1)">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">Minimum Length</span>
                <span className="text-[#56B4D3]">At least 12 characters</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">Character Types</span>
                <span className="text-slate-600 dark:text-slate-300">1 Upper, 1 Lower, 1 Digit, 1 Special (!@#$%^&*)</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">Password Reuse</span>
                <span className="text-amber-500">Cannot match last 5 passwords</span>
              </div>
            </div>
          </SectionCard>
        </div>
      ) : (
        /* Audit Log Register Tab (§5.13 REQ-USR-006) */
        <SectionCard title="User Management & System Audit Log Register (REQ-USR-006)" noPad>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {["Event ID", "Timestamp", "Actor User", "Action Type", "Object Reference", "IP Address"].map((col) => (
                    <th key={col} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {AUDIT_LOGS.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-bold text-[#56B4D3]">{evt.id}</td>
                    <td className="px-4 py-3 text-slate-500">{evt.ts}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-sans font-medium">{evt.actor}</td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{evt.action}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{evt.object}</td>
                    <td className="px-4 py-3 text-slate-400">{evt.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Invite User Modal (§5.13 REQ-USR-001, REQ-USR-002) */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Invite New User (§5.13 REQ-USR-001)</h2>
              <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!inviteLink ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Marie Kwizera"
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Address (RFC 5322 Format — §11.2)
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="mkwizera@rswitch.rw"
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Assigned SRS Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="compliance">Compliance User (Monitors compliance, deadlines & incidents)</option>
                    <option value="business">Business User (Reviews reports, AI insights & inclusion analytics)</option>
                    <option value="technical">Technical / Admin User (Manages integrations, pipelines & settings)</option>
                  </select>
                </div>

                {emailError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 text-red-600 font-semibold text-xs">
                    {emailError}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-700 dark:text-emerald-300 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Invitation Link Generated (Expires in 48h — REQ-USR-002)
                  </div>
                  <p className="text-[11px] font-mono break-all">{inviteLink}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowInviteModal(false)}>Close</SecondaryButton>
              {!inviteLink && (
                <PrimaryButton onClick={handleSendInvite}>Send Invitation Email</PrimaryButton>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
