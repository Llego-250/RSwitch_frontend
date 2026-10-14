import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, UserCheck } from "lucide-react";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { usePasswordPolicy } from "@/lib/queries";
import {
  AuthLayout,
  AuthNotice,
  authButtonClass,
  authInputClass,
  authLabelClass,
} from "@/components/AuthLayout";
import { PasswordRules, passwordChecks } from "@/components/PasswordRules";

// REQ-USR-002: the time-limited registration link from the invitation email.
export const Route = createFileRoute("/accept-invite")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: AcceptInvite,
});

type Invitation = { email: string; full_name: string; role: string; expires_at: string };

function AcceptInvite() {
  const { token } = Route.useSearch();
  const policy = usePasswordPolicy().data;
  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.get<Invitation>(`/auth/invite?token=${encodeURIComponent(token)}`, null),
    enabled: !!token,
    retry: false,
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const local: Record<string, string> = {};
    if (policy && passwordChecks(password, policy).some((c) => !c.ok))
      local.password = "The password doesn't meet every rule below.";
    if (password !== confirm) local.confirm = "The two passwords don't match.";
    setErrors(local);
    setError(null);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api.post("/auth/invite/accept", { token, password });
      setDone(true);
    } catch (e) {
      const fields = fieldErrors(e);
      setErrors(fields);
      if (!fields.password) setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const invalid = !token
    ? "This invitation link is incomplete. Open the link from your email again."
    : invite.error
      ? errorMessage(invite.error)
      : null;

  return (
    <AuthLayout>
      {invalid ? (
        <div>
          <AuthNotice tone="error">{invalid}</AuthNotice>
          <Link to="/login" className={authButtonClass}>
            Go to sign in
          </Link>
        </div>
      ) : done ? (
        <div>
          <CheckCircle2 size={44} strokeWidth={1.5} className="mb-4 text-emerald-600" />
          <div className="mb-2 text-lg font-semibold text-[var(--neutral-900)]">
            Your account is ready
          </div>
          <p className="mb-6 text-[13px] leading-relaxed text-[var(--neutral-500)]">
            Sign in with {invite.data?.email} and your new password. You'll then set up two-factor
            authentication with an authenticator app.
          </p>
          <Link to="/login" className={authButtonClass}>
            Go to sign in
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <UserCheck size={40} strokeWidth={1.5} className="mb-3 text-[var(--primary-500)]" />
          <div className="mb-1.5 text-xl font-bold text-[var(--neutral-900)]">
            {invite.data
              ? `Welcome, ${invite.data.full_name || invite.data.email}`
              : "Loading your invitation…"}
          </div>
          {invite.data && (
            <p className="mb-5 text-[13px] text-[var(--neutral-500)]">
              You've been invited to RDIP as a <b>{invite.data.role}</b> user ({invite.data.email}).
              Choose a password to activate your account.
            </p>
          )}
          <div className="mb-4">
            <label className={authLabelClass} htmlFor="invite-password">
              Password
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={authInputClass}
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              autoFocus
            />
            {errors.password && (
              <p className="mt-1 text-xs font-medium text-rose-600">{errors.password}</p>
            )}
            <PasswordRules
              password={password}
              policy={policy ? { ...policy, history: 0 } : undefined}
            />
          </div>
          <div className="mb-5">
            <label className={authLabelClass} htmlFor="invite-confirm">
              Confirm password
            </label>
            <input
              id="invite-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={authInputClass}
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
            />
            {errors.confirm && (
              <p className="mt-1 text-xs font-medium text-rose-600">{errors.confirm}</p>
            )}
          </div>
          {error && <AuthNotice tone="error">{error}</AuthNotice>}
          <button type="submit" className={authButtonClass} disabled={busy || !invite.data}>
            {busy ? "Activating…" : "Activate account"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
