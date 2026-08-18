import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
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
  const { user, updateProfile, enableMfa } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName || "Clarisse Keza");
  const [email, setEmail] = useState(user?.email || "clarisse.keza@rswitch.rw");
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passMessage, setPassMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showMfaModal, setShowMfaModal] = useState(false);

  const handleSaveProfile = () => {
    updateProfile({ fullName, email });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleChangePassword = () => {
    if (newPass.length < 12) {
      setPassMessage({ type: "error", text: "Rule §11.1 Violation: Password must be at least 12 characters long." });
      return;
    }
    if (newPass !== confirmPass) {
      setPassMessage({ type: "error", text: "New password and confirmation do not match." });
      return;
    }
    setPassMessage({ type: "success", text: "Password changed successfully." });
    setCurrentPass("");
    setNewPass("");
    setConfirmPass("");
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
                <div className="w-24 h-24 rounded-full bg-sky-100 border-2 border-sky-500 overflow-hidden flex items-center justify-center text-sky-800 font-bold text-2xl shadow-md">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={fullName} className="w-full h-full object-cover" />
                  ) : (
                    fullName.split(" ").map((n) => n[0]).join("")
                  )}
                </div>
                <button className="absolute bottom-0 right-0 p-1.5 bg-sky-600 text-white rounded-full shadow-md hover:bg-sky-700">
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              <h3 className="text-base font-bold text-neutral-900">{user?.fullName || fullName}</h3>
              <p className="text-xs text-sky-600 font-medium font-mono mt-0.5">{user?.email || email}</p>
              <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold border border-purple-200">
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
                  <span className="text-neutral-600">Today, 11:24 AM</span>
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
                  <Button size="sm" variant="outline" onClick={() => setShowMfaModal(true)} className="h-7 text-[11px]">
                    Reconfigure
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setShowMfaModal(true)} className="w-full bg-sky-600 hover:bg-sky-700 text-white gap-2">
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
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 text-xs"
                  />
                </div>
              </div>

              {savedSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-medium text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Profile details saved successfully.
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveProfile} className="bg-sky-600 hover:bg-sky-700 text-white">
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
                <Button onClick={handleChangePassword} className="bg-neutral-900 hover:bg-black text-white">
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
        onSuccess={() => enableMfa()}
      />
    </AppShell>
  );
}
