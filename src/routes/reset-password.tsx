import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { usePasswordPolicy } from "@/lib/queries";
import { AuthLayout, AuthNotice, authButtonClass, authInputClass, authLabelClass } from "@/components/AuthLayout";
import { PasswordRules, passwordChecks } from "@/components/PasswordRules";

// REQ-AUTH-004: the page the emailed, single-use reset link opens.
export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({ token: typeof search.token === "string" ? search.token : "" }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  const policy = usePasswordPolicy().data;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const local: Record<string, string> = {};
    if (policy && passwordChecks(password, policy).some((c) => !c.ok)) local.new_password = "The password doesn't meet every rule below.";
    if (password !== confirm) local.confirm = "The two passwords don't match.";
    setErrors(local);
    setError(null);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api.post("/auth/password/reset", { token, new_password: password });
      setDone(true);
    } catch (e) {
      const fields = fieldErrors(e);
      setErrors(fields);
      if (!fields.new_password) setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout>
        <AuthNotice tone="error">This password reset link is incomplete. Open the link from your email again, or request a new one.</AuthNotice>
        <Link to="/login" className={authButtonClass}>
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {done ? (
        <div>
          <CheckCircle2 size={44} strokeWidth={1.5} className="mb-4 text-emerald-600" />
          <div className="mb-2 text-lg font-semibold text-[var(--neutral-900)]">Password changed</div>
          <p className="mb-6 text-[13px] leading-relaxed text-[var(--neutral-500)]">
            Your password has been reset and any open sessions were signed out. Sign in with your new password.
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
          <KeyRound size={40} strokeWidth={1.5} className="mb-3 text-[var(--primary-500)]" />
          <div className="mb-1.5 text-xl font-bold text-[var(--neutral-900)]">Choose a new password</div>
          <p className="mb-5 text-[13px] text-[var(--neutral-500)]">This link works once.</p>
          <div className="mb-4">
            <label className={authLabelClass} htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={authInputClass}
              autoComplete="new-password"
              aria-invalid={!!errors.new_password}
              aria-describedby="new-password-error"
              autoFocus
            />
            {errors.new_password && (
              <p id="new-password-error" className="mt-1 text-xs font-medium text-rose-600">
                {errors.new_password}
              </p>
            )}
            <PasswordRules password={password} policy={policy} />
          </div>
          <div className="mb-5">
            <label className={authLabelClass} htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={authInputClass}
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
            />
            {errors.confirm && <p className="mt-1 text-xs font-medium text-rose-600">{errors.confirm}</p>}
          </div>
          {error && <AuthNotice tone="error">{error}</AuthNotice>}
          <button type="submit" className={authButtonClass} disabled={busy}>
            {busy ? "Saving…" : "Reset password"}
          </button>
          <div className="mt-3 text-center">
            <Link to="/login" className="text-[13px] text-[var(--neutral-400)] hover:text-[var(--neutral-700)]">
              ← Back to sign in
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
