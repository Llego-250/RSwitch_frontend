import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Shield, Eye, EyeOff, ArrowRight, KeyRound } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const [step, setStep] = useState<"creds" | "mfa">("creds");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleCodeChange(i: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 5) {
      inputRefs.current[i + 1]?.focus();
    }
  }

  function handleCodeKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }

  function handleCodePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = [...code];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
    setCode(next);
    const lastFilled = Math.min(pasted.length, 5);
    inputRefs.current[lastFilled]?.focus();
  }

  function handleSignIn() {
    if (!email.trim() || !pwd.trim()) {
      setErrorMsg("Enter your email and password to continue.");
      return;
    }
    setErrorMsg(null);
    setStep("mfa");
  }

  function handleVerify() {
    const joined = code.join("");
    if (joined.length < 6) {
      setErrorMsg("Enter all 6 digits of your authentication code.");
      return;
    }
    setErrorMsg(null);
    navigate({ to: "/" });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: "44px",
    padding: "0 12px",
    borderRadius: "8px",
    border: "1.5px solid var(--neutral-200)",
    background: "#fff",
    fontSize: "14px",
    color: "var(--neutral-900)",
    outline: "none",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--neutral-700)",
    marginBottom: "6px",
    letterSpacing: "0.005em",
  };

  return (
    <div
      className="blueprint-grid min-h-screen flex items-center justify-center p-4"
      style={{ flexDirection: "column" }}
    >
      {/* ── CARD ── */}
      <div
        style={{
          width: "100%",
          maxWidth: "448px",
          background: "#fff",
          borderRadius: "16px",
          boxShadow:
            "0 25px 50px -12px rgba(10,37,64,0.28), 0 8px 16px rgba(10,37,64,0.12), 0 0 0 1px rgba(10,37,64,0.06)",
          padding: "32px",
          boxSizing: "border-box",
        }}
      >
        {step === "creds" ? (
          <>
            {/* ── LOGO + IDENTITY ── */}
            <div style={{ marginBottom: "28px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "var(--primary-500)",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  marginBottom: "14px",
                  boxShadow: "0 2px 8px rgba(45,106,159,0.35)",
                }}
              >
                F
              </div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "var(--neutral-900)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                }}
              >
                Financial Interop
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--neutral-500)",
                  marginTop: "4px",
                  letterSpacing: "0.01em",
                }}
              >
                Governed data · Secure access
              </div>
            </div>

            {/* ── EMAIL ── */}
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle} htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                placeholder="you@institution.org"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = "var(--primary-500)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--neutral-200)")}
                autoComplete="email"
              />
            </div>

            {/* ── PASSWORD ── */}
            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "6px",
                }}
              >
                <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor="login-pwd">
                  Password
                </label>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    alert("Password reset email sent");
                  }}
                  style={{
                    fontSize: "12px",
                    color: "var(--primary-500)",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) =>
                    ((e.target as HTMLElement).style.textDecoration = "underline")
                  }
                  onMouseLeave={(e) =>
                    ((e.target as HTMLElement).style.textDecoration = "none")
                  }
                >
                  Forgot password?
                </a>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  id="login-pwd"
                  type={showPwd ? "text" : "password"}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                  style={{ ...inputStyle, paddingRight: "44px" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--primary-500)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--neutral-200)")}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--neutral-400)",
                    display: "flex",
                    alignItems: "center",
                    padding: "4px",
                  }}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* ── REMEMBER DEVICE ── */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                color: "var(--neutral-700)",
                cursor: "pointer",
                marginBottom: "20px",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                style={{ accentColor: "var(--primary-500)", width: "15px", height: "15px" }}
              />
              Remember this device
            </label>

            {/* ── ERROR ── */}
            {errorMsg && (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "var(--fail-bg)",
                  color: "var(--fail)",
                  fontSize: "13px",
                  fontWeight: 500,
                  border: "1px solid rgba(225,29,72,0.18)",
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* ── SIGN IN BUTTON ── */}
            <button
              onClick={handleSignIn}
              style={{
                width: "100%",
                height: "48px",
                borderRadius: "8px",
                background: "var(--primary-500)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                letterSpacing: "-0.01em",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "var(--primary-700)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "var(--primary-500)")
              }
            >
              Sign In
              <ArrowRight size={16} />
            </button>

            <p
              style={{
                marginTop: "20px",
                textAlign: "center",
                fontSize: "12px",
                color: "var(--neutral-400)",
                lineHeight: 1.5,
              }}
            >
              Need help? Contact your administrator.
            </p>
          </>
        ) : (
          <>
            {/* ── SHIELD ICON ── */}
            <div style={{ marginBottom: "16px" }}>
              <Shield
                size={48}
                strokeWidth={1.5}
                style={{ color: "var(--primary-500)" }}
              />
            </div>

            <h2
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--neutral-900)",
                letterSpacing: "-0.02em",
                marginBottom: "8px",
                textWrap: "balance",
              } as React.CSSProperties}
            >
              Two-Factor Authentication
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "var(--neutral-500)",
                marginBottom: "28px",
                lineHeight: 1.6,
              }}
            >
              Enter the 6-digit code from your authenticator app.
            </p>

            {/* ── 6-DIGIT INPUTS ── */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              {code.map((c, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  id={`mfa-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={c}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  onPaste={i === 0 ? handleCodePaste : undefined}
                  autoFocus={i === 0}
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "8px",
                    border: c
                      ? "1.5px solid var(--primary-500)"
                      : "1.5px solid var(--neutral-200)",
                    background: c ? "var(--primary-50)" : "#fff",
                    textAlign: "center",
                    fontSize: "20px",
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 600,
                    color: "var(--neutral-900)",
                    outline: "none",
                    transition: "border-color 0.12s, background 0.12s",
                    flexShrink: 0,
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--primary-500)")}
                  onBlur={(e) => {
                    if (!c) e.target.style.borderColor = "var(--neutral-200)";
                  }}
                />
              ))}
            </div>

            {/* ── TRUST DEVICE ── */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                color: "var(--neutral-700)",
                cursor: "pointer",
                marginBottom: "20px",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                style={{ accentColor: "var(--primary-500)", width: "15px", height: "15px" }}
              />
              Trust this device for 30 days
            </label>

            {/* ── ERROR ── */}
            {errorMsg && (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "var(--fail-bg)",
                  color: "var(--fail)",
                  fontSize: "13px",
                  fontWeight: 500,
                  border: "1px solid rgba(225,29,72,0.18)",
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* ── VERIFY BUTTON ── */}
            <button
              onClick={handleVerify}
              style={{
                width: "100%",
                height: "48px",
                borderRadius: "8px",
                background: "var(--primary-500)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                letterSpacing: "-0.01em",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "var(--primary-700)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "var(--primary-500)")
              }
            >
              <KeyRound size={16} />
              Verify &amp; Sign In
            </button>

            {/* ── BACKUP CODE LINK ── */}
            <div style={{ textAlign: "center", marginTop: "14px" }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Enter your backup code in the field below");
                }}
                style={{
                  fontSize: "13px",
                  color: "var(--neutral-500)",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.color = "var(--primary-500)";
                  (e.target as HTMLElement).style.textDecoration = "underline";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.color = "var(--neutral-500)";
                  (e.target as HTMLElement).style.textDecoration = "none";
                }}
              >
                Use backup code
              </a>
            </div>

            {/* ── BACK LINK ── */}
            <div style={{ textAlign: "center", marginTop: "8px" }}>
              <button
                onClick={() => {
                  setStep("creds");
                  setErrorMsg(null);
                  setCode(["", "", "", "", "", ""]);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: "var(--neutral-400)",
                  fontFamily: "inherit",
                  padding: "4px 0",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = "var(--neutral-700)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = "var(--neutral-400)")
                }
              >
                ← Use a different account
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── FOOTER ── */}
      <p
        style={{
          marginTop: "20px",
          fontSize: "11px",
          fontFamily: "var(--font-mono, monospace)",
          color: "rgba(255,255,255,0.35)",
          textAlign: "center",
          letterSpacing: "0.04em",
        }}
      >
        Demo · any credentials accepted · v1.0
      </p>
    </div>
  );
}
