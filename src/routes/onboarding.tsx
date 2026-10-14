import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Lock, Plug } from "lucide-react";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { useRole } from "@/context/RoleContext";
import { api, ApiError, errorMessage, fieldErrors } from "@/lib/api";
import {
  AUTH_TYPES,
  INSTITUTION_TYPES,
  INTEGRATION_MODES,
  PARTICIPANT_STATUSES,
  REGIONS,
  type IntegrationInput,
} from "@/lib/integrations";
import { useCronPreview } from "@/lib/pipelines";
import { hasCap } from "@/lib/roles";
import type { IntegrationRow, Participant } from "@/lib/types";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingRoute,
});

// Registers a participant institution (SRS §10.1, §19.2 POST /participants)
// and, optionally, its first data source (§10.2, REQ-INTG-005). Participants
// never sign in; RSwitch Technical/Admin staff do this for them.

const inputCls =
  "w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border text-sm text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40";
const border = (bad?: string) =>
  bad ? "border-red-400" : "border-[#DCE3E8] dark:border-slate-700";

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_PARTICIPANT = {
  name: "",
  short_name: "",
  code: "",
  type: "" as string,
  country: "Rwanda",
  region: "",
  registration_date: today(),
  primary_contact_name: "",
  primary_contact_email: "",
  status: "Active",
  expected_frequency_days: 30,
};

const EMPTY_SOURCE = {
  source_name: "",
  integration_mode: "Manual" as IntegrationRow["integration_mode"],
  endpoint_url: "",
  auth_type: "API Key" as IntegrationRow["auth_type"],
  api_key: "",
  client_id: "",
  client_secret: "",
  token_url: "",
  schedule_cron: "",
};

