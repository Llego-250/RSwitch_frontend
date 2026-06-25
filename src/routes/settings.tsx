import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
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
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

type Section = "profile" | "security" | "notifications" | "apikeys" | "preferences";

const NAV_ITEMS: { id: Section; label: string; icon: typeof User }[] = [
  { id: "profile",       label: "Profile",       icon: User    },
  { id: "security",      label: "Security",       icon: Shield  },
  { id: "notifications", label: "Notifications",  icon: Bell    },
  { id: "apikeys",       label: "API Keys",       icon: Key     },
  { id: "preferences",   label: "Preferences",    icon: Sliders },
];

/* ─── shared form control styles ─── */
const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  height: "36px",
  paddingLeft: "12px",
  paddingRight: "12px",
  borderRadius: "6px",
  border: "1px solid var(--neutral-200)",
  backgroundColor: "var(--paper)",
  color: "var(--neutral-900)",
  fontSize: "13px",
  outline: "none",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--neutral-500)",
  marginBottom: "6px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

/* ─── PROFILE ─── */
function ProfileSection() {
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <SectionCard title="Personal Information">
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "96px",
                height: "96px",
                borderRadius: "50%",
                backgroundColor: "var(--primary-500)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontSize: "32px",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              JU
            </div>
            <div>
              <p style={{ fontSize: "13px", color: "var(--neutral-700)", marginBottom: "6px" }}>
                Profile photo
              </p>
              <button
                style={{
                  fontSize: "13px",
                  color: "var(--primary-500)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Change photo
              </button>
              <p style={{ fontSize: "11px", color: "var(--neutral-400)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                PNG or JPG · max 2 MB
              </p>
            </div>
          </div>

          {/* Fields grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <FormField label="Full Name">
              <input style={INPUT_STYLE} defaultValue="Jemimah Uwase" />
            </FormField>

            <FormField label="Email">
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  style={{ ...INPUT_STYLE, paddingRight: "80px", color: "var(--neutral-500)" }}
                  defaultValue="jemimah.uwase@amalitechtraining.org"
                  readOnly
                />
                <span style={{ position: "absolute", right: "8px" }}>
                  <StatusBadge status="active">Verified</StatusBadge>
                </span>
              </div>
            </FormField>

            <FormField label="Phone">
              <input style={INPUT_STYLE} defaultValue="+250 788 000 000" />
            </FormField>

            <FormField label="Organization">
              <input style={INPUT_STYLE} defaultValue="Amalitechtraining" />
            </FormField>

            <FormField label="Timezone">
              <select style={{ ...INPUT_STYLE, appearance: "none" }}>
                <option>Africa/Kigali (UTC+2)</option>
                <option>Europe/London (UTC+0)</option>
                <option>America/New_York (UTC-5)</option>
              </select>
            </FormField>

            <FormField label="Language">
              <select style={{ ...INPUT_STYLE, appearance: "none" }}>
                <option>English (US)</option>
                <option>English (UK)</option>
                <option>French</option>
                <option>Kinyarwanda</option>
              </select>
            </FormField>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton
              icon={saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              onClick={handleSave}
            >
              {saved ? "Saved" : "Save Changes"}
            </PrimaryButton>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* ─── SECURITY ─── */
function SecuritySection() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const sessions = [
    { device: "MacBook Pro 16″", location: "Kigali, RW", lastActive: "2 min ago", current: true },
    { device: "Chrome / Windows 11", location: "Kigali, RW", lastActive: "3 hr ago", current: false },
    { device: "iPhone 15 Pro", location: "Nairobi, KE", lastActive: "2 days ago", current: false },
  ];

  const loginHistory = [
    { date: "2026-06-25 09:14", ip: "196.217.3.1",  device: "MacBook Pro 16″",      status: "healthy" as const },
    { date: "2026-06-24 17:02", ip: "196.217.3.1",  device: "Chrome / Windows 11",  status: "healthy" as const },
    { date: "2026-06-23 08:55", ip: "41.90.65.200", device: "iPhone 15 Pro",         status: "healthy" as const },
    { date: "2026-06-21 14:30", ip: "196.217.3.1",  device: "MacBook Pro 16″",       status: "healthy" as const },
    { date: "2026-06-20 10:11", ip: "185.234.0.44", device: "Unknown browser",       status: "warning" as const },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* MFA */}
      <SectionCard title="Multi-Factor Authentication">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px", height: "40px", borderRadius: "8px",
                backgroundColor: "var(--ok-bg)", display: "grid", placeItems: "center",
              }}
            >
              <Shield className="h-5 w-5" style={{ color: "var(--ok)" }} />
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--neutral-900)" }}>
                TOTP Authenticator
              </div>
              <div style={{ fontSize: "12px", color: "var(--neutral-500)", fontFamily: "var(--font-mono)" }}>
                Authenticator app · last used today
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <StatusBadge status="active">Enabled</StatusBadge>
            <SecondaryButton icon={<RefreshCw className="h-3.5 w-3.5" />}>
              Reconfigure
            </SecondaryButton>
          </div>
        </div>
      </SectionCard>

      {/* Change password */}
      <SectionCard title="Change Password">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", alignItems: "end" }}>
          <FormField label="Current Password">
            <div style={{ position: "relative" }}>
              <input
                type={showCurrent ? "text" : "password"}
                style={{ ...INPUT_STYLE, paddingRight: "36px" }}
                placeholder="••••••••"
              />
              <button
                onClick={() => setShowCurrent(v => !v)}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--neutral-400)" }}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>
          <FormField label="New Password">
            <div style={{ position: "relative" }}>
              <input
                type={showNew ? "text" : "password"}
                style={{ ...INPUT_STYLE, paddingRight: "36px" }}
                placeholder="••••••••"
              />
              <button
                onClick={() => setShowNew(v => !v)}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--neutral-400)" }}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>
          <FormField label="Confirm Password">
            <input type="password" style={INPUT_STYLE} placeholder="••••••••" />
          </FormField>
        </div>
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
          <PrimaryButton icon={<Save className="h-4 w-4" />}>Update Password</PrimaryButton>
        </div>
      </SectionCard>

      {/* Active sessions */}
      <SectionCard title="Active Sessions" noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                {["Device", "Location", "Last Active", "Status", ""].map(col => (
                  <th key={col} className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)", backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)" }}>
                  <td className="px-4 py-3" style={{ color: "var(--neutral-900)", fontWeight: 500 }}>
                    {s.device}
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px]" style={{ color: "var(--neutral-500)" }}>
                    {s.location}
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px]" style={{ color: "var(--neutral-500)" }}>
                    {s.lastActive}
                  </td>
                  <td className="px-4 py-3">
                    {s.current
                      ? <StatusBadge status="active">Current</StatusBadge>
                      : <StatusBadge status="queued">Other</StatusBadge>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {!s.current && (
                      <button
                        style={{ fontSize: "12px", color: "var(--fail)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)" }}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Login history */}
      <SectionCard title="Login History" noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                {["Date", "IP Address", "Device", "Result"].map(col => (
                  <th key={col} className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loginHistory.map((h, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)", backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)" }}>
                  <td className="px-4 py-3 font-mono text-[13px]" style={{ color: "var(--neutral-700)" }}>{h.date}</td>
                  <td className="px-4 py-3 font-mono text-[13px]" style={{ color: "var(--neutral-500)" }}>{h.ip}</td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neutral-700)" }}>{h.device}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={h.status}>
                      {h.status === "healthy" ? "Success" : "Suspicious"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

/* ─── NOTIFICATIONS ─── */
type ToggleState = Record<string, Record<string, boolean>>;

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: "36px",
        height: "20px",
        borderRadius: "10px",
        border: "none",
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
        transition: "background-color 0.15s",
        backgroundColor: checked ? "var(--primary-500)" : "var(--neutral-200)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "2px",
          left: checked ? "18px" : "2px",
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          backgroundColor: "#fff",
          transition: "left 0.15s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      />
    </button>
  );
}

const NOTIFICATION_TOPICS = [
  "Fraud Alerts",
  "Data Quality Issues",
  "System Health",
  "Compliance Deadlines",
  "Pipeline Failures",
];

const CHANNELS = ["Email", "In-App", "SMS"] as const;

function NotificationsSection() {
  const initState = (): ToggleState => {
    const s: ToggleState = {};
    for (const topic of NOTIFICATION_TOPICS) {
      s[topic] = { Email: true, "In-App": true, SMS: topic === "Fraud Alerts" };
    }
    return s;
  };

  const [toggles, setToggles] = useState<ToggleState>(initState);
  const [digest, setDigest] = useState<"realtime" | "daily" | "weekly">("realtime");

  function flip(topic: string, channel: string) {
    setToggles(prev => ({
      ...prev,
      [topic]: { ...prev[topic], [channel]: !prev[topic][channel] },
    }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <SectionCard title="Alert Channels" noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                <th className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)", width: "40%" }}>
                  Alert Type
                </th>
                {CHANNELS.map(ch => (
                  <th key={ch} className="px-4 py-3 text-[12px] font-medium uppercase tracking-wide text-center"
                    style={{ color: "var(--neutral-500)" }}>
                    {ch}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_TOPICS.map((topic, i) => (
                <tr key={topic} style={{ borderBottom: "1px solid var(--border)", backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)" }}>
                  <td className="px-4 py-3" style={{ color: "var(--neutral-900)", fontSize: "13px" }}>
                    {topic}
                  </td>
                  {CHANNELS.map(ch => (
                    <td key={ch} className="px-4 py-3 text-center">
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <Toggle checked={toggles[topic][ch]} onChange={() => flip(topic, ch)} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Digest Frequency">
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {(["realtime", "daily", "weekly"] as const).map(d => (
            <button
              key={d}
              onClick={() => setDigest(d)}
              style={{
                height: "36px",
                padding: "0 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                border: "1px solid",
                borderColor: digest === d ? "var(--primary-500)" : "var(--neutral-200)",
                backgroundColor: digest === d ? "var(--primary-50)" : "var(--card)",
                color: digest === d ? "var(--primary-500)" : "var(--neutral-700)",
                transition: "all 0.12s",
              }}
            >
              {d === "realtime" ? "Real-time" : d === "daily" ? "Daily digest" : "Weekly digest"}
            </button>
          ))}
        </div>
        <p style={{ marginTop: "10px", fontSize: "12px", color: "var(--neutral-400)", fontFamily: "var(--font-mono)" }}>
          {digest === "realtime" && "Alerts delivered immediately as events occur."}
          {digest === "daily" && "A summary sent at 07:00 your local time each day."}
          {digest === "weekly" && "A weekly summary sent Monday at 07:00 your local time."}
        </p>
      </SectionCard>
    </div>
  );
}

/* ─── API KEYS ─── */
function ApiKeysSection() {
  const keys = [
    {
      name: "Production Pipeline",
      scopes: ["pipelines:read", "data:write"],
      created: "2026-01-15",
      lastUsed: "2026-06-25",
      masked: "sk_prod_••••••••••••••••3f7a",
    },
    {
      name: "Analytics Read-Only",
      scopes: ["reports:read", "fraud:read"],
      created: "2026-03-08",
      lastUsed: "2026-06-22",
      masked: "sk_ro_••••••••••••••••b2c9",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <SectionCard
        title="API Keys"
        action={
          <PrimaryButton icon={<Key className="h-4 w-4" />}>
            Generate New Key
          </PrimaryButton>
        }
        noPad
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                {["Key Name", "Scopes", "Created", "Last Used", "Key", ""].map(col => (
                  <th key={col} className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={k.name} style={{ borderBottom: "1px solid var(--border)", backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)" }}>
                  <td className="px-4 py-3" style={{ fontWeight: 500, color: "var(--neutral-900)" }}>
                    {k.name}
                  </td>
                  <td className="px-4 py-3">
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {k.scopes.map(s => (
                        <span key={s} style={{
                          fontSize: "11px", fontFamily: "var(--font-mono)",
                          padding: "2px 6px", borderRadius: "4px",
                          backgroundColor: "var(--info-bg)", color: "var(--info)",
                        }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px]" style={{ color: "var(--neutral-500)" }}>
                    {k.created}
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px]" style={{ color: "var(--neutral-500)" }}>
                    {k.lastUsed}
                  </td>
                  <td className="px-4 py-3">
                    <code style={{
                      fontFamily: "var(--font-mono)", fontSize: "12px",
                      color: "var(--neutral-700)", backgroundColor: "var(--neutral-100)",
                      padding: "3px 8px", borderRadius: "4px", letterSpacing: "0.02em",
                    }}>
                      {k.masked}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <button style={{ fontSize: "12px", color: "var(--fail)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)" }}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div style={{
        padding: "14px 16px",
        borderRadius: "6px",
        backgroundColor: "var(--warn-bg)",
        border: "1px solid var(--warn)",
        fontSize: "13px",
        color: "var(--warn)",
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
      }}>
        <Shield className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Keys grant programmatic access. Store them in a secrets manager — never commit them to source control. Rotate keys every 90 days.
        </span>
      </div>
    </div>
  );
}

/* ─── PREFERENCES ─── */
function PreferencesSection() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [density, setDensity] = useState<"comfortable" | "compact" | "dense">("comfortable");
  const [numFormat, setNumFormat] = useState<"en" | "eu">("en");
  const [tz, setTz] = useState("Africa/Kigali");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <SectionCard title="Display">
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Theme */}
          <div>
            <label style={LABEL_STYLE}>Theme</label>
            <div style={{ display: "flex", gap: "10px" }}>
              {(["light", "dark"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  style={{
                    height: "36px",
                    padding: "0 20px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor: theme === t ? "var(--primary-500)" : "var(--neutral-200)",
                    backgroundColor: theme === t ? "var(--primary-50)" : "var(--card)",
                    color: theme === t ? "var(--primary-500)" : "var(--neutral-700)",
                    textTransform: "capitalize",
                    transition: "all 0.12s",
                  }}
                >
                  {t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>

          {/* Density */}
          <div>
            <label style={LABEL_STYLE}>Density</label>
            <div style={{ display: "flex", gap: "10px" }}>
              {(["comfortable", "compact", "dense"] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  style={{
                    height: "36px",
                    padding: "0 16px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor: density === d ? "var(--primary-500)" : "var(--neutral-200)",
                    backgroundColor: density === d ? "var(--primary-50)" : "var(--card)",
                    color: density === d ? "var(--primary-500)" : "var(--neutral-700)",
                    textTransform: "capitalize",
                    transition: "all 0.12s",
                  }}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Regional">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* Number format */}
          <div>
            <label style={LABEL_STYLE}>Number Format</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(["en", "eu"] as const).map(f => (
                <label key={f} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="numformat"
                    checked={numFormat === f}
                    onChange={() => setNumFormat(f)}
                    style={{ accentColor: "var(--primary-500)" }}
                  />
                  <span style={{ fontSize: "13px", color: "var(--neutral-900)", fontFamily: "var(--font-mono)" }}>
                    {f === "en" ? "1,234.56" : "1.234,56"}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--neutral-400)" }}>
                    {f === "en" ? "US / UK" : "EU region"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Timezone override */}
          <FormField label="Timezone Override">
            <select
              style={{ ...INPUT_STYLE, appearance: "none" }}
              value={tz}
              onChange={e => setTz(e.target.value)}
            >
              <option value="Africa/Kigali">Africa/Kigali (UTC+2)</option>
              <option value="Europe/London">Europe/London (UTC+0)</option>
              <option value="America/New_York">America/New_York (UTC-5)</option>
              <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
            </select>
          </FormField>
        </div>
      </SectionCard>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <PrimaryButton
          icon={saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          onClick={handleSave}
        >
          {saved ? "Saved" : "Save Preferences"}
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ─── ROOT COMPONENT ─── */
function Settings() {
  const [activeSection, setActiveSection] = useState<Section>("profile");

  const activeLabel = NAV_ITEMS.find(n => n.id === activeSection)?.label ?? "";

  return (
    <AppShell
      title="Settings"
      breadcrumb="ADMIN › SETTINGS"
      scope="tenant: acme-bank"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: "24px",
          alignItems: "start",
        }}
      >
        {/* ─── Left sidebar nav ─── */}
        <div
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "6px",
            position: "sticky",
            top: "16px",
          }}
        >
          <div
            style={{
              padding: "10px 12px 8px",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "var(--neutral-400)",
            }}
          >
            Settings
          </div>
          {NAV_ITEMS.map(item => {
            const active = activeSection === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  padding: active ? "9px 11px" : "9px 14px",
                  borderRadius: active ? "0 5px 5px 0" : "5px",
                  borderLeft: active ? "3px solid var(--primary-500)" : "3px solid transparent",
                  backgroundColor: active ? "var(--primary-50)" : "transparent",
                  color: active ? "var(--primary-500)" : "var(--neutral-700)",
                  fontWeight: active ? 600 : 400,
                  fontSize: "13.5px",
                  cursor: "pointer",
                  textAlign: "left",
                  border: active ? "none" : "none",
                  borderLeftWidth: "3px",
                  borderLeftStyle: "solid",
                  borderLeftColor: active ? "var(--primary-500)" : "transparent",
                  marginBottom: "2px",
                  transition: "background-color 0.1s, color 0.1s",
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-100)";
                    (e.currentTarget as HTMLElement).style.color = "var(--primary-700)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "var(--neutral-700)";
                  }
                }}
              >
                <Icon style={{ width: "16px", height: "16px", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {active && <ChevronRight style={{ width: "14px", height: "14px", opacity: 0.5 }} />}
              </button>
            );
          })}
        </div>

        {/* ─── Right content area ─── */}
        <div>
          <div style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--neutral-900)", letterSpacing: "-0.01em" }}>
              {activeLabel}
            </h2>
          </div>

          {activeSection === "profile"       && <ProfileSection />}
          {activeSection === "security"      && <SecuritySection />}
          {activeSection === "notifications" && <NotificationsSection />}
          {activeSection === "apikeys"       && <ApiKeysSection />}
          {activeSection === "preferences"   && <PreferencesSection />}
        </div>
      </div>
    </AppShell>
  );
}
