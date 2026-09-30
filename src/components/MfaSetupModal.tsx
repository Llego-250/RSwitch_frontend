import React, { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { ShieldCheck, Copy, Check, KeyRound, AlertTriangle, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface MfaSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const MfaSetupModal: React.FC<MfaSetupModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<"qr" | "verify" | "recovery">("qr");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qr_svg_data_uri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  // A fresh secret each time the modal opens; it only becomes active once a
  // code from the authenticator is verified.
  useEffect(() => {
    if (!isOpen) return;
    setStep("qr");
    setCode("");
    setError("");
    setSetup(null);
    api
      .post<{ secret: string; qr_svg_data_uri: string }>("/auth/mfa/setup")
      .then(setSetup)
      .catch((e) => setError(errorMessage(e)));
  }, [isOpen]);

  if (!isOpen) return null;

  const secretKey = setup?.secret ?? "…";

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async () => {
    if (code.trim().length !== 6) {
      setError("Please enter a valid 6-digit TOTP verification code.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await api.post<{ recovery_codes: string[] }>("/auth/mfa/enable", { code: code.trim() });
      setRecoveryCodes(res.recovery_codes);
      setStep("recovery");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = () => {
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-neutral-200">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#E7F5F8] text-[#168FA8]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900">Set Up Two-Factor Authentication (2FA)</h3>
              <p className="text-xs text-neutral-500">Protect your RSwitch account with TOTP authenticator</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === "qr" && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              1. Scan this QR code with your Authenticator App (Google Authenticator, Microsoft Authenticator, 1Password).
            </p>
            <div className="flex flex-col items-center justify-center p-6 bg-neutral-50 rounded-xl border border-neutral-200">
              <div className="w-48 h-48 bg-white p-2 rounded-lg border border-neutral-300 shadow-sm flex items-center justify-center">
                {setup ? (
                  <img src={setup.qr_svg_data_uri} alt="Authenticator QR code" className="w-full h-full" />
                ) : (
                  <span className="text-xs text-neutral-400">{error || "Generating…"}</span>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs text-neutral-500 font-mono">Key: {secretKey}</span>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="p-1 text-neutral-400 hover:text-[#168FA8] text-xs flex items-center gap-1"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep("verify")} disabled={!setup} className="bg-[#168FA8] hover:bg-[#0F6F83] text-white">
                Next: Verify Code
              </Button>
            </div>
          </div>
        )}

        {step === "verify" && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              2. Enter the 6-digit code generated by your authenticator app to verify setup.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700">Verification Code</label>
              <Input
                type="text"
                placeholder="123456"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center font-mono text-xl tracking-widest h-12"
              />
              {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
            </div>
            <div className="flex justify-between items-center pt-4">
              <Button variant="outline" onClick={() => setStep("qr")}>
                Back
              </Button>
              <Button onClick={handleVerify} disabled={busy} className="bg-[#168FA8] hover:bg-[#0F6F83] text-white">
                {busy ? "Verifying…" : "Verify & Continue"}
              </Button>
            </div>
          </div>
        )}

        {step === "recovery" && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Save these backup recovery codes in a secure password manager. Each works once, and they won't be shown again.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 bg-neutral-900 p-4 rounded-xl font-mono text-sm text-sky-400">
              {recoveryCodes.map((c, idx) => (
                <div key={idx} className="bg-neutral-800 px-3 py-1.5 rounded border border-neutral-700 flex items-center justify-between">
                  <span>{c}</span>
                  <span className="text-[10px] text-neutral-500">#{idx + 1}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={handleComplete} className="bg-[#168FA8] hover:bg-[#0F6F83] text-white gap-2">
                <KeyRound className="h-4 w-4" />
                Finish 2FA Setup
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