function OnboardingRoute() {
  const { role } = useRole();
  const canRegister = hasCap(role, "integrations.manage");
  const queryClient = useQueryClient();
  const [p, setP] = useState(EMPTY_PARTICIPANT);
  const [withSource, setWithSource] = useState(true);
  const [src, setSrc] = useState(EMPTY_SOURCE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    participant: Participant;
    source?: IntegrationRow;
    sourceError?: string;
  } | null>(null);
  const cron = useCronPreview(src.schedule_cron);
  const automated = src.integration_mode === "Automated API";

  const register = useMutation({
    mutationFn: async () => {
      const participant = await api.post<Participant>("/participants", {
        ...p,
        short_name: p.short_name || undefined,
        region: p.region || undefined,
        code: p.code.trim().toUpperCase(),
      });
      if (!withSource) return { participant };
      const credentials =
        src.auth_type === "API Key"
          ? { api_key: src.api_key }
          : src.auth_type === "OAuth 2.0"
            ? {
                client_id: src.client_id,
                client_secret: src.client_secret,
                token_url: src.token_url,
              }
            : undefined;
      const body: IntegrationInput & { participant_id: number } = {
        participant_id: participant.id,
        source_name: src.source_name,
        integration_mode: src.integration_mode,
        schedule_cron: src.schedule_cron,
        ...(automated
          ? { endpoint_url: src.endpoint_url || undefined, auth_type: src.auth_type, credentials }
          : {}),
      };
      try {
        const source = await api.post<IntegrationRow>("/integrations", body);
        return { participant, source };
      } catch (e) {
        // The institution is registered either way; its data source can be
        // added later under Integrations.
        setSourceErrors(fieldErrors(e));
        return { participant, sourceError: errorMessage(e) };
      }
    },
    onSuccess: (result) => {
      setDone(result);
      for (const key of ["participants", "integrations", "pipeline-configs"])
        queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (e) => {
      const inline = fieldErrors(e);
      setErrors(inline);
      setFormError(
        Object.keys(inline).length && !(e instanceof ApiError && e.status === 409)
          ? null
          : errorMessage(e),
      );
    },
  });

  function submit() {
    const local: Record<string, string> = {};
    if (!p.name.trim()) local.name = "Enter the institution's full legal name";
    if (!p.code.trim()) local.code = "Enter a short code, e.g. BKG";
    if (!p.type) local.type = "Choose the institution type";
    if (!p.primary_contact_name.trim())
      local.primary_contact_name = "Enter the primary contact's name";
    if (!p.primary_contact_email.trim())
      local.primary_contact_email = "Enter the primary contact's email";
    const localSource: Record<string, string> = {};
    if (withSource && !src.source_name.trim())
      localSource.source_name = "Name the data source, e.g. Core Banking";
    setErrors(local);
    setSourceErrors(localSource);
    setFormError(null);
    if (Object.keys(local).length || Object.keys(localSource).length) return;
    register.mutate();
  }

  if (!canRegister) {
    return (
      <AppShell
        title="Register participant"
        breadcrumb="CONNECT › INTEGRATIONS › REGISTER PARTICIPANT"
      >
        <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg mx-auto mt-10 space-y-3">
          <Lock className="h-10 w-10 text-amber-500 mx-auto" />
          <h2 className="font-bold text-base text-slate-800 dark:text-white">
            You do not have permission to perform this action.
          </h2>
          <p className="text-xs text-slate-500">
            Participant institutions are registered by Technical/Admin users.
          </p>
        </div>
      </AppShell>
    );
  }

  if (done) {
    return (
      <AppShell
        title="Register participant"
        breadcrumb="CONNECT › INTEGRATIONS › REGISTER PARTICIPANT"
      >
        <div className="max-w-xl mx-auto my-8 p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl space-y-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
          <h2 className="text-lg font-bold">{done.participant.name} is registered</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Code <span className="font-mono font-bold">{done.participant.code}</span> ·{" "}
            {done.participant.type} · status {done.participant.status}
          </p>
          {done.source ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Data source “{done.source.source_name}” ({done.source.integration_mode}) added —
              status {done.source.status}.
            </p>
          ) : done.sourceError ? (
            <p className="text-xs text-red-600">
              The data source was not saved: {done.sourceError} Add it from Integrations.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              No data source yet — the catalog shows the institution as Not Configured.
            </p>
          )}
          <div className="flex justify-center gap-3 pt-2">
            <Link to="/integrations">
              <PrimaryButton>Go to Integrations</PrimaryButton>
            </Link>
            <SecondaryButton
              onClick={() => {
                setDone(null);
                setP({ ...EMPTY_PARTICIPANT, registration_date: today() });
                setSrc(EMPTY_SOURCE);
                setSourceErrors({});
              }}
            >
              Register another
            </SecondaryButton>
          </div>
        </div>
      </AppShell>
    );
  }

  const setPart = (patch: Partial<typeof p>) => setP((v) => ({ ...v, ...patch }));
  const setSource = (patch: Partial<typeof src>) => setSrc((v) => ({ ...v, ...patch }));

  return (
    <AppShell
      title="Register participant"
      subtitle="Participant institution and its first data source"
      breadcrumb="CONNECT › INTEGRATIONS › REGISTER PARTICIPANT"
      scope="Technical / Admin"
    >
      <div className="space-y-6 max-w-4xl">
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#168FA8]" /> Institution (§10.1)
            </span>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full legal name *" error={errors.name}>
              <input
                value={p.name}
                onChange={(e) => setPart({ name: e.target.value })}
                className={`${inputCls} ${border(errors.name)}`}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code *" error={errors.code} hint="Up to 12 letters/digits">
                <input
                  value={p.code}
                  onChange={(e) => setPart({ code: e.target.value.toUpperCase() })}
                  className={`${inputCls} font-mono ${border(errors.code)}`}
                />
              </Field>
              <Field label="Short name" error={errors.short_name} hint="Defaults to the code">
                <input
                  value={p.short_name}
                  onChange={(e) => setPart({ short_name: e.target.value })}
                  className={`${inputCls} ${border(errors.short_name)}`}
                />
              </Field>
            </div>
            <Field label="Institution type *" error={errors.type}>
              <select
                value={p.type}
                onChange={(e) => setPart({ type: e.target.value })}
                className={`${inputCls} ${border(errors.type)}`}
              >
                <option value="">Select…</option>
                {INSTITUTION_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Status" error={errors.status}>
              <select
                value={p.status}
                onChange={(e) => setPart({ status: e.target.value })}
                className={`${inputCls} ${border(errors.status)}`}
              >
                {PARTICIPANT_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Country" error={errors.country}>
              <input
                value={p.country}
                onChange={(e) => setPart({ country: e.target.value })}
                className={`${inputCls} ${border(errors.country)}`}
              />
            </Field>
            <Field label="Region" error={errors.region}>
              <select
                value={p.region}
                onChange={(e) => setPart({ region: e.target.value })}
                className={`${inputCls} ${border(errors.region)}`}
              >
                <option value="">Not specified</option>
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Registration date"
              error={errors.registration_date}
              hint="Date it joined the RSwitch network"
            >
              <input
                type="date"
                value={p.registration_date}
                onChange={(e) => setPart({ registration_date: e.target.value })}
                className={`${inputCls} ${border(errors.registration_date)}`}
              />
            </Field>
            <Field
              label="Expected submission frequency (days)"
              error={errors.expected_frequency_days}
            >
              <input
                type="number"
                min={1}
                max={366}
                value={p.expected_frequency_days}
                onChange={(e) => setPart({ expected_frequency_days: Number(e.target.value) })}
                className={`${inputCls} ${border(errors.expected_frequency_days)}`}
              />
            </Field>
            <Field label="Primary contact name *" error={errors.primary_contact_name}>
              <input
                value={p.primary_contact_name}
                onChange={(e) => setPart({ primary_contact_name: e.target.value })}
                className={`${inputCls} ${border(errors.primary_contact_name)}`}
              />
            </Field>
            <Field
              label="Primary contact email *"
              error={errors.primary_contact_email}
              hint="Receives deadline reminders (outbound email only)"
            >
              <input
                type="email"
                value={p.primary_contact_email}
                onChange={(e) => setPart({ primary_contact_email: e.target.value })}
                className={`${inputCls} ${border(errors.primary_contact_email)}`}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-[#168FA8]" /> First data source (§10.2)
            </span>
          }
          action={
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={withSource}
                onChange={(e) => setWithSource(e.target.checked)}
              />{" "}
              Add now
            </label>
          }
        >
          {!withSource ? (
            <p className="text-xs text-slate-500">
              You can add data sources later under Integrations.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Data source name *" error={sourceErrors.source_name}>
                <input
                  value={src.source_name}
                  onChange={(e) => setSource({ source_name: e.target.value })}
                  placeholder="e.g. Core Banking, Mobile Money"
                  className={`${inputCls} ${border(sourceErrors.source_name)}`}
                />
              </Field>
              <Field label="Integration type" error={sourceErrors.integration_mode}>
                <select
                  value={src.integration_mode}
                  onChange={(e) =>
                    setSource({
                      integration_mode: e.target.value as IntegrationRow["integration_mode"],
                    })
                  }
                  className={`${inputCls} ${border(sourceErrors.integration_mode)}`}
                >
                  {INTEGRATION_MODES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Expected submission schedule (cron)"
                error={
                  sourceErrors.schedule_cron ||
                  (cron.data && !cron.data.valid ? cron.data.message : undefined)
                }
                hint={
                  automated
                    ? "Also the pull schedule, e.g. 0 2 * * * (02:00 daily)"
                    : "e.g. 0 9 10 * * (monthly by the 10th); blank uses the frequency above"
                }
              >
                <input
                  value={src.schedule_cron}
                  onChange={(e) => setSource({ schedule_cron: e.target.value })}
                  className={`${inputCls} font-mono ${border(sourceErrors.schedule_cron)}`}
                />
              </Field>
              {automated && (
                <>
                  <Field
                    label="Endpoint URL"
                    error={sourceErrors.endpoint_url}
                    hint="Stored encrypted; leave blank to configure later (Not Configured)"
                  >
                    <input
                      value={src.endpoint_url}
                      onChange={(e) => setSource({ endpoint_url: e.target.value })}
                      placeholder="https://api.institution.rw/rdip/summary"
                      className={`${inputCls} font-mono ${border(sourceErrors.endpoint_url)}`}
                    />
                  </Field>
                  <Field label="Authentication" error={sourceErrors.auth_type}>
                    <select
                      value={src.auth_type}
                      onChange={(e) =>
                        setSource({ auth_type: e.target.value as IntegrationRow["auth_type"] })
                      }
                      className={`${inputCls} ${border(sourceErrors.auth_type)}`}
                    >
                      {AUTH_TYPES.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </Field>
                  {src.auth_type === "API Key" && (
                    <Field
                      label="API key"
                      error={sourceErrors.credentials}
                      hint="Stored encrypted; never shown again in full"
                    >
                      <input
                        type="password"
                        autoComplete="off"
                        value={src.api_key}
                        onChange={(e) => setSource({ api_key: e.target.value })}
                        className={`${inputCls} font-mono ${border(sourceErrors.credentials)}`}
                      />
                    </Field>
                  )}
                  {src.auth_type === "OAuth 2.0" && (
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                      {(["client_id", "client_secret", "token_url"] as const).map((k) => (
                        <Field
                          key={k}
                          label={k.replace("_", " ")}
                          error={k === "client_id" ? sourceErrors.credentials : sourceErrors[k]}
                        >
                          <input
                            type={k === "client_secret" ? "password" : "text"}
                            autoComplete="off"
                            value={src[k]}
                            onChange={(e) => setSource({ [k]: e.target.value })}
                            className={`${inputCls} font-mono ${border(sourceErrors.credentials)}`}
                          />
                        </Field>
                      ))}
                    </div>
                  )}
                </>
              )}
              <p className="md:col-span-2 text-[11px] text-slate-500">
                The expected schema and target mapping are set under Integrations → Configure once
                the institution's file format is known (Standards & Mapping).
              </p>
            </div>
          )}
        </SectionCard>

        {formError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Link to="/integrations">
            <SecondaryButton>Cancel</SecondaryButton>
          </Link>
          <PrimaryButton onClick={submit} disabled={register.isPending}>
            {register.isPending ? "Registering…" : "Register participant"}
          </PrimaryButton>
        </div>
      </div>
    </AppShell>
  );
}
