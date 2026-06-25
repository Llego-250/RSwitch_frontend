import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shield, ArrowRight, KeyRound } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const [step, setStep] = useState<"creds" | "mfa">("creds");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh blueprint-grid flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-brand-foreground font-display font-700 mb-3">F</div>
          <h1 className="font-display text-[24px] font-600">Financial Interop</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your workspace</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          {step === "creds" ? (
            <>
              <div className="flex items-center gap-2 mb-4 font-mono text-[11px] text-muted-foreground">
                <span className="h-5 w-5 grid place-items-center rounded-full bg-brand text-brand-foreground">1</span>
                STEP 1 · CREDENTIALS
              </div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@institution.org"
                className="w-full h-10 px-3 mb-3 rounded-md border border-border bg-paper text-sm"
              />
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium">Password</label>
                <a href="#" className="text-xs text-info hover:underline">Forgot?</a>
              </div>
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className="w-full h-10 px-3 mb-4 rounded-md border border-border bg-paper text-sm"
              />
              {err && (
                <div className="mb-3 rounded-md bg-fail-bg text-fail px-3 py-2 text-xs font-mono">
                  {err}
                </div>
              )}
              <button
                onClick={() => {
                  if (!email || !pwd) { setErr("Invalid email or password."); return; }
                  setErr(null); setStep("mfa");
                }}
                className="w-full h-10 rounded-md bg-brand text-brand-foreground text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:opacity-90"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
              <p className="mt-4 text-[11px] font-mono text-muted-foreground text-center">
                FR-AUTH-01 · FR-AUTH-03 · NFR-SEC-02
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4 font-mono text-[11px] text-muted-foreground">
                <span className="h-5 w-5 grid place-items-center rounded-full bg-brand text-brand-foreground">2</span>
                STEP 2 · MFA CHALLENGE
              </div>
              <div className="flex items-center gap-2 mb-3 text-sm">
                <Shield className="h-4 w-4 text-signal" />
                Enter the 6-digit code from your authenticator
              </div>
              <div className="flex justify-between gap-2 mb-4">
                {code.map((c, i) => (
                  <input
                    key={i}
                    maxLength={1}
                    value={c}
                    onChange={(e) => {
                      const next = [...code]; next[i] = e.target.value.replace(/\D/g, ""); setCode(next);
                      const el = document.getElementById(`mfa-${i + 1}`); el?.focus();
                    }}
                    id={`mfa-${i}`}
                    className="w-12 h-12 rounded-md border border-border bg-paper text-center font-mono text-lg"
                  />
                ))}
              </div>
              <button
                onClick={() => navigate({ to: "/" })}
                className="w-full h-10 rounded-md bg-brand text-brand-foreground text-sm font-medium inline-flex items-center justify-center gap-1.5"
              >
                <KeyRound className="h-4 w-4" /> Verify & sign in
              </button>
              <button onClick={() => setStep("creds")} className="w-full mt-2 text-xs text-muted-foreground hover:underline">
                Use a different account
              </button>
              <p className="mt-4 text-[11px] font-mono text-muted-foreground text-center">
                Trouble with MFA? Contact your administrator.
              </p>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] font-mono text-muted-foreground">
          Demo · any credentials accepted. Audit events: registration · login · MFA · role grant (SYS-10)
        </p>
      </div>
    </div>
  );
}
