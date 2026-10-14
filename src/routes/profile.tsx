import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, SectionCard } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { usePasswordPolicy, useTrustedDevices } from "@/lib/queries";
import { MfaSetupModal } from "@/components/MfaSetupModal";
import { PasswordRules, passwordChecks } from "@/components/PasswordRules";
import {
  User,
  ShieldCheck,
  Mail,
  CheckCircle2,
  AlertCircle,
  MonitorSmartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/profile")({
  component: ProfileRoute,
});

type Msg = { type: "success" | "error"; text: string } | null;

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div
      role={msg.type === "error" ? "alert" : "status"}
      className={`p-3 rounded-xl border font-medium text-xs flex items-center gap-2 ${
        msg.type === "success"
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-rose-50 border-rose-200 text-rose-700"
      }`}
    >
      {msg.type === "success" ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
      {msg.text}
    </div>
  );
}

function when(iso?: string | null) {
  return iso ? new Date(iso + (iso.endsWith("Z") ? "" : "Z")).toLocaleString() : "—";
}

function ProfileRoute() {
  const { user, refreshUser } = useAuth();
  const policy = usePasswordPolicy().data;
  const devices = useTrustedDevices();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [nameError, setNameError] = useState<string | undefined>();
  const [profileMessage, setProfileMessage] = useState<Msg>(null);
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passErrors, setPassErrors] = useState<Record<string, string>>({});
  const [passMessage, setPassMessage] = useState<Msg>(null);
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [disablePass, setDisablePass] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [deviceMessage, setDeviceMessage] = useState<Msg>(null);

  const handleSaveProfile = async () => {
    setNameError(undefined);
    try {
      await api.patch("/auth/me", { full_name: fullName });
      await refreshUser();
      setProfileMessage({ type: "success", text: "Profile details saved." });
    } catch (e) {
      setNameError(fieldErrors(e).full_name);
      setProfileMessage({ type: "error", text: errorMessage(e) });
    }
  };

  const handleChangePassword = async () => {
    const local: Record<string, string> = {};
    if (!currentPass) local.current_password = "Enter your current password.";
    if (policy && passwordChecks(newPass, policy).some((c) => !c.ok))
      local.new_password = "The new password doesn't meet every rule below.";
    if (newPass !== confirmPass) local.confirm = "The two new passwords don't match.";
    setPassErrors(local);
    setPassMessage(null);
    if (Object.keys(local).length) return;
    try {
      await api.post("/auth/change-password", {
        current_password: currentPass,
        new_password: newPass,
      });
      setPassMessage({
        type: "success",
        text: "Password changed. Your other devices have been signed out.",
      });
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (e) {
      const fields = fieldErrors(e);
      setPassErrors(fields);
      if (!Object.keys(fields).length) setPassMessage({ type: "error", text: errorMessage(e) });
    }
  };

  const handleDisableMfa = async () => {
    try {
      await api.post("/auth/mfa/disable", { password: disablePass });
      await refreshUser();
      setShowDisable(false);
      setDisablePass("");
      setMfaMessage(null);
    } catch (e) {
      setMfaMessage(fieldErrors(e).password ?? errorMessage(e));
    }
  };

  const forgetDevices = async () => {
    try {
      const r = await api.delete<{ revoked: number }>("/auth/trusted-devices");
      await queryClient.invalidateQueries({ queryKey: ["trusted-devices"] });
      setDeviceMessage({
        type: "success",
        text: `${r.revoked} device${r.revoked === 1 ? "" : "s"} will ask for a code at the next sign-in.`,
      });
    } catch (e) {
      setDeviceMessage({ type: "error", text: errorMessage(e) });
    }
  };

  return (
    <AppShell
      title="Profile & Security"
      subtitle="Your account, password, two-factor authentication and trusted devices"
      breadcrumb="USER › PROFILE"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <SectionCard title="Profile overview">
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-24 h-24 mb-3 rounded-full bg-[#E7F5F8] border-2 border-[#168FA8] flex items-center justify-center text-[#0F6F83] font-bold text-2xl shadow-md">
                {(user?.fullName ?? "?")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                {user?.fullName}
              </h3>
              <p className="text-xs text-[#168FA8] font-medium font-mono mt-0.5">{user?.email}</p>
              <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#E7F5F8] text-[#168FA8] text-xs font-semibold border border-[#CDECF1]">
                {user?.roleTitle}
                {user?.isSenior ? " · Senior" : ""}
              </div>
              <div className="w-full border-t border-neutral-200 dark:border-slate-800 mt-4 pt-4 text-xs font-mono text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-neutral-400">2FA:</span>
                  <span
                    className={`font-semibold ${user?.mfaEnabled ? "text-emerald-600" : "text-amber-600"}`}
                  >
                    {user?.mfaEnabled ? "Enabled" : "Not set up"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-neutral-400">LAST LOGIN:</span>
                  <span className="text-neutral-600 dark:text-slate-300">
                    {when(user?.lastLogin)}
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Two-factor authentication">
            <div className="space-y-3 text-xs">
              <p className="text-neutral-600 dark:text-slate-300 leading-relaxed">
                A 6-digit code from an authenticator app (Google Authenticator, Microsoft
                Authenticator, 1Password) is required at sign-in.
              </p>
              {user?.mfaEnabled ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800">
                  <span className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" /> Enabled
                  </span>
                  {!user.mfaEnforced && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowDisable((v) => !v)}
                      className="h-7 text-[11px]"
                    >
                      Turn off
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  onClick={() => setShowMfaModal(true)}
                  className="w-full bg-[#168FA8] hover:bg-[#0F6F83] text-white gap-2"
                >
                  <ShieldCheck className="h-4 w-4" /> Set up two-factor authentication
                </Button>
              )}
              {user?.mfaEnabled && user.mfaEnforced && (
                <p className="text-[11px] text-neutral-500">
                  Required by your organisation's security policy, so it can't be turned off.
                </p>
              )}
              {user?.mfaEnabled && !user.mfaEnforced && showDisable && (
                <div className="space-y-2">
                  <Input
                    type="password"
                    aria-label="Confirm with your password"
                    placeholder="Confirm with your password"
                    value={disablePass}
                    onChange={(e) => setDisablePass(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <Button
                    onClick={handleDisableMfa}
                    variant="outline"
                    className="w-full text-rose-600 border-rose-200"
                  >
                    Turn off two-factor authentication
                  </Button>
                  {mfaMessage && <p className="text-rose-600 font-medium">{mfaMessage}</p>}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Trusted devices">
            <div className="space-y-3 text-xs">
              <p className="text-neutral-600 dark:text-slate-300">
                Browsers where you ticked “Trust this device” skip the code prompt until the trust
                expires.
              </p>
              {devices.isLoading && <p className="text-neutral-400">Loading…</p>}
              {devices.data?.length === 0 && (
                <p className="text-neutral-400">No trusted devices.</p>
              )}
              <ul className="space-y-2">
                {(devices.data ?? []).map((d) => (
                  <li
                    key={d.id}
                    className="flex items-start gap-2 p-2 rounded-lg border border-neutral-200 dark:border-slate-800"
                  >
                    <MonitorSmartphone className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div
                        className="truncate font-medium text-neutral-700 dark:text-slate-200"
                        title={d.user_agent}
                      >
                        {d.user_agent || "Unknown browser"}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        Trusted {when(d.created_at)} · expires {when(d.expires_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {!!devices.data?.length && (
                <Button
                  variant="outline"
                  onClick={forgetDevices}
                  className="w-full text-rose-600 border-rose-200"
                >
                  Forget all trusted devices
                </Button>
              )}
              <Message msg={deviceMessage} />
            </div>
          </SectionCard>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Personal details">
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="profile-name"
                    className="font-semibold text-neutral-700 dark:text-slate-300 flex items-center gap-1.5"
                  >
                    <User className="h-3.5 w-3.5 text-neutral-400" /> Full name
                  </label>
                  <Input
                    id="profile-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    aria-invalid={!!nameError}
                    className="h-10 text-xs"
                  />
                  {nameError && <p className="text-rose-600 font-medium">{nameError}</p>}
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="profile-email"
                    className="font-semibold text-neutral-700 dark:text-slate-300 flex items-center gap-1.5"
                  >
                    <Mail className="h-3.5 w-3.5 text-neutral-400" /> Email address
                  </label>
                  <Input
                    id="profile-email"
                    type="email"
                    value={user?.email ?? ""}
                    disabled
                    className="h-10 text-xs"
                    title="Your email is your sign-in; ask an administrator to change it"
                  />
                </div>
              </div>
              <Message msg={profileMessage} />
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSaveProfile}
                  className="bg-[#168FA8] hover:bg-[#0F6F83] text-white"
                >
                  Save changes
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Change password">
            <form
              className="space-y-4 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                handleChangePassword();
              }}
              noValidate
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="cur-pass"
                  className="font-semibold text-neutral-700 dark:text-slate-300"
                >
                  Current password
                </label>
                <Input
                  id="cur-pass"
                  type="password"
                  autoComplete="current-password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  aria-invalid={!!passErrors.current_password}
                  className="h-10 text-xs"
                />
                {passErrors.current_password && (
                  <p className="text-rose-600 font-medium">{passErrors.current_password}</p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="new-pass"
                    className="font-semibold text-neutral-700 dark:text-slate-300"
                  >
                    New password
                  </label>
                  <Input
                    id="new-pass"
                    type="password"
                    autoComplete="new-password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    aria-invalid={!!passErrors.new_password}
                    className="h-10 text-xs"
                  />
                  {passErrors.new_password && (
                    <p className="text-rose-600 font-medium">{passErrors.new_password}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="confirm-pass"
                    className="font-semibold text-neutral-700 dark:text-slate-300"
                  >
                    Confirm new password
                  </label>
                  <Input
                    id="confirm-pass"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    aria-invalid={!!passErrors.confirm}
                    className="h-10 text-xs"
                  />
                  {passErrors.confirm && (
                    <p className="text-rose-600 font-medium">{passErrors.confirm}</p>
                  )}
                </div>
              </div>
              <PasswordRules password={newPass} policy={policy} />
              <Message msg={passMessage} />
              <div className="flex justify-end pt-2">
                <Button type="submit" className="bg-[#172033] hover:bg-[#23304C] text-white">
                  Update password
                </Button>
              </div>
            </form>
          </SectionCard>
        </div>
      </div>

      <MfaSetupModal
        isOpen={showMfaModal}
        onClose={() => setShowMfaModal(false)}
        onSuccess={() => refreshUser()}
      />
    </AppShell>
  );
}
