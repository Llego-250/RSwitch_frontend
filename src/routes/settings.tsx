import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
import { useState } from "react";
import {
  User,
  Shield,
  Bell,
  Key,
  Sliders,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  ChevronRight,
  Download,
  Building,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

type Section = "org" | "apikeys" | "security" | "compliance" | "riskScore";

const NAV_ITEMS: { id: Section; label: string; icon: typeof User }[] = [
  { id: "org",         label: "Organization & Branding", icon: Building },
  { id: "apikeys",     label: "API Keys & Integrations", icon: Key },
  { id: "security",    label: "Security Policies & MFA", icon: Shield },
  { id: "compliance",  label: "Deadline Lead Times",     icon: Bell },
  { id: "riskScore",   label: "Participant Risk Weights", icon: Sliders },
];

type ApiKeyItem = {
  id: string;
  name: string;
  keyMasked: string;
  owner: string;
  created: string;
  status: "active" | "inactive";
};

const INITIAL_API_KEYS: ApiKeyItem[] = [
  { id: "KEY-101", name: "Core Banking Automated Pull Key", keyMasked: "sk_live_bk_98••••••••••••34a", owner: "Technical Lead", created: "2026-01-12", status: "active" },
  { id: "KEY-102", name: "Mobile Money Ingestion Token", keyMasked: "sk_live_momo_41••••••••••98f", owner: "Integration Dev", created: "2026-03-04", status: "active" },
];

function Settings() {
  const { role } = useRole();
  const canManageSettings = canManage(role, "settings");

  const [activeSection, setActiveSection] = useState<Section>("org");
  const [saved, setSaved]                   = useState(false);

  // Org Settings (§5.14 REQ-SET-001)
  const [orgName, setOrgName]           = useState("RSwitch Ltd (Rwanda National Switch)");
  const [timezone, setTimezone]         = useState("Central Africa Time (CAT / Kigali GMT+2)");
  const [dateFormat, setDateFormat]     = useState("YYYY-MM-DD (ISO 8601)");

  // API Keys (§5.14 REQ-SET-002)
  const [apiKeys, setApiKeys]           = useState<ApiKeyItem[]>(INITIAL_API_KEYS);
  const [newKeyName, setNewKeyName]     = useState("");

  // Security Policies (§5.14 REQ-SET-003)
  const [mfaEnforced, setMfaEnforced]   = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState("30");

  // Lead Times (§5.14 REQ-SET-004)
  const [remind14, setRemind14]         = useState(true);
  const [remind7, setRemind7]           = useState(true);
  const [remind1, setRemind1]           = useState(true);

  // Risk Scoring Weights (§5.6 REQ-P360-011)
  const [wIntegration, setWIntegration] = useState("30");
  const [wCompliance, setWCompliance]   = useState("30");
  const [wIncident, setWIncident]     = useState("20");
  const [wOverdue, setWOverdue]         = useState("20");

  function triggerSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleCreateKey() {
    if (!newKeyName) return;
    const created: ApiKeyItem = {
      id: `KEY-10${apiKeys.length + 1}`,
      name: newKeyName,
      keyMasked: `sk_live_${Date.now()}••••••••a7`,
      owner: `${role.toUpperCase()} User`,
      created: new Date().toISOString().split("T")[0],
      status: "active",
    };
    setApiKeys([...apiKeys, created]);
    setNewKeyName("");
  }

  function handleRevokeKey(id: string) {
    setApiKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, status: "inactive" } : k))
    );
  }

  function handleExportAuditCSV() {
    alert("Exporting full system audit log as CSV format (§5.14 REQ-SET-005)…");
  }

  return (
    <AppShell
      title="Settings"
      subtitle="Security, APIs & Parameters"
      breadcrumb="ADMIN › SETTINGS"
      scope="System Level"
      primaryAction={
        <div className="flex items-center gap-2">
          <SecondaryButton icon={<Download className="h-4 w-4" />} onClick={handleExportAuditCSV}>
            Export Audit Log CSV (REQ-SET-005)
          </SecondaryButton>
          {canManageSettings && (
            <PrimaryButton icon={<Save className="h-4 w-4" />} onClick={triggerSave}>
              {saved ? "Saved Successfully!" : "Save Changes"}
            </PrimaryButton>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 4 cols: Settings Nav */}
        <div className="lg:col-span-4 space-y-2">
          <h2 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2">Configuration Sections</h2>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  active
                    ? "bg-[#56B4D3] text-[#092E3D] border-[#56B4D3] shadow-xs"
                    : "bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                <ChevronRight className="h-4 w-4 opacity-60" />
              </button>
            );
          })}
        </div>

        {/* Right 8 cols: Active Section Settings Form */}
        <div className="lg:col-span-8 space-y-5">
          {activeSection === "org" && (
            <SectionCard title="Branding">
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Organization Full Name</label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Default Timezone</label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Default Date Format</label>
                  <input
                    type="text"
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                  />
                </div>
              </div>
            </SectionCard>
          )}

          {activeSection === "apikeys" && (
            <SectionCard title="API Keys">
              <div className="space-y-4 text-xs">
                {canManageSettings && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g. Core Banking API Connector Key"
                      className="flex-1 h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                    />
                    <PrimaryButton icon={<Plus className="h-3.5 w-3.5" />} onClick={handleCreateKey}>
                      Create API Key
                    </PrimaryButton>
                  </div>
                )}

                <div className="space-y-2 font-mono">
                  {apiKeys.map((k) => (
                    <div key={k.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white font-sans block">{k.name}</span>
                        <span className="text-[11px] text-[#56B4D3]">{k.keyMasked}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Created: {k.created} by {k.owner}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={k.status === "active" ? "healthy" : "failed"} />
                        {k.status === "active" && canManageSettings && (
                          <button
                            onClick={() => handleRevokeKey(k.id)}
                            className="text-red-500 hover:underline font-sans font-semibold text-[11px] cursor-pointer"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          {activeSection === "security" && (
            <SectionCard title="Security & MFA">
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">Enforce Multi-Factor Authentication (MFA TOTP)</span>
                    <span className="text-[11px] text-slate-500">Require all users to enter 6-digit authenticator TOTP code on login (§5.1 REQ-AUTH-002)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={mfaEnforced}
                    onChange={(e) => setMfaEnforced(e.target.checked)}
                    className="accent-[#56B4D3] h-5 w-5 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Session Inactivity Timeout (Minutes)</label>
                  <input
                    type="text"
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Default: 30 minutes of inactivity before re-authentication (REQ-AUTH-005).</span>
                </div>
              </div>
            </SectionCard>
          )}

          {activeSection === "compliance" && (
            <SectionCard title="Reminders">
              <div className="space-y-3 text-xs">
                <p className="text-slate-500">Configure automated email and in-app reminder trigger lead times before compliance due dates:</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-mono">
                    <input type="checkbox" checked={remind14} onChange={(e) => setRemind14(e.target.checked)} className="accent-[#56B4D3] h-4 w-4" />
                    <span>Send reminder 14 days before due date</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-mono">
                    <input type="checkbox" checked={remind7} onChange={(e) => setRemind7(e.target.checked)} className="accent-[#56B4D3] h-4 w-4" />
                    <span>Send reminder 7 days before due date</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-mono">
                    <input type="checkbox" checked={remind1} onChange={(e) => setRemind1(e.target.checked)} className="accent-[#56B4D3] h-4 w-4" />
                    <span>Send urgent reminder 1 day before due date</span>
                  </label>
                </div>
              </div>
            </SectionCard>
          )}

          {activeSection === "riskScore" && (
            <SectionCard title="Risk Weights">
              <div className="space-y-3 text-xs">
                <p className="text-slate-500">
                  Configure indicator category weights for the Participant 360 Risk Assessment composite score (MUST total 100%):
                </p>
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Integration Reliability Weight (%)</label>
                    <input type="text" value={wIntegration} onChange={(e) => setWIntegration(e.target.value)} className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Compliance Adherence Weight (%)</label>
                    <input type="text" value={wCompliance} onChange={(e) => setWCompliance(e.target.value)} className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Incident Frequency Weight (%)</label>
                    <input type="text" value={wIncident} onChange={(e) => setWIncident(e.target.value)} className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Overdue Submission Rate Weight (%)</label>
                    <input type="text" value={wOverdue} onChange={(e) => setWOverdue(e.target.value)} className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" />
                  </div>
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </AppShell>
  );
}
