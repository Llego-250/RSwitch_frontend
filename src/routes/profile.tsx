import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage } from "@/lib/api";
import { MfaSetupModal } from "@/components/MfaSetupModal";
import {
  User,
  ShieldCheck,
  Key,
  Mail,
  Building,
  Lock,
  History,
  CheckCircle2,
  AlertCircle,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/profile")({
  component: ProfileRoute,
});

function ProfileRoute() {
  const { user, refreshUser } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passMessage, setPassMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [disablePass, setDisablePass] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);

  const email = user?.email ?? "";

  const handleSaveProfile = async () => {
    try {
      await api.patch("/auth/me", { full_name: fullName });
      await refreshUser();
      setProfileMessage({ type: "success", text: "Profile details saved." });
    } catch (e) {
      setProfileMessage({ type: "error", text: errorMessage(e) });
    }
  };

  const handleChangePassword = async () => {
    if (newPass !== confirmPass) {
      setPassMessage({ type: "error", text: "New password and confirmation do not match." });
      return;
    }
    try {
      await api.post("/auth/change-password", { current_password: currentPass, new_password: newPass });
      setPassMessage({ type: "success", text: "Password changed successfully." });
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (e) {
      setPassMessage({ type: "error", text: errorMessage(e) });
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
      setMfaMessage(errorMessage(e));
    }
  };

  return (
    <AppShell
      title="User Profile & Security Settings"
      subtitle="Account Management & Credentials"
      breadcrumb="USER › PROFILE SETTINGS"
      scope="User Account & Security"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Avatar & Summary Card */}
        <div className="space-y-6">
          <SectionCard title="Profile Overview">
            <div className="flex flex-col items-center text-center p-4">
              <div className="relative mb-3">
                <div className="w-24 h-24 rounded-full bg-[#E7F5F8] border-2 border-[#168FA8] overflow-hidden flex items-center justify-center text-[#0F6F83] font-bold text-2xl shadow-md">
                  {(user?.fullName ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
              </div>

              <h3 className="text-base font-bold text-neutral-900">{user?.fullName || fullName}</h3>
              <p className="text-xs text-[#168FA8] font-medium font-mono mt-0.5">{user?.email || email}</p>
              <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#E7F5F8] text-[#168FA8] text-xs font-semibold border border-[#CDECF1]">
                {user?.roleTitle || "Technical Admin"}
              </div>

              <div className="w-full border-t border-neutral-200 mt-4 pt-4 text-xs font-mono text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-neutral-400">INSTITUTION:</span>
                  <span className="text-neutral-800 font-semibold">{user?.institution || "RSwitch HQ"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">MFA STATUS:</span>
                  <span className={`font-semibold ${user?.mfaEnabled ? "text-emerald-600" : "text-amber-600"}`}>
                    {user?.mfaEnabled ? "2FA Active" : "Disabled"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">LAST LOGIN:</span>
                  <span className="text-neutral-600">{user?.lastLogin ? new Date(user.lastLogin + (user.lastLogin.endsWith("Z") ? "" : "Z")).toLocaleString() : "—"}</span>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* MFA Status Card */}
          <SectionCard title="Two-Factor Authentication (2FA)">
            <div className="space-y-3 text-xs">
              <p className="text-neutral-600 leading-relaxed">
                Add an extra layer of security to your RSwitch account using an authenticator app (Google Authenticator, Microsoft Authenticator).
              </p>
              {user?.mfaEnabled ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800">
                  <span className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" /> 2FA Protection Enabled
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setShowDisable((v) => !v)} className="h-7 text-[11px]">
                    Disable
                  </Button>
                </div>
              ) : null}
              {user?.mfaEnabled && showDisable && (
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="Confirm with your password"
                    value={disablePass}
                    onChange={(e) => setDisablePass(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <Button onClick={handleDisableMfa} variant="outline" className="w-full text-rose-600 border-rose-200">
                    Turn off 2FA
                  </Button>
                  {mfaMessage && <p className="text-rose-600 font-medium">{mfaMessage}</p>}
                </div>
              )}
              {!user?.mfaEnabled && (
                <Button onClick={() => setShowMfaModal(true)} className="w-full bg-[#168FA8] hover:bg-[#0F6F83] text-white gap-2">
                  <ShieldCheck className="h-4 w-4" /> Enable 2FA Now
                </Button>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Edit Profile & Password */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Personal Details">
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-neutral-400" /> Full Name
                  </label>
                  <Input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-10 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-neutral-400" /> Email Address
                  </label>
                  <Input type="email" value={email} disabled className="h-10 text-xs" title="Email is your login; ask an admin to change it" />
                </div>
              </div>

              {profileMessage && (
                <div className={`p-3 rounded-xl border font-medium text-xs flex items-center gap-2 ${
                  profileMessage.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"
                }`}>
                  {profileMessage.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  {profileMessage.text}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveProfile} className="bg-[#168FA8] hover:bg-[#0F6F83] text-white">
                  Save Changes
                </Button>
              </div>
            </div>
          </SectionCard>

          {/* Change Password Section */}
          <SectionCard title="Change Account Password">
            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">Current Password</label>
                <Input
                  type="password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-neutral-700">New Password (Min 12 Chars)</label>
                  <Input
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="h-10 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-neutral-700">Confirm New Password</label>
                  <Input
                    type="password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="h-10 text-xs"
                  />
                </div>
              </div>

              {passMessage && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    passMessage.type === "success"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-rose-50 border-rose-200 text-rose-700 font-medium"
                  }`}
                >
                  {passMessage.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  {passMessage.text}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={handleChangePassword} className="bg-[#172033] hover:bg-[#23304C] text-white">
                  Update Password
                </Button>
              </div>
            </div>
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
