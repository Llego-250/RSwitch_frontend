import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shield, Eye, EyeOff, ArrowRight, KeyRound, MailCheck } from "lucide-react";
import { LOGOUT_NOTICE_KEY, useAuth } from "@/context/AuthContext";
import { api, errorMessage } from "@/lib/api";
import { usePasswordPolicy } from "@/lib/queries";
import { AuthLayout, AuthNotice, authButtonClass, authInputClass, authLabelClass } from "@/components/AuthLayout";

export const Route = createFileRoute("/login")({
  component: Login,
});

type Step = "creds" | "mfa" | "forgot" | "forgot-sent";

function readLogoutNotice(): string | null {
  try {
    const notice = sessionStorage.getItem(LOGOUT_NOTICE_KEY);
    sessionStorage.removeItem(LOGOUT_NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
}

function Login() {
  const [step, setStep] = useState<Step>("creds");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // REQ-AUTH-005: why the previous session ended (e.g. 30 min of inactivity).
  const [notice, setNotice] = useState<string | null>(readLogoutNotice);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { login: authLogin, verifyMfa: authVerifyMfa, isAuthenticated } = useAuth();
  const policy = usePasswordPolicy().data;
  const resetMinutes = policy?.reset_link_minutes;

  useEffect(() => {
    if (isAuthenticated) navigate({ to: "/" });
  }, [isAuthenticated, navigate]);

  function handleCodeChange(i: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 5) inputRefs.current[i + 1]?.focus();
  }

  function handleCodeKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[i] && i > 0) inputRefs.current[i - 1]?.focus();
    if (e.key === "Enter") handleVerify();
  }

  function handleCodePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = [...code];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
    setCode(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function handleSignIn() {
    if (!email.trim() || !pwd) {
      setErrorMsg("Enter your email and password to continue.");
      return;
    }
    setErrorMsg(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await authLogin(email.trim(), pwd);
      if (result.mfaRequired) {
        setStep("mfa");
        setPwd("");
      } else {
        // Either a full session, or an enrolment-only one: the route guard
        // then shows the mandatory two-factor setup (REQ-AUTH-002).
        navigate({ to: "/" });
      }
    } catch (e) {
      setErrorMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    const value = useRecovery ? recoveryCode.trim() : code.join("");
    if (!useRecovery && value.length < 6) {
      setErrorMsg("Enter all 6 digits of your authentication code.");
      return;
    }
    if (useRecovery && !value) {
      setErrorMsg("Enter one of your recovery codes.");
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    try {
      await authVerifyMfa(value, trustDevice);
      navigate({ to: "/" });
    } catch (e) {
      setErrorMsg(errorMessage(e));
      setCode(["", "", "", "", "", ""]);
      setRecoveryCode("");
      inputRefs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function handleResetRequest() {
    if (!email.trim()) {
      setErrorMsg("Enter the email address of your RDIP account.");
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    try {
      await api.post("/auth/password/reset-request", { email: email.trim() });
      setStep("forgot-sent");
    } catch (e) {
      setErrorMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const backToSignIn = () => {
    setStep("creds");
    setErrorMsg(null);
    setCode(["", "", "", "", "", ""]);
    setRecoveryCode("");
    setUseRecovery(false);
  };

  const linkButton = "text-xs font-medium text-[var(--primary-500)] hover:underline";

  return (
    <AuthLayout>
      {step === "creds" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSignIn();
          }}
          noValidate
        >
          <div className="mb-5">
            <div className="mb-1.5 text-xl font-bold text-[var(--neutral-900)]">Sign in to your account</div>
            <div className="text-[13px] text-[var(--neutral-500)]">Use your RSwitch work credentials to continue.</div>
          </div>
          {notice && <AuthNotice tone="info">{notice}</AuthNotice>}

          <div className="mb-4">
            <label className={authLabelClass} htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@rswitch.rw"
              className={authInputClass}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="mb-5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <label className={`${authLabelClass} mb-0`} htmlFor="login-pwd">
                Password
              </label>
              <button
                type="button"
                className={linkButton}
                onClick={() => {
                  setStep("forgot");
                  setErrorMsg(null);
                }}
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                id="login-pwd"
                type={showPwd ? "text" : "password"}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className={`${authInputClass} pr-11`}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center p-1 text-[var(--neutral-400)]"
                aria-label={showPwd ? "Hide password" : "Show password"}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {errorMsg && <AuthNotice tone="error">{errorMsg}</AuthNotice>}

          <button type="submit" className={authButtonClass} disabled={busy}>
            {busy ? "Signing in…" : "Sign In"}
            <ArrowRight size={16} />
          </button>

          <p className="mt-5 text-center text-xs leading-normal text-[var(--neutral-400)]">
            Accounts are created by invitation. Need help? Contact your RDIP administrator.
          </p>
        </form>
      )}

      {step === "mfa" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleVerify();
          }}
          noValidate
        >
          <Shield size={48} strokeWidth={1.5} className="mb-4 text-[var(--primary-500)]" />
          <h2 className="mb-2 text-lg font-semibold tracking-tight text-[var(--neutral-900)]">Two-Factor Authentication</h2>
          <p className="mb-6 text-[13px] leading-relaxed text-[var(--neutral-500)]">
            {useRecovery
              ? "Enter one of the recovery codes you saved when you set up two-factor authentication. Each code works once."
              : "Enter the 6-digit code from your authenticator app."}
          </p>

          {useRecovery ? (
            <div className="mb-5">
              <label className={authLabelClass} htmlFor="recovery-code">
                Recovery code
              </label>
              <input
                id="recovery-code"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                className={`${authInputClass} font-mono uppercase tracking-wider`}
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
          ) : (
            <div className="mb-5 flex justify-between gap-2" role="group" aria-label="Authentication code">
              {code.map((c, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  id={`mfa-${i}`}
                  aria-label={`Digit ${i + 1}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  value={c}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  onPaste={i === 0 ? handleCodePaste : undefined}
                  autoFocus={i === 0}
                  className={`h-11 w-11 shrink-0 rounded-lg border-[1.5px] text-center font-mono text-xl font-semibold text-[var(--neutral-900)] outline-none transition-colors focus:border-[var(--primary-500)] ${
                    c ? "border-[var(--primary-500)] bg-[var(--primary-50)]" : "border-[var(--neutral-200)] bg-white"
                  }`}
                />
              ))}
            </div>
          )}

          {/* REQ-AUTH-006 */}
          <label className="mb-5 flex cursor-pointer select-none items-center gap-2 text-[13px] text-[var(--neutral-700)]">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              className="h-[15px] w-[15px] accent-[var(--primary-500)]"
            />
            Trust this device for {policy?.trusted_device_days ?? 30} days
          </label>

          {errorMsg && <AuthNotice tone="error">{errorMsg}</AuthNotice>}

          <button type="submit" className={authButtonClass} disabled={busy}>
            <KeyRound size={16} />
            {busy ? "Verifying…" : "Verify & Sign In"}
          </button>

          <div className="mt-3.5 text-center">
            <button
              type="button"
              className="text-[13px] font-medium text-[var(--neutral-500)] hover:text-[var(--primary-500)] hover:underline"
              onClick={() => {
                setUseRecovery((v) => !v);
                setErrorMsg(null);
              }}
            >
              {useRecovery ? "Use my authenticator app instead" : "Use a recovery code"}
            </button>
          </div>
          <div className="mt-2 text-center">
            <button type="button" onClick={backToSignIn} className="py-1 text-[13px] text-[var(--neutral-400)] hover:text-[var(--neutral-700)]">
              ← Use a different account
            </button>
          </div>
        </form>
      )}

      {step === "forgot" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleResetRequest();
          }}
          noValidate
        >
          <div className="mb-5">
            <div className="mb-1.5 text-xl font-bold text-[var(--neutral-900)]">Reset your password</div>
            <div className="text-[13px] text-[var(--neutral-500)]">
              Enter your account's email address and we'll send you a link to choose a new password.
              {resetMinutes ? ` The link expires in ${resetMinutes} minutes.` : ""}
            </div>
          </div>
          <div className="mb-5">
            <label className={authLabelClass} htmlFor="reset-email">
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={authInputClass}
              autoComplete="username"
              autoFocus
            />
          </div>
          {errorMsg && <AuthNotice tone="error">{errorMsg}</AuthNotice>}
          <button type="submit" className={authButtonClass} disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
          <div className="mt-3 text-center">
            <button type="button" onClick={backToSignIn} className="py-1 text-[13px] text-[var(--neutral-400)] hover:text-[var(--neutral-700)]">
              ← Back to sign in
            </button>
          </div>
        </form>
      )}

      {step === "forgot-sent" && (
        <div>
          <MailCheck size={44} strokeWidth={1.5} className="mb-4 text-[var(--primary-500)]" />
          <div className="mb-2 text-lg font-semibold text-[var(--neutral-900)]">Check your email</div>
          <p className="mb-6 text-[13px] leading-relaxed text-[var(--neutral-500)]">
            If an account exists for <b>{email.trim()}</b>, we've sent a link to reset its password. The link works once
            {resetMinutes ? ` and expires in ${resetMinutes} minutes` : ""}.
          </p>
          <button type="button" onClick={backToSignIn} className={authButtonClass}>
            Back to sign in
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
