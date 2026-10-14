import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Fragment, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Building,
  Check,
  ChevronRight,
  Copy,
  Download,
  Key,
  Lock,
  Mail,
  Plus,
  Save,
  ScrollText,
  Shield,
  Sliders,
  Trash2,
  Upload,
} from "lucide-react";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { AnomalySettingsSection } from "@/components/settings/AnomalySettingsSection";
import { PipelineSettingsSection } from "@/components/settings/PipelineSettingsSection";
import { RiskSettingsSection } from "@/components/settings/RiskSettingsSection";
import { useRole } from "@/context/RoleContext";
import { api, apiUrl, errorMessage, fieldErrors } from "@/lib/api";
import {
  auditQueryString,
  useApiKeys,
  useEmailLog,
  useNotificationEvents,
  useSettings,
} from "@/lib/queries";
import { hasCap } from "@/lib/roles";
import type {
  ApiKeyRow,
  OrganizationSettings,
  SecuritySettings,
  SystemSettings,
} from "@/lib/types";

// SRS §5.14: Technical/Admin edits (settings.manage); Business may view
// (settings.view); Compliance never reaches this page (route guard).
export const Route = createFileRoute("/settings")({
  component: Settings,
});

type Section =
  | "org"
  | "security"
  | "reminders"
  | "notifications"
  | "apikeys"
  | "modules"
  | "audit"
  | "email";

const NAV_ITEMS: { id: Section; label: string; icon: typeof Building; technicalOnly?: boolean }[] =
  [
    { id: "org", label: "Organization & branding", icon: Building },
    { id: "security", label: "Security policy & MFA", icon: Shield },
    { id: "reminders", label: "Reminder lead times", icon: Bell },
    { id: "notifications", label: "Notification events", icon: Mail },
    { id: "apikeys", label: "API keys", icon: Key },
    { id: "modules", label: "Module settings", icon: Sliders },
    { id: "audit", label: "Audit log export", icon: ScrollText, technicalOnly: true },
    { id: "email", label: "Email delivery log", icon: Mail, technicalOnly: true },
  ];

// Mirrors backend/app/routers/settings.py.
const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD MMM YYYY"];
const SECURITY_LIMITS: Record<string, [number, number]> = {
  session_timeout_minutes: [5, 480],
  min_password_length: [12, 128],
  password_history: [0, 24],
  lockout_attempts: [3, 20],
  lockout_minutes: [1, 1440],
  trusted_device_days: [1, 90],
  reset_link_minutes: [5, 1440],
  invite_link_hours: [1, 168],
};

const inputClass = (bad?: string) =>
  `w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border ${
    bad ? "border-rose-400" : "border-slate-200 dark:border-slate-700"
  } text-slate-900 dark:text-white font-medium focus:outline-none disabled:opacity-70`;

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-[11px] font-medium text-rose-600">{message}</p> : null;
}

