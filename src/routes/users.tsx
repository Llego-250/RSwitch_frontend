import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { AuditLogTable } from "@/components/AuditLogTable";
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useParticipants } from "@/lib/queries";
import type { BackendRole, UserRow } from "@/lib/types";
import { useState } from "react";
import {
  UserPlus, Key, Monitor, ClipboardList, Lock, Shield, Trash2, Edit2,
  MoreHorizontal, CheckCircle2, XCircle, Search, ChevronDown, AlertTriangle,
  ShieldCheck, ShieldAlert, RefreshCw, Copy, Eye, EyeOff, X,
} from "lucide-react";

export const Route = createFileRoute("/users")({
  component: Users,
});

const ROLE_OPTIONS: { value: BackendRole; label: string }[] = [
  { value: "Compliance", label: "Compliance User" },
  { value: "Business", label: "Business User" },
  { value: "Board", label: "Board Viewer" },
  { value: "Technical / Admin", label: "Technical / Admin User" },
  { value: "Participant", label: "Participant (institution login)" },
];

function lastLogin(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso + (iso.endsWith("Z") ? "" : "Z")).toLocaleString();
}

function Users() {
  const { role } = useRole();
  const { user: me } = useAuth();
  const canManageUsers = canManage(role, "users");
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users"), enabled: canManageUsers });
  const participants = useParticipants();
  const users = usersQuery.data ?? [];

  const [search, setSearch]               = useState("");
  const [activeTab, setActiveTab]         = useState<"users" | "audit">("users");
  const [error, setError]                 = useState<string | null>(null);
  const [tempPassword, setTempPassword]   = useState<{ email: string; password: string } | null>(null);

  // Create-user modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail]         = useState("");
  const [inviteName, setInviteName]           = useState("");
  const [inviteRole, setInviteRole]           = useState<BackendRole>("Compliance");
  const [inviteParticipant, setInviteParticipant] = useState<number | "">("");
  const [emailError, setEmailError]           = useState<string | null>(null);

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["users"] });
  const onError = (e: unknown) => setError(errorMessage(e));

  const createUser = useMutation({
    mutationFn: () =>
      api.post<UserRow & { temporary_password: string }>("/users", {
        email: inviteEmail,
        full_name: inviteName,
        role: inviteRole,
        participant_id: inviteRole === "Participant" ? inviteParticipant || null : null,
      }),
    onSuccess: (u) => {
      refresh();
      setTempPassword({ email: u.email, password: u.temporary_password });
      setInviteEmail("");
      setInviteName("");
    },
    onError: (e) => setEmailError(errorMessage(e)),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: BackendRole; is_active?: boolean }) => api.patch<UserRow>(`/users/${id}`, body),
    onSuccess: refresh,
    onError,
  });

  const resetPassword = useMutation({
    mutationFn: (u: UserRow) => api.post<{ temporary_password: string }>(`/users/${u.id}/reset-password`).then((r) => ({ ...r, email: u.email })),
    onSuccess: (r) => setTempPassword({ email: r.email, password: r.temporary_password }),
    onError,
  });

  function handleSendInvite() {
    setEmailError(null);
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(inviteEmail)) {
      setEmailError("Enter a valid email address (e.g. user@domain.com).");
      return;
    }
    if (!inviteName.trim()) {
      setEmailError("Enter the user's full name.");
      return;
    }
    createUser.mutate();
  }

  return (
    <AppShell
      title="Users & Security"
      subtitle="Access Control & Audit Logs"
      breadcrumb="ADMIN › USERS & SECURITY"
      scope="Technical Administration"
      primaryAction={
        canManageUsers ? (
          <PrimaryButton icon={<UserPlus className="h-4 w-4" />} onClick={() => { setShowInviteModal(true); setTempPassword(null); setEmailError(null); }}>
            Add New User
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("users")}
              className={`h-8 px-4 rounded-xl text-xs font-sans font-semibold border cursor-pointer ${
                activeTab === "users" ? "bg-[#168FA8] text-white border-[#168FA8]" : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
              }`}
            >
              Users Directory ({users.length})
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`h-8 px-4 rounded-xl text-xs font-sans font-semibold border cursor-pointer ${
                activeTab === "audit" ? "bg-[#168FA8] text-white border-[#168FA8]" : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
              }`}
            >
              Audit Log Register
            </button>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            REQ-USR-003: User Deactivation Preserves Audit History
          </span>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 flex justify-between">
          {error}
          <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}
      {tempPassword && !showInviteModal && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 flex justify-between items-center">
          <span>
            One-time password for <b>{tempPassword.email}</b>: <code className="font-mono font-bold">{tempPassword.password}</code> — share it securely; it won't be shown again.
          </span>
          <button onClick={() => setTempPassword(null)}><X className="h-4 w-4" /></button>
        </div>
      )}
      {!canManageUsers && activeTab === "users" && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          User administration is limited to Technical / Admin users.
        </div>
      )}
      {activeTab === "users" ? (
        <div className="space-y-6">
          {/* User Table (§5.13 REQ-USR-005) */}
          <SectionCard title="User Accounts" noPad>
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
                  {usersQuery.isLoading && canManageUsers && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400 font-sans">Loading…</td></tr>
                  )}
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-sans font-bold text-slate-900 dark:text-white">{u.full_name || "—"}</td>
                      <td className="px-4 py-3 text-[#168FA8]">{u.email}</td>
                      <td className="px-4 py-3 font-sans font-medium text-slate-700 dark:text-slate-300">
                        {u.role}
                        {u.participant_id && <span className="text-slate-400"> · #{u.participant_id}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.is_active ? (u.last_login_at ? "bg-emerald-100 text-emerald-700" : "bg-[#E7F5F8] text-[#168FA8]") : "bg-slate-200 text-slate-600"
                        }`}>
                          {u.is_active ? (u.last_login_at ? "active" : "invited") : "inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">{u.mfa_enabled ? <span className="text-emerald-500 font-bold">Enabled</span> : <span className="text-slate-400">Off</span>}</td>
                      <td className="px-4 py-3 text-slate-500">{lastLogin(u.last_login_at)}</td>
                      <td className="px-4 py-3 font-sans">
                        <div className="flex items-center gap-2">
                          {canManageUsers && u.id !== me?.id && (
                            <>
                              {u.is_active && (
                                <select
                                  value={u.role}
                                  onChange={(e) => updateUser.mutate({ id: u.id, role: e.target.value as BackendRole })}
                                  className="h-7 px-2 text-[11px] rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-mono"
                                >
                                  {ROLE_OPTIONS.filter((r) => r.value !== "Participant" || u.participant_id).map((r) => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                  ))}
                                </select>
                              )}
                              <button
                                onClick={() => resetPassword.mutate(u)}
                                className="text-[#168FA8] hover:underline text-[11px] font-semibold cursor-pointer"
                                title="Issue a one-time password and clear 2FA"
                              >
                                Reset
                              </button>
                              <button
                                onClick={() => updateUser.mutate({ id: u.id, is_active: !u.is_active })}
                                className={`${u.is_active ? "text-red-500" : "text-emerald-600"} hover:underline text-[11px] font-semibold cursor-pointer`}
                                title="Deactivation keeps the account and its audit history"
                              >
                                {u.is_active ? "Deactivate" : "Reactivate"}
                              </button>
                            </>
                          )}
                          {u.id === me?.id && <span className="text-[11px] text-slate-400">You</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Password Validation Rules Display (§11.1) */}
          <SectionCard title="Security Policies">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">Minimum Length</span>
                <span className="text-[#168FA8]">Set in Settings → Security (default 12)</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">Two-Factor</span>
                <span className="text-slate-600 dark:text-slate-300">TOTP authenticator + single-use recovery codes</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">Deactivation</span>
                <span className="text-amber-500">Blocks sign-in; audit history is kept</span>
              </div>
            </div>
          </SectionCard>
        </div>
      ) : (
        /* Audit Log Register Tab (§5.13 REQ-USR-006) */
        <AuditLogTable canExport={canManageUsers} />
      )}

      {/* Invite User Modal (§5.13 REQ-USR-001, REQ-USR-002) */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">Add New User</h2>
              <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!tempPassword ? (
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
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="mkwizera@rswitch.rw"
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as BackendRole)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  >
                    {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                {inviteRole === "Participant" && (
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Institution</label>
                    <select
                      value={inviteParticipant}
                      onChange={(e) => setInviteParticipant(e.target.value ? Number(e.target.value) : "")}
                      className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                    >
                      <option value="">Select participant…</option>
                      {participants.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
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
                    <CheckCircle2 className="h-4 w-4" /> Account created for {tempPassword.email}
                  </div>
                  <p>One-time password (shown once — share it securely, the user should change it after signing in):</p>
                  <p className="text-sm font-mono font-bold select-all">{tempPassword.password}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowInviteModal(false)}>Close</SecondaryButton>
              {!tempPassword && (
                <PrimaryButton onClick={handleSendInvite} disabled={createUser.isPending}>
                  {createUser.isPending ? "Creating…" : "Create Account"}
                </PrimaryButton>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
