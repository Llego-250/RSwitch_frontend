import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { AuditLogTable } from "@/components/AuditLogTable";
import { RoleAssignmentModal, BACKEND_ROLE } from "@/components/RoleAssignmentModal";
import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/context/RoleContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, errorMessage, fieldErrors } from "@/lib/api";
import { useUsers } from "@/lib/queries";
import { ROLES, hasCap } from "@/lib/roles";
import type { BackendRole, UserRow, UserStatus } from "@/lib/types";
import { useState } from "react";
import { UserPlus, Search, X, CheckCircle2, Lock, Mail } from "lucide-react";

// SRS §5.13 (REQ-USR-001..006), §19.7. Technical/Admin only (users.manage).
export const Route = createFileRoute("/users")({
  component: Users,
});

const STATUS_STYLE: Record<UserStatus, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Invited: "bg-[#E7F5F8] text-[#168FA8]",
  Inactive: "bg-slate-200 text-slate-600",
};

function when(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso + (iso.endsWith("Z") ? "" : "Z")).toLocaleString();
}

type Confirm = {
  title: string;
  body: string;
  action: string;
  danger?: boolean;
  run: () => Promise<unknown>;
};

function Users() {
  const { role } = useRole();
  const { user: me } = useAuth();
  const canManageUsers = hasCap(role, "users.manage");
  const queryClient = useQueryClient();
  const usersQuery = useUsers(canManageUsers);
  const users = usersQuery.data ?? [];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | UserStatus>("");
  const [activeTab, setActiveTab] = useState<"users" | "audit">("users");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Invite modal (REQ-USR-001/002)
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<BackendRole>("Compliance");
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invited, setInvited] = useState<UserRow | null>(null);

  const term = search.trim().toLowerCase();
  const filteredUsers = users.filter(
    (u) =>
      (!statusFilter || u.status === statusFilter) &&
      (!term ||
        u.full_name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term)),
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["users"] });

  const act = (p: Promise<unknown>, done?: string) =>
    p
      .then(() => {
        refresh();
        if (done) setNotice(done);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));

  const invite = useMutation({
    mutationFn: () =>
      api.post<UserRow>("/users/invite", {
        email: inviteEmail.trim(),
        full_name: inviteName.trim(),
        role: inviteRole,
      }),
    onSuccess: (u) => {
      refresh();
      setInvited(u);
      setInviteEmail("");
      setInviteName("");
    },
    onError: (e) => {
      const fields = fieldErrors(e);
      // 409: the address is already in use — show it on the email field.
      if (e instanceof ApiError && e.status === 409) fields.email = errorMessage(e);
      setInviteErrors(fields);
      setInviteError(Object.keys(fields).length ? null : errorMessage(e));
    },
  });

  function handleSendInvite() {
    const local: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim()))
      local.email = "Enter a valid email address, e.g. name@rswitch.rw.";
    if (!inviteName.trim()) local.full_name = "Enter the person's full name.";
    setInviteErrors(local);
    setInviteError(null);
    if (Object.keys(local).length === 0) invite.mutate();
  }

  const openInvite = () => {
    setShowInvite(true);
    setInvited(null);
    setInviteErrors({});
    setInviteError(null);
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    await act(confirm.run());
    setConfirmBusy(false);
    setConfirm(null);
  };

  const inputClass = (bad?: string) =>
    `w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border ${bad ? "border-rose-400" : "border-slate-200 dark:border-slate-700"} text-slate-900 dark:text-white focus:outline-none`;
  const linkBtn = "text-[11px] font-semibold hover:underline cursor-pointer whitespace-nowrap";

  return (
    <AppShell
      title="Users & Security"
      subtitle="Invitations, roles, account status and the user-management audit trail"
      breadcrumb="ADMIN › USERS & SECURITY"
      primaryAction={
        canManageUsers ? (
          <PrimaryButton icon={<UserPlus className="h-4 w-4" />} onClick={openInvite}>
            Invite user
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <div className="flex items-center gap-2">
          {(
            [
              ["users", `Users (${users.length})`],
              ["audit", "User-management audit log"],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-8 px-4 rounded-xl text-xs font-sans font-semibold border cursor-pointer ${
                activeTab === tab
                  ? "bg-[#168FA8] text-white border-[#168FA8]"
                  : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 flex justify-between"
        >
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 flex justify-between"
        >
          {notice}
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {activeTab === "users" ? (
        <SectionCard title="User accounts" noPad>
          <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                aria-label="Search users"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or role…"
                className="h-8 pl-8 pr-3 rounded-lg text-xs w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
            <select
              aria-label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | UserStatus)}
              className="h-8 px-2 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="">All statuses</option>
              <option value="Active">Active</option>
              <option value="Invited">Invited</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {[
                    "Name",
                    "Email",
                    "Role",
                    "Status",
                    "2FA",
                    "Senior",
                    "Last login",
                    "Actions",
                  ].map((col) => (
                    <th
                      key={col}
                      className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {usersQuery.isLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {usersQuery.error && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-rose-600">
                      {errorMessage(usersQuery.error)}
                    </td>
                  </tr>
                )}
                {!usersQuery.isLoading && !usersQuery.error && filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                      {users.length ? "No users match these filters." : "No user accounts yet."}
                    </td>
                  </tr>
                )}
                {filteredUsers.map((u) => {
                  const self = u.email === me?.email;
                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top"
                    >
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                        {u.full_name || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#168FA8]">{u.email}</td>
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {u.role}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${STATUS_STYLE[u.status]}`}
                          >
                            {u.status}
                          </span>
                          {u.locked && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1"
                              title={`Until ${when(u.locked_until)}`}
                            >
                              <Lock className="h-3 w-3" /> Locked
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {u.mfa_enabled ? (
                          <span className="text-emerald-600 font-bold">Enabled</span>
                        ) : (
                          <span className="text-slate-400">Not set up</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`${u.full_name || u.email} receives escalations`}
                          title="Senior users receive escalations (e.g. overdue incident remediation)"
                          checked={u.is_senior}
                          disabled={!canManageUsers}
                          onChange={(e) =>
                            act(api.patch(`/users/${u.id}`, { is_senior: e.target.checked }))
                          }
                          className="h-4 w-4 accent-[#168FA8] cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {when(u.last_login_at)}
                      </td>
                      <td className="px-4 py-3">
                        {self ? (
                          <span className="text-[11px] text-slate-400">You</span>
                        ) : (
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {u.status !== "Inactive" && (
                              <button
                                className={`${linkBtn} text-[#168FA8]`}
                                onClick={() => setRoleTarget(u)}
                              >
                                Change role
                              </button>
                            )}
                            {u.status === "Invited" && (
                              <button
                                className={`${linkBtn} text-[#168FA8]`}
                                onClick={() =>
                                  act(
                                    api.post(`/users/${u.id}/resend-invite`),
                                    `A new invitation was sent to ${u.email}.`,
                                  )
                                }
                              >
                                Resend invite
                              </button>
                            )}
                            {u.status === "Active" && (
                              <button
                                className={`${linkBtn} text-[#168FA8]`}
                                title="Emails the user a single-use link to choose a new password"
                                onClick={() =>
                                  act(
                                    api.post(`/users/${u.id}/reset-password`),
                                    `A password reset link was sent to ${u.email}.`,
                                  )
                                }
                              >
                                Send reset link
                              </button>
                            )}
                            {u.mfa_enabled && (
                              <button
                                className={`${linkBtn} text-amber-600`}
                                onClick={() =>
                                  setConfirm({
                                    title: "Reset two-factor authentication?",
                                    body: `${u.email} will be signed out everywhere and must set up an authenticator again at their next sign-in. Use this when they've lost their device.`,
                                    action: "Reset 2FA",
                                    run: () => api.post(`/users/${u.id}/reset-mfa`),
                                  })
                                }
                              >
                                Reset 2FA
                              </button>
                            )}
                            {u.locked && (
                              <button
                                className={`${linkBtn} text-amber-600`}
                                onClick={() =>
                                  act(api.post(`/users/${u.id}/unlock`), `${u.email} was unlocked.`)
                                }
                              >
                                Unlock
                              </button>
                            )}
                            {u.status === "Inactive" ? (
                              <button
                                className={`${linkBtn} text-emerald-600`}
                                onClick={() => act(api.put(`/users/${u.id}/reactivate`))}
                              >
                                Reactivate
                              </button>
                            ) : (
                              <button
                                className={`${linkBtn} text-red-500`}
                                onClick={() =>
                                  setConfirm({
                                    title:
                                      u.status === "Invited"
                                        ? "Cancel this invitation?"
                                        : "Deactivate this account?",
                                    body: `${u.email} won't be able to sign in and any open sessions end now. The account and its audit history are kept; you can reactivate it later.`,
                                    action:
                                      u.status === "Invited" ? "Cancel invitation" : "Deactivate",
                                    danger: true,
                                    run: () => api.put(`/users/${u.id}/deactivate`),
                                  })
                                }
                              >
                                {u.status === "Invited" ? "Cancel invite" : "Deactivate"}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        <AuditLogTable
          actionPrefix="USER_*"
          title="User-management audit log"
          canExport={hasCap(role, "settings.manage")}
        />
      )}

      <RoleAssignmentModal
        isOpen={!!roleTarget}
        user={
          roleTarget
            ? {
                id: roleTarget.id,
                name: roleTarget.full_name,
                email: roleTarget.email,
                role: roleTarget.role,
              }
            : null
        }
        onClose={() => setRoleTarget(null)}
        onSave={(id, newRole) => api.put(`/users/${id}/role`, { role: newRole }).then(refresh)}
      />

      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4"
          >
            <h2 className="font-bold text-base text-slate-900 dark:text-white">{confirm.title}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{confirm.body}</p>
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => setConfirm(null)}>Keep as is</SecondaryButton>
              <button
                onClick={runConfirm}
                disabled={confirmBusy}
                className={`h-10 px-4 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${confirm.danger ? "bg-red-600 hover:bg-red-700" : "bg-[#168FA8] hover:bg-[#0F6F83]"}`}
              >
                {confirmBusy ? "Working…" : confirm.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 id="invite-title" className="font-bold text-base text-slate-900 dark:text-white">
                Invite a user
              </h2>
              <button
                onClick={() => setShowInvite(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {invited ? (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-800 dark:text-emerald-300 space-y-1 text-xs">
                <div className="font-bold flex items-center gap-1 text-sm">
                  <CheckCircle2 className="h-4 w-4" /> Invitation sent to {invited.email}
                </div>
                <p className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> The email contains a single-use registration
                  link. The account shows as Invited until they set a password.
                </p>
              </div>
            ) : (
              <form
                className="space-y-3 text-xs"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendInvite();
                }}
                noValidate
              >
                <div>
                  <label
                    htmlFor="invite-name"
                    className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Full name
                  </label>
                  <input
                    id="invite-name"
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    aria-invalid={!!inviteErrors.full_name}
                    className={inputClass(inviteErrors.full_name)}
                  />
                  {inviteErrors.full_name && (
                    <p className="mt-1 text-rose-600 font-medium">{inviteErrors.full_name}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="invite-email"
                    className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Work email
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    aria-invalid={!!inviteErrors.email}
                    className={inputClass(inviteErrors.email)}
                  />
                  {inviteErrors.email && (
                    <p className="mt-1 text-rose-600 font-medium">{inviteErrors.email}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="invite-role"
                    className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Role
                  </label>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as BackendRole)}
                    aria-invalid={!!inviteErrors.role}
                    className={inputClass(inviteErrors.role)}
                  >
                    {ROLES.map((r) => (
                      <option key={r.id} value={BACKEND_ROLE[r.id]}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {inviteErrors.role && (
                    <p className="mt-1 text-rose-600 font-medium">{inviteErrors.role}</p>
                  )}
                </div>
                {inviteError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 text-red-600 font-semibold">
                    {inviteError}
                  </div>
                )}
                <button type="submit" hidden />
              </form>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setShowInvite(false)}>Close</SecondaryButton>
              {invited ? (
                <PrimaryButton onClick={() => setInvited(null)}>Invite another</PrimaryButton>
              ) : (
                <PrimaryButton onClick={handleSendInvite} disabled={invite.isPending}>
                  {invite.isPending ? "Sending…" : "Send invitation"}
                </PrimaryButton>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