function Banner({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const style = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-slate-200 bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-300",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-3 py-2 text-xs font-medium ${style}`}
    >
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${checked ? "bg-[#168FA8]" : "bg-slate-300 dark:bg-slate-700"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

/** Save state shared by the form sections: inline §20.2 errors + a banner. */
function useSave(key: string) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (value: unknown) => {
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      await api.put(`/settings/${key}`, value);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setMessage({ tone: "success", text: "Saved." });
    } catch (e) {
      setErrors(fieldErrors(e));
      setMessage({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return { errors, message, busy, save };
}

function SaveBar({
  canEdit,
  busy,
  onSave,
  message,
}: {
  canEdit: boolean;
  busy: boolean;
  onSave: () => void;
  message: ReturnType<typeof useSave>["message"];
}) {
  if (!canEdit)
    return (
      <Banner tone="info">
        Read-only: only Technical / Admin users can change these settings.
      </Banner>
    );
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      <PrimaryButton icon={<Save className="h-4 w-4" />} onClick={onSave} disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </PrimaryButton>
    </div>
  );
}

// ---- REQ-SET-001 -------------------------------------------------------------

function timezones(current: string): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const zones = intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : [current];
  return zones.includes(current) ? zones : [current, ...zones];
}

function OrganizationSection({
  initial,
  canEdit,
}: {
  initial: OrganizationSettings;
  canEdit: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [dateFormat, setDateFormat] = useState(initial.date_format);
  const { errors, message, busy, save } = useSave("organization");
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const uploadLogo = async (file: File) => {
    setLogoError(null);
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("The logo must be 2 MB or smaller.");
      return;
    }
    setLogoBusy(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post("/settings/organization/logo", form);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      setLogoError(fieldErrors(e).logo ?? errorMessage(e));
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = () =>
    api
      .delete("/settings/organization/logo")
      .then(() => queryClient.invalidateQueries({ queryKey: ["settings"] }))
      .catch((e) => setLogoError(errorMessage(e)));

  return (
    <SectionCard title="Organization & branding">
      <div className="space-y-4 text-xs">
        <div>
          <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Logo</span>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl border border-slate-200 dark:border-slate-700 bg-white flex items-center justify-center overflow-hidden">
              {initial.logo_url ? (
                <img
                  src={apiUrl(initial.logo_url)}
                  alt="Organization logo"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <span className="text-[10px] text-slate-400 text-center px-1">No logo</span>
              )}
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  aria-label="Logo file"
                  onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                />
                <SecondaryButton
                  icon={<Upload className="h-4 w-4" />}
                  onClick={() => fileRef.current?.click()}
                >
                  {logoBusy ? "Uploading…" : initial.logo_url ? "Replace logo" : "Upload logo"}
                </SecondaryButton>
                {initial.logo_url && (
                  <button
                    onClick={removeLogo}
                    className="text-[11px] font-semibold text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
                <span className="text-[11px] text-slate-400 basis-full">
                  PNG, JPEG or WebP, up to 2 MB. Shown in the header for every user.
                </span>
              </div>
            )}
          </div>
          <FieldError message={logoError ?? undefined} />
        </div>
        <div>
          <label
            htmlFor="org-name"
            className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
          >
            Organization name
          </label>
          <input
            id="org-name"
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            className={inputClass(errors.name)}
          />
          <FieldError message={errors.name} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="org-tz"
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Default timezone
            </label>
            <select
              id="org-tz"
              value={timezone}
              disabled={!canEdit}
              onChange={(e) => setTimezone(e.target.value)}
              className={inputClass(errors.timezone)}
            >
              {timezones(timezone).map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <FieldError message={errors.timezone} />
          </div>
          <div>
            <label
              htmlFor="org-df"
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Default date format
            </label>
            <select
              id="org-df"
              value={dateFormat}
              disabled={!canEdit}
              onChange={(e) => setDateFormat(e.target.value)}
              className={inputClass(errors.date_format)}
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <FieldError message={errors.date_format} />
          </div>
        </div>
        <SaveBar
          canEdit={canEdit}
          busy={busy}
          message={message}
          onSave={() => save({ name, timezone, date_format: dateFormat })}
        />
      </div>
    </SectionCard>
  );
}

// ---- REQ-SET-003 -------------------------------------------------------------

const NUMBER_FIELDS: { key: keyof SecuritySettings; label: string; unit: string; hint?: string }[] =
  [
    {
      key: "session_timeout_minutes",
      label: "Session inactivity timeout",
      unit: "minutes",
      hint: "REQ-AUTH-005",
    },
    {
      key: "min_password_length",
      label: "Minimum password length",
      unit: "characters",
      hint: "§11.1 minimum is 12",
    },
    {
      key: "password_history",
      label: "Password history",
      unit: "previous passwords",
      hint: "New passwords can't match these",
    },
    {
      key: "lockout_attempts",
      label: "Lock after failed sign-ins",
      unit: "attempts",
      hint: "REQ-AUTH-003",
    },
    { key: "lockout_minutes", label: "Lockout duration", unit: "minutes" },
    {
      key: "trusted_device_days",
      label: "“Trust this device” lasts",
      unit: "days",
      hint: "REQ-AUTH-006",
    },
    {
      key: "reset_link_minutes",
      label: "Password reset link valid for",
      unit: "minutes",
      hint: "REQ-AUTH-004",
    },
    {
      key: "invite_link_hours",
      label: "Invitation link valid for",
      unit: "hours",
      hint: "REQ-USR-002",
    },
  ];

const RULE_FIELDS: { key: keyof SecuritySettings; label: string }[] = [
  { key: "require_uppercase", label: "Require an uppercase letter" },
  { key: "require_lowercase", label: "Require a lowercase letter" },
  { key: "require_digit", label: "Require a number" },
  { key: "require_special", label: "Require a special character (!@#$%^&*)" },
];

function SecuritySection({ initial, canEdit }: { initial: SecuritySettings; canEdit: boolean }) {
  const [draft, setDraft] = useState<SecuritySettings>(initial);
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, String(initial[f.key])])),
  );
  const { errors, message, busy, save } = useSave("security");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof SecuritySettings>(key: K, value: SecuritySettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = () => {
    const problems: Record<string, string> = {};
    const numbers: Record<string, number> = {};
    for (const f of NUMBER_FIELDS) {
      const [low, high] = SECURITY_LIMITS[f.key];
      const n = Number(raw[f.key]);
      if (!Number.isInteger(n) || n < low || n > high)
        problems[f.key] = `Enter a whole number from ${low} to ${high}.`;
      else numbers[f.key] = n;
    }
    setLocalErrors(problems);
    if (Object.keys(problems).length) return;
    save({ ...draft, ...numbers });
  };

  return (
    <SectionCard title="Security policy & MFA">
      <div className="space-y-5 text-xs">
        <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
          <div>
            <span className="font-bold text-slate-900 dark:text-white block">
              Enforce two-factor authentication (TOTP)
            </span>
            <span className="text-[11px] text-slate-500">
              REQ-AUTH-002. While on, users without MFA must enrol before doing anything else and
              can't turn it off.
            </span>
          </div>
          <Toggle
            label="Enforce two-factor authentication"
            checked={draft.mfa_enforced}
            disabled={!canEdit}
            onChange={(v) => set("mfa_enforced", v)}
          />
        </div>
        {!draft.mfa_enforced && initial.mfa_enforced && (
          <Banner tone="error">
            Turning enforcement off departs from SRS REQ-AUTH-002 (MFA for all users).
          </Banner>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {NUMBER_FIELDS.map((f) => {
            const [low, high] = SECURITY_LIMITS[f.key];
            const error = localErrors[f.key] ?? errors[f.key];
            return (
              <div key={f.key}>
                <label
                  htmlFor={`sec-${f.key}`}
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  {f.label} <span className="font-normal text-slate-400">({f.unit})</span>
                </label>
                <input
                  id={`sec-${f.key}`}
                  type="number"
                  min={low}
                  max={high}
                  value={raw[f.key]}
                  disabled={!canEdit}
                  aria-invalid={!!error}
                  onChange={(e) => setRaw((r) => ({ ...r, [f.key]: e.target.value }))}
                  className={inputClass(error)}
                />
                {error ? (
                  <FieldError message={error} />
                ) : (
                  f.hint && <p className="mt-1 text-[11px] text-slate-400">{f.hint}</p>
                )}
              </div>
            );
          })}
        </div>
        <div className="space-y-2">
          <span className="block font-semibold text-slate-700 dark:text-slate-300">
            Password character rules (§11.1)
          </span>
          {RULE_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <span className="text-slate-600 dark:text-slate-300">{f.label}</span>
              <Toggle
                label={f.label}
                checked={Boolean(draft[f.key])}
                disabled={!canEdit}
                onChange={(v) => set(f.key, v as never)}
              />
            </div>
          ))}
        </div>
        <SaveBar canEdit={canEdit} busy={busy} message={message} onSave={submit} />
      </div>
    </SectionCard>
  );
}

// ---- REQ-SET-004 -------------------------------------------------------------

function LeadTimes({
  id,
  label,
  hint,
  values,
  onChange,
  canEdit,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  values: number[];
  onChange: (v: number[]) => void;
  canEdit: boolean;
  error?: string;
}) {
  const [adding, setAdding] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const add = () => {
    const n = Number(adding);
    if (!Number.isInteger(n) || n < 1 || n > 365)
      return setLocalError("Enter a whole number of days from 1 to 365.");
    if (values.includes(n)) return setLocalError(`${n} days is already in the list.`);
    setLocalError(null);
    onChange([...values, n].sort((a, b) => b - a));
    setAdding("");
  };
  return (
    <div>
      <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{label}</span>
      <p className="text-[11px] text-slate-500 mb-2">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        {values.length === 0 && (
          <span className="text-[11px] text-slate-400">No reminders configured.</span>
        )}
        {values.map((d) => (
          <span
            key={d}
            className="inline-flex items-center gap-1 rounded-full bg-[#E7F5F8] text-[#0F6F83] px-3 py-1 font-semibold"
          >
            {d} day{d === 1 ? "" : "s"} before
            {canEdit && (
              <button
                aria-label={`Remove ${d} days`}
                onClick={() => onChange(values.filter((v) => v !== d))}
                className="ml-1 text-[#0F6F83]/70 hover:text-red-500"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <span className="inline-flex items-center gap-1">
            <input
              id={id}
              type="number"
              min={1}
              max={365}
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="days"
              aria-label={`Add a lead time to ${label}`}
              className="h-8 w-20 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <button
              onClick={add}
              className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[#168FA8] font-semibold inline-flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </span>
        )}
      </div>
      <FieldError message={localError ?? error} />
    </div>
  );
}

function RemindersSection({
  initial,
  canEdit,
}: {
  initial: SystemSettings["reminders"];
  canEdit: boolean;
}) {
  const [days, setDays] = useState(initial.days_before);
  const [actionDays, setActionDays] = useState(initial.action_item_days_before);
  const { errors, message, busy, save } = useSave("reminders");
  return (
    <SectionCard title="Reminder lead times">
      <div className="space-y-5 text-xs">
        <LeadTimes
          id="lead-compliance"
          label="Compliance deadlines"
          hint="REQ-SET-004: Compliance users are reminded this many days before a requirement is due (and before compliance documents expire)."
          values={days}
          onChange={setDays}
          canEdit={canEdit}
          error={errors.days_before}
        />
        <LeadTimes
          id="lead-actions"
          label="Governance action items"
          hint="§6.3: action item owners are reminded this many days before the due date."
          values={actionDays}
          onChange={setActionDays}
          canEdit={canEdit}
          error={errors.action_item_days_before}
        />
        <SaveBar
          canEdit={canEdit}
          busy={busy}
          message={message}
          onSave={() => save({ days_before: days, action_item_days_before: actionDays })}
        />
      </div>
    </SectionCard>
  );
}

// ---- REQ-NOTIF-003 -----------------------------------------------------------

function NotificationEventsSection({ canEdit }: { canEdit: boolean }) {
  const events = useNotificationEvents();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const toggle = async (key: string, enabled: boolean) => {
    setError(null);
    try {
      await api.put("/settings/notifications", { events: { [key]: enabled } });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <SectionCard title="Notification events" noPad>
      <div className="px-6 pt-4 text-xs text-slate-500">
        Every SRS §13 event, who receives it and how. Switching an event off stops both its in-app
        and email notices. Transactional emails (invitations, password resets) are always sent.
      </div>
      {error && (
        <div className="px-6 pt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-6 py-2">Event</th>
              <th className="text-left px-4 py-2">Recipient</th>
              <th className="text-left px-4 py-2">Channels</th>
              <th className="text-right px-6 py-2">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.isLoading && (
              <tr>
                <td colSpan={4} className="px-6 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {(events.data ?? []).map((e) => (
              <tr key={e.key}>
                <td className="px-6 py-2.5 font-semibold text-slate-800 dark:text-slate-100">
                  {e.label}
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{e.recipient}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    {e.channels.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    {e.always_on && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] text-slate-400"
                        title="Transactional email; can't be switched off"
                      >
                        <Lock className="h-3 w-3" /> Always on
                      </span>
                    )}
                    <Toggle
                      label={`${e.label} active`}
                      checked={e.enabled}
                      disabled={!canEdit || e.always_on}
                      onChange={(v) => toggle(e.key, v)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!canEdit && (
        <div className="px-6 py-3">
          <Banner tone="info">
            Read-only: only Technical / Admin users can switch events on or off.
          </Banner>
        </div>
      )}
    </SectionCard>
  );
}

// ---- REQ-SET-002 -------------------------------------------------------------

function ApiKeysSection({ canEdit }: { canEdit: boolean }) {
  const keys = useApiKeys();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ApiKeyRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["settings", "api-keys"] });

  const create = async () => {
    if (!name.trim()) return setNameError("Name the key, e.g. the system that will use it.");
    setNameError(null);
    setError(null);
    try {
      setCreated(await api.post<ApiKeyRow>("/settings/api-keys", { name: name.trim() }));
      setName("");
      refresh();
    } catch (e) {
      setNameError(fieldErrors(e).name ?? null);
      if (!fieldErrors(e).name) setError(errorMessage(e));
    }
  };

  const revoke = async (k: ApiKeyRow) => {
    try {
      await api.delete(`/settings/api-keys/${k.id}`);
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <SectionCard title="API keys">
      <div className="space-y-4 text-xs">
        <p className="text-slate-500">
          Keys let an external system call the RDIP API (header{" "}
          <code className="font-mono">X-API-Key</code>) with the permissions of the administrator
          who created it. Only a hash is stored: the full key is shown once, when it's created.
        </p>
        {canEdit && (
          <div>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Key name, e.g. Core banking connector"
                aria-label="New key name"
                aria-invalid={!!nameError}
                className={inputClass(nameError ?? undefined)}
              />
              <PrimaryButton icon={<Plus className="h-3.5 w-3.5" />} onClick={create}>
                Create key
              </PrimaryButton>
            </div>
            <FieldError message={nameError ?? undefined} />
          </div>
        )}
        {created?.key && (
          <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 space-y-2">
            <div className="font-bold">Copy this key now — it won't be shown again.</div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-[11px] break-all bg-white px-2 py-1 rounded border border-amber-200 select-all">
                {created.key}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(created.key ?? "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1 font-semibold text-[#168FA8]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{" "}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button onClick={() => setCreated(null)} className="text-[11px] underline">
              I've stored it safely
            </button>
          </div>
        )}
        {error && <Banner tone="error">{error}</Banner>}
        <div className="space-y-2">
          {keys.isLoading && <p className="text-slate-400">Loading…</p>}
          {keys.error && <Banner tone="error">{errorMessage(keys.error)}</Banner>}
          {keys.data?.length === 0 && (
            <p className="text-slate-400">No API keys have been created.</p>
          )}
          {(keys.data ?? []).map((k) => (
            <div
              key={k.id}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <span className="font-bold text-slate-900 dark:text-white block">{k.name}</span>
                <span className="font-mono text-[11px] text-[#168FA8]">{k.masked}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Created {new Date(k.created_at + "Z").toLocaleDateString()} by {k.owner || "—"} ·
                  Last used{" "}
                  {k.last_used_at ? new Date(k.last_used_at + "Z").toLocaleString() : "never"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${k.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                >
                  {k.is_active ? "Active" : "Revoked"}
                </span>
                {k.is_active &&
                  canEdit &&
                  (revoking?.id === k.id ? (
                    <span className="flex items-center gap-2">
                      <button
                        onClick={() => revoke(k)}
                        className="text-red-600 font-semibold text-[11px] hover:underline"
                      >
                        Confirm revoke
                      </button>
                      <button
                        onClick={() => setRevoking(null)}
                        className="text-slate-500 text-[11px] hover:underline"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setRevoking(k)}
                      className="text-red-500 hover:underline font-semibold text-[11px] inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> Revoke
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

// ---- REQ-SET-005 -------------------------------------------------------------

function AuditExportSection() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rangeError =
    !from || !to
      ? "Choose both a start and an end date."
      : from > to
        ? "The end date must be on or after the start date."
        : null;
  const exportCsv = async () => {
    setError(null);
    if (rangeError) return setError(rangeError);
    setBusy(true);
    try {
      await api.download(
        `/audit-log/export?${auditQueryString({ date_from: from, date_to: to })}`,
        `rdip_audit_log_${from}_to_${to}.csv`,
      );
    } catch (e) {
      setError(fieldErrors(e).date_to ?? errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard title="Audit log export">
      <div className="space-y-4 text-xs">
        <p className="text-slate-500">
          Downloads every audit event in the range (inclusive, UTC) as CSV: time, user, role,
          action, resource, IP address, user agent and status.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="exp-from"
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              From
            </label>
            <input
              id="exp-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass()}
            />
          </div>
          <div>
            <label
              htmlFor="exp-to"
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              To
            </label>
            <input
              id="exp-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-invalid={!!error}
              className={inputClass(error ?? undefined)}
            />
          </div>
          <PrimaryButton
            icon={<Download className="h-4 w-4" />}
            onClick={exportCsv}
            disabled={busy}
          >
            {busy ? "Exporting…" : "Export CSV"}
          </PrimaryButton>
        </div>
        <FieldError message={error ?? undefined} />
      </div>
    </SectionCard>
  );
}

// ---- outbound email log -----------------------------------------------------------

function EmailLogSection() {
  const log = useEmailLog();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <SectionCard title="Email delivery log" noPad>
      <p className="px-6 pt-4 text-xs text-slate-500">
        Every email RDIP has sent (outbound only). Without an SMTP server configured, messages are
        recorded here with status “Logged” instead of being delivered; links in delivered messages
        are redacted.
      </p>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-6 py-2">Time</th>
              <th className="text-left px-4 py-2">To</th>
              <th className="text-left px-4 py-2">Subject</th>
              <th className="text-left px-4 py-2">Event</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {log.isLoading && (
              <tr>
                <td colSpan={5} className="px-6 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {log.error && (
              <tr>
                <td colSpan={5} className="px-6 py-6 text-center text-rose-600">
                  {errorMessage(log.error)}
                </td>
              </tr>
            )}
            {log.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-6 text-center text-slate-400">
                  No emails have been sent yet.
                </td>
              </tr>
            )}
            {(log.data ?? []).map((m) => (
              <Fragment key={m.id}>
                <tr
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  onClick={() => setOpen(open === m.id ? null : m.id)}
                >
                  <td className="px-6 py-2 whitespace-nowrap text-slate-500">
                    {new Date(m.created_at + "Z").toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono">{m.to_address}</td>
                  <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-100">
                    <span className="inline-flex items-center gap-1">
                      <ChevronRight
                        className={`h-3 w-3 transition-transform ${open === m.id ? "rotate-90" : ""}`}
                      />
                      {m.subject}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{m.event_label || "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        m.status === "Sent"
                          ? "bg-emerald-100 text-emerald-700"
                          : m.status === "Failed"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-200 text-slate-600"
                      }`}
                      title={m.error || undefined}
                    >
                      {m.status}
                    </span>
                  </td>
                </tr>
                {open === m.id && (
                  <tr>
                    <td colSpan={5} className="px-6 pb-4">
                      <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 font-mono text-[11px] text-slate-700 dark:text-slate-200">
                        {m.body}
                      </pre>
                      {m.attachments.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Attachments: {m.attachments.join(", ")}
                        </p>
                      )}
                      {m.error && (
                        <p className="mt-1 text-[11px] text-rose-600">Delivery error: {m.error}</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ---- page -----------------------------------------------------------------------------

function Settings() {
  const { role } = useRole();
  const canEdit = hasCap(role, "settings.manage");
  const settings = useSettings();
  const [active, setActive] = useState<Section>("org");
  const items = NAV_ITEMS.filter((i) => !i.technicalOnly || canEdit);
  const data = settings.data;

  return (
    <AppShell
      title="Settings"
      subtitle={
        canEdit
          ? "Organization, security, reminders, notifications and integrations"
          : "Read-only view of the platform configuration"
      }
      breadcrumb="ADMIN › SETTINGS"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <nav className="lg:col-span-4 space-y-2" aria-label="Settings sections">
          {items.map((item) => {
            const Icon = item.icon;
            const on = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                aria-current={on ? "page" : undefined}
                className={`w-full p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  on
                    ? "bg-[#168FA8] text-white border-[#168FA8] shadow-xs"
                    : "bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </span>
                <ChevronRight className="h-4 w-4 opacity-60" />
              </button>
            );
          })}
        </nav>

        <div className="lg:col-span-8 space-y-5">
          {settings.isLoading && <SectionCard>Loading settings…</SectionCard>}
          {settings.error && <Banner tone="error">{errorMessage(settings.error)}</Banner>}
          {data && (
            <>
              {/* Keyed on the saved values so a draft resets after each save. */}
              {active === "org" && (
                <OrganizationSection
                  key={JSON.stringify(data.organization)}
                  initial={data.organization}
                  canEdit={canEdit}
                />
              )}
              {active === "security" && (
                <SecuritySection
                  key={JSON.stringify(data.security)}
                  initial={data.security}
                  canEdit={canEdit}
                />
              )}
              {active === "reminders" && (
                <RemindersSection
                  key={JSON.stringify(data.reminders)}
                  initial={data.reminders}
                  canEdit={canEdit}
                />
              )}
            </>
          )}
          {active === "notifications" && (
            <NotificationEventsSection canEdit={hasCap(role, "notifications.manage")} />
          )}
          {active === "apikeys" && <ApiKeysSection canEdit={canEdit} />}
          {active === "modules" && (
            <div className="space-y-5">
              <AnomalySettingsSection canEdit={canEdit} />
              <PipelineSettingsSection canEdit={canEdit} />
              <RiskSettingsSection canEdit={canEdit} />
            </div>
          )}
          {active === "audit" && canEdit && <AuditExportSection />}
          {active === "email" && canEdit && <EmailLogSection />}
        </div>
      </div>
    </AppShell>
  );
}
