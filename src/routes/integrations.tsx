import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Database,
  GitBranch,
  History,
  Pause,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { AppShell, PrimaryButton, SecondaryButton } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { UploadSubmissionModal } from "@/components/UploadSubmissionModal";
import { useRole } from "@/context/RoleContext";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import {
  AUTH_TYPES,
  formatDateTime,
  INTEGRATION_BADGE,
  INTEGRATION_MODES,
  INTEGRATION_STATUS_HELP,
  INTEGRATION_STATUSES,
  issueWhere,
  normalizeIssues,
  SUBMISSION_BADGE,
  timeAgo,
  type IntegrationInput,
} from "@/lib/integrations";
import { useMappings } from "@/lib/mapping";
import { useCronPreview } from "@/lib/pipelines";
import {
  useIntegrations,
  useParticipants,
  useParticipantSubmissions,
  useSubmission,
  useTemplates,
} from "@/lib/queries";
import { hasCap } from "@/lib/roles";
import type { IntegrationRow, IntegrationStatus, Participant, Submission } from "@/lib/types";

export const Route = createFileRoute("/integrations")({
  component: IntegrationCatalog,
});

type StatusFilter = "All" | IntegrationStatus;

const inputCls =
  "w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border text-slate-900 dark:text-white focus:outline-none text-xs";
const border = (bad?: string) =>
  bad ? "border-red-400" : "border-slate-200 dark:border-slate-700";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-[11px] font-medium text-red-600">{message}</p> : null;
}

function IntegrationCatalog() {
  const { role } = useRole();
  const canManage = hasCap(role, "integrations.manage");
  const canUpload = hasCap(role, "integrations.upload");
  const canMap = hasCap(role, "mapping.view");

  const participants = useParticipants();
  const integrations = useIntegrations();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [modeFilter, setModeFilter] = useState<"All" | IntegrationRow["integration_mode"]>("All");
  const [upload, setUpload] = useState<{ participantId?: number; integrationId?: number } | null>(
    null,
  );
  const [editing, setEditing] = useState<{
    participantId?: number;
    source?: IntegrationRow;
  } | null>(null);
  const [history, setHistory] = useState<Participant | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const refresh = () => {
    for (const key of ["integrations", "pipeline-jobs", "pipeline-summary", "submissions"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const sync = useMutation({
    mutationFn: (s: IntegrationRow) => api.post(`/integrations/${s.id}/sync`),
    onSuccess: refresh,
    onError: (e) => setActionError(errorMessage(e)),
  });
  const pause = useMutation({
    mutationFn: (s: IntegrationRow) => api.put(`/integrations/${s.id}`, { paused: !s.paused }),
    onSuccess: refresh,
    onError: (e) => setActionError(errorMessage(e)),
  });

  // Catalog of institutions and their data sources (REQ-INTG-001).
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bySource = new Map<number, IntegrationRow[]>();
    for (const s of integrations.data ?? []) {
      bySource.set(s.participant_id, [...(bySource.get(s.participant_id) ?? []), s]);
    }
    return (participants.data ?? [])
      .map((p) => {
        const all = bySource.get(p.id) ?? [];
        const matchesText = (s?: IntegrationRow) =>
          q === "" ||
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (s ? s.source_name.toLowerCase().includes(q) : false);
        const sources = all.filter(
          (s) =>
            matchesText(s) &&
            (statusFilter === "All" || s.status === statusFilter) &&
            (modeFilter === "All" || s.integration_mode === modeFilter),
        );
        // A participant with no data source at all is "Not Configured" (§9.1).
        const unconfigured =
          all.length === 0 &&
          matchesText() &&
          (statusFilter === "All" || statusFilter === "Not Configured") &&
          modeFilter === "All";
        return { participant: p, sources, show: sources.length > 0 || unconfigured };
      })
      .filter((g) => g.show);
  }, [participants.data, integrations.data, search, statusFilter, modeFilter]);

  const counts = useMemo(() => {
    const out: Partial<Record<IntegrationStatus, number>> = {};
    for (const s of integrations.data ?? []) out[s.status] = (out[s.status] ?? 0) + 1;
    const withoutSource = (participants.data ?? []).filter(
      (p) => !(integrations.data ?? []).some((s) => s.participant_id === p.id),
    ).length;
    out["Not Configured"] = (out["Not Configured"] ?? 0) + withoutSource;
    return out;
  }, [integrations.data, participants.data]);

  const loadError = participants.error ?? integrations.error;

  return (
    <AppShell
      title="Integrations"
      subtitle="Participant data sources"
      breadcrumb="CONNECT › INTEGRATIONS"
      scope="All Institutions"
      primaryAction={
        <div className="flex items-center gap-2">
          {canUpload && (
            <SecondaryButton icon={<Upload className="h-4 w-4" />} onClick={() => setUpload({})}>
              Upload data file
            </SecondaryButton>
          )}
          {canManage && (
            <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({})}>
              Add data source
            </PrimaryButton>
          )}
        </div>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7B8798]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search institution, code or source…"
              className="h-8 pl-8 pr-3 rounded-xl text-xs w-64 bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#172033] dark:text-white focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-8 px-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700"
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            {INTEGRATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s} ({counts[s] ?? 0})
              </option>
            ))}
          </select>
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as typeof modeFilter)}
            className="h-8 px-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700"
            aria-label="Filter by mode"
          >
            <option value="All">All modes</option>
            {INTEGRATION_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          {canManage && (
            <Link
              to="/onboarding"
              className="h-8 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#168FA8]"
            >
              <Building2 className="h-3.5 w-3.5" /> Register participant
            </Link>
          )}
          {canMap && (
            // REQ-MAP-009: mapping is a configuration tool within Integrations.
            <Link
              to="/mapping"
              className="h-8 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#168FA8]"
            >
              <GitBranch className="h-3.5 w-3.5" /> Standards & Mapping
            </Link>
          )}
        </div>
      }
    >
      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Couldn't load integrations: {errorMessage(loadError)}
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 flex justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Status summary (§9.1), straight from the data sources. */}
      {!integrations.isLoading && (
        <div className="flex flex-wrap gap-2 mb-5">
          {INTEGRATION_STATUSES.filter((s) => counts[s]).map((s) => (
            <button
              key={s}
              title={INTEGRATION_STATUS_HELP[s]}
              onClick={() => setStatusFilter(statusFilter === s ? "All" : s)}
              className={`rounded-full ${statusFilter === s ? "ring-2 ring-[#168FA8]" : ""}`}
            >
              <StatusBadge status={INTEGRATION_BADGE[s]}>
                {s} · {counts[s]}
              </StatusBadge>
            </button>
          ))}
        </div>
      )}

      {(participants.isLoading || integrations.isLoading) && (
        <div className="py-10 text-center text-sm text-slate-400">Loading integrations…</div>
      )}

      <div className="space-y-4">
        {groups.map(({ participant, sources }) => (
          <section
            key={participant.id}
            className="rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 shadow-xs"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-[#172033] text-white flex items-center justify-center">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {participant.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    <span className="font-semibold text-[#168FA8]">{participant.code}</span> ·{" "}
                    {participant.type || "Type not set"}
                    {participant.region ? ` · ${participant.region}` : ""} · {participant.status}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <SecondaryButton
                  icon={<History className="h-4 w-4" />}
                  onClick={() => setHistory(participant)}
                >
                  Submission history
                </SecondaryButton>
                {canManage && (
                  <SecondaryButton
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => setEditing({ participantId: participant.id })}
                  >
                    Data source
                  </SecondaryButton>
                )}
              </div>
            </header>

            {sources.length === 0 ? (
              <div className="px-5 py-4 flex items-center gap-3 text-xs text-slate-500">
                <StatusBadge status="draft">Not Configured</StatusBadge>
                No data source is set up for this institution yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4">
                {sources.map((s) => (
                  <SourceCard
                    key={s.id}
                    source={s}
                    canManage={canManage}
                    canUpload={canUpload}
                    onUpload={() =>
                      setUpload({ participantId: s.participant_id, integrationId: s.id })
                    }
                    onSync={() => {
                      setActionError(null);
                      sync.mutate(s);
                    }}
                    syncing={sync.isPending && sync.variables?.id === s.id}
                    onEdit={() => setEditing({ participantId: s.participant_id, source: s })}
                    onPause={() => pause.mutate(s)}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
        {!participants.isLoading && !integrations.isLoading && groups.length === 0 && (
          <div className="py-10 text-center text-sm text-slate-400">
            {(participants.data ?? []).length === 0
              ? "No participants registered yet."
              : "No data sources match these filters."}
          </div>
        )}
      </div>

      <UploadSubmissionModal
        open={upload !== null}
        onClose={() => setUpload(null)}
        participantId={upload?.participantId}
        integrationId={upload?.integrationId}
      />
      {editing && (
        <SourceFormModal
          participantId={editing.participantId}
          source={editing.source}
          participants={participants.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
            queryClient.invalidateQueries({ queryKey: ["pipeline-configs"] });
          }}
        />
      )}
      {history && (
        <HistoryDrawer
          participant={history}
          canDownload={canUpload}
          onClose={() => setHistory(null)}
        />
      )}
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "warn" }) {
  return (
    <div>
      <span className="text-[10px] text-slate-400 uppercase block">{label}</span>
      <span
        className={`font-semibold ${tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-slate-700 dark:text-slate-200"}`}
      >
        {value}
      </span>
    </div>
  );
}

function SourceCard({
  source: s,
  canManage,
  canUpload,
  onUpload,
  onSync,
  syncing,
  onEdit,
  onPause,
}: {
  source: IntegrationRow;
  canManage: boolean;
  canUpload: boolean;
  onUpload: () => void;
  onSync: () => void;
  syncing: boolean;
  onEdit: () => void;
  onPause: () => void;
}) {
  const automated = s.integration_mode === "Automated API";
  const last = s.last_submission;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {automated ? (
              <Plug className="h-4 w-4 text-[#168FA8]" />
            ) : (
              <Database className="h-4 w-4 text-slate-500" />
            )}
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">{s.source_name}</h4>
          </div>
          <p className="text-[11px] text-slate-500">
            {s.integration_mode}
            {automated ? ` · ${s.auth_type}` : ""}
            {s.mapping_code
              ? ` · ${s.mapping_code} ${s.mapping_version ?? "(unpublished)"}`
              : " · no target mapping"}
          </p>
        </div>
        <span title={INTEGRATION_STATUS_HELP[s.status]}>
          <StatusBadge status={INTEGRATION_BADGE[s.status]}>
            {s.status}
            {s.active_job && s.status === "Running" ? ` ${s.active_job.progress}%` : ""}
          </StatusBadge>
        </span>
      </div>

      {s.note && <p className="text-xs text-slate-600 dark:text-slate-300">{s.note}</p>}
      {s.warnings.length > 0 && (
        <ul className="text-[11px] text-amber-700 space-y-0.5">
          {s.warnings.slice(0, 3).map((w, i) => (
            <li key={i} className="flex gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w.column}: {w.description}
            </li>
          ))}
          {s.warnings.length > 3 && <li>…and {s.warnings.length - 3} more</li>}
        </ul>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60">
        <Stat
          label="Last successful transfer"
          value={s.last_success_at ? formatDateTime(s.last_success_at) : "None yet"}
        />
        <Stat
          label="Last submission records"
          value={
            last
              ? `${last.records_received.toLocaleString()} · ${last.period}`
              : "No data submitted yet"
          }
        />
        <Stat
          label="Validation errors"
          value={last ? String(last.error_count) : "—"}
          tone={last?.error_count ? "bad" : undefined}
        />
        <Stat label="Expected schedule" value={s.schedule_cron || "Participant cadence"} />
        {automated && (
          <Stat
            label="Next scheduled pull"
            value={s.next_run_at ? formatDateTime(s.next_run_at) : "Not scheduled"}
          />
        )}
        {automated && <Stat label="Endpoint" value={s.endpoint_url_masked || "Not set"} />}
        <Stat label="Status set" value={`${s.source} · ${timeAgo(s.updated_at)}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canUpload && !automated && (
          <button
            onClick={onUpload}
            disabled={s.paused}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-[#168FA8] text-white hover:bg-[#0F6F83] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" /> Upload file
          </button>
        )}
        {canManage && automated && (
          <button
            onClick={onSync}
            disabled={!s.configured || s.paused || !!s.active_job || syncing}
            title={!s.configured ? "Configure the endpoint and credentials first" : undefined}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-[#168FA8] text-white hover:bg-[#0F6F83] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync now
          </button>
        )}
        {canManage && (
          <>
            <button
              onClick={onEdit}
              className="h-8 px-3 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" /> Configure
            </button>
            <button
              onClick={onPause}
              className="h-8 px-3 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 inline-flex items-center gap-1.5"
            >
              {s.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {s.paused ? "Resume" : "Pause"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---- add / configure a data source (REQ-INTG-005, Technical/Admin) ----------

function SourceFormModal({
  participantId,
  source,
  participants,
  onClose,
  onSaved,
}: {
  participantId?: number;
  source?: IntegrationRow;
  participants: Participant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const templates = useTemplates();
  const mappings = useMappings();
  const [form, setForm] = useState({
    participant_id: participantId ?? source?.participant_id ?? 0,
    source_name: source?.source_name ?? "",
    integration_mode: source?.integration_mode ?? ("Manual" as IntegrationRow["integration_mode"]),
    endpoint_url: "",
    auth_type: source?.auth_type ?? ("None" as IntegrationRow["auth_type"]),
    api_key: "",
    client_id: "",
    client_secret: "",
    token_url: "",
    schedule_cron: source?.schedule_cron ?? "",
    template_id: source?.template_id ?? null,
    mapping_id: source?.mapping_id ?? null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const cron = useCronPreview(form.schedule_cron);
  const automated = form.integration_mode === "Automated API";
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () => {
      const credentials =
        form.auth_type === "API Key" && form.api_key
          ? { api_key: form.api_key }
          : form.auth_type === "OAuth 2.0" &&
              (form.client_id || form.client_secret || form.token_url)
            ? {
                client_id: form.client_id,
                client_secret: form.client_secret,
                token_url: form.token_url,
              }
            : undefined;
      const body: IntegrationInput = {
        source_name: form.source_name,
        integration_mode: form.integration_mode,
        schedule_cron: form.schedule_cron,
        template_id: form.template_id,
        mapping_id: form.mapping_id,
        ...(automated ? { auth_type: form.auth_type } : {}),
        ...(automated && form.endpoint_url ? { endpoint_url: form.endpoint_url } : {}),
        ...(automated && credentials ? { credentials } : {}),
      };
      return source
        ? api.put(`/integrations/${source.id}`, body)
        : api.post("/integrations", { ...body, participant_id: form.participant_id });
    },
    onSuccess: onSaved,
    onError: (e) => {
      const inline = fieldErrors(e);
      setErrors(inline);
      setFormError(Object.keys(inline).length ? null : errorMessage(e));
    },
  });

  const participantTemplates = (templates.data ?? []).filter(
    (t) => t.participant_id === form.participant_id,
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-bold text-base text-slate-900 dark:text-white">
            {source ? `Configure ${source.source_name}` : "Add data source"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold mb-1">Institution</label>
            <select
              value={form.participant_id || ""}
              disabled={!!source || !!participantId}
              onChange={(e) => set({ participant_id: Number(e.target.value), template_id: null })}
              className={`${inputCls} ${border(errors.participant_id)}`}
            >
              <option value="">Select participant…</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            <FieldError message={errors.participant_id} />
          </div>
          <div>
            <label className="block font-semibold mb-1">Data source name</label>
            <input
              value={form.source_name}
              onChange={(e) => set({ source_name: e.target.value })}
              placeholder="e.g. Core Banking, Mobile Money"
              className={`${inputCls} ${border(errors.source_name)}`}
            />
            <FieldError message={errors.source_name} />
          </div>
          <div>
            <label className="block font-semibold mb-1">Integration type</label>
            <select
              value={form.integration_mode}
              onChange={(e) =>
                set({ integration_mode: e.target.value as IntegrationRow["integration_mode"] })
              }
              className={`${inputCls} ${border(errors.integration_mode)}`}
            >
              {INTEGRATION_MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              {automated
                ? "RDIP pulls from the institution's endpoint on the schedule below."
                : "The institution sends files; staff upload them on its behalf."}
            </p>
          </div>
          <div>
            <label className="block font-semibold mb-1">Expected submission schedule (cron)</label>
            <input
              value={form.schedule_cron}
              onChange={(e) => set({ schedule_cron: e.target.value })}
              placeholder={
                automated ? "0 * * * *  (hourly pull)" : "0 9 10 * *  (monthly by the 10th)"
              }
              className={`${inputCls} font-mono ${border(errors.schedule_cron || (cron.data && !cron.data.valid ? "x" : ""))}`}
            />
            <FieldError
              message={
                errors.schedule_cron ||
                (cron.data && !cron.data.valid ? cron.data.message : undefined)
              }
            />
            {cron.data?.valid && (
              <p className="mt-1 text-[11px] text-slate-500">
                Next: {cron.data.next_runs.slice(0, 2).map(formatDateTime).join(" · ")}
              </p>
            )}
            {!form.schedule_cron && (
              <p className="mt-1 text-[11px] text-slate-500">
                Blank: the participant's expected frequency applies.
              </p>
            )}
          </div>

          {automated && (
            <>
              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Endpoint URL</label>
                <input
                  value={form.endpoint_url}
                  onChange={(e) => set({ endpoint_url: e.target.value })}
                  placeholder={
                    source?.endpoint_url_masked
                      ? `Stored encrypted (${source.endpoint_url_masked}) — leave blank to keep`
                      : "https://api.institution.rw/rdip/summary"
                  }
                  className={`${inputCls} font-mono ${border(errors.endpoint_url)}`}
                />
                <FieldError message={errors.endpoint_url} />
                <p className="mt-1 text-[11px] text-slate-500">
                  Stored encrypted. RDIP appends <span className="font-mono">?since=</span> (last
                  successful transfer, UTC) so the source can send only new records.
                </p>
              </div>
              <div>
                <label className="block font-semibold mb-1">Authentication</label>
                <select
                  value={form.auth_type}
                  onChange={(e) =>
                    set({ auth_type: e.target.value as IntegrationRow["auth_type"] })
                  }
                  className={`${inputCls} ${border(errors.auth_type)}`}
                >
                  {AUTH_TYPES.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </div>
              {form.auth_type === "API Key" && (
                <div>
                  <label className="block font-semibold mb-1">API key</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={form.api_key}
                    onChange={(e) => set({ api_key: e.target.value })}
                    placeholder={
                      source?.credentials_masked.api_key
                        ? `Stored (${source.credentials_masked.api_key}) — blank keeps it`
                        : "Sent as X-API-Key"
                    }
                    className={`${inputCls} font-mono ${border(errors.credentials)}`}
                  />
                  <FieldError message={errors.credentials} />
                </div>
              )}
              {form.auth_type === "OAuth 2.0" && (
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(["client_id", "client_secret", "token_url"] as const).map((k) => (
                    <div key={k}>
                      <label className="block font-semibold mb-1">{k.replace("_", " ")}</label>
                      <input
                        type={k === "client_secret" ? "password" : "text"}
                        autoComplete="off"
                        value={form[k]}
                        onChange={(e) => set({ [k]: e.target.value })}
                        placeholder={
                          source?.credentials_masked[k]
                            ? `Stored (${source.credentials_masked[k]})`
                            : ""
                        }
                        className={`${inputCls} font-mono ${border(errors.credentials || errors[k])}`}
                      />
                    </div>
                  ))}
                  <div className="sm:col-span-3">
                    <FieldError message={errors.credentials || errors.token_url} />
                    <p className="text-[11px] text-slate-500">
                      Client-credentials grant; all three are needed and are stored encrypted.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <label className="block font-semibold mb-1">Expected schema</label>
            <select
              value={form.template_id ?? ""}
              onChange={(e) => set({ template_id: e.target.value ? Number(e.target.value) : null })}
              className={`${inputCls} ${border(errors.template_id)}`}
            >
              <option value="">Participant's latest template</option>
              {participantTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} v{t.version} (TPL-{t.id})
                </option>
              ))}
            </select>
            <FieldError message={errors.template_id} />
          </div>
          <div>
            <label className="block font-semibold mb-1">Target mapping</label>
            <select
              value={form.mapping_id ?? ""}
              onChange={(e) => set({ mapping_id: e.target.value ? Number(e.target.value) : null })}
              className={`${inputCls} ${border(errors.mapping_id)}`}
            >
              <option value="">None — keep source field names</option>
              {(mappings.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} {m.name} ({m.version ?? "not published"})
                </option>
              ))}
            </select>
            <FieldError message={errors.mapping_id} />
            <p className="mt-1 text-[11px] text-slate-500">
              The pipeline applies its active published version.
            </p>
          </div>
          {formError && <p className="sm:col-span-2 text-red-600 font-medium">{formError}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.participant_id || !form.source_name.trim()}
          >
            {save.isPending ? "Saving…" : source ? "Save configuration" : "Add data source"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ---- submission history per participant (REQ-INTG-011) ----------------------

function HistoryDrawer({
  participant,
  canDownload,
  onClose,
}: {
  participant: Participant;
  canDownload: boolean;
  onClose: () => void;
}) {
  const [openId, setOpenId] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const list = useParticipantSubmissions(participant.id);
  const detail = useSubmission(openId);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 p-6 shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
          <div>
            <h2 className="font-bold text-base text-slate-900 dark:text-white">
              Submission history
            </h2>
            <p className="text-xs text-[#168FA8] font-semibold">
              {participant.name} · {participant.code} — every transfer, failed attempts included
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {list.isLoading && <div className="text-xs text-slate-400">Loading…</div>}
        {list.error && <div className="text-xs text-red-600">{errorMessage(list.error)}</div>}
        {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
        {list.data?.length === 0 && (
          <div className="text-xs text-slate-400">No data submitted yet.</div>
        )}
        <div className="space-y-2">
          {list.data?.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold">
                  SUB-{s.id} · {s.period}
                </span>
                <StatusBadge status={SUBMISSION_BADGE[s.status] ?? "draft"}>{s.status}</StatusBadge>
              </div>
              <div className="text-slate-500">
                {s.source_name ?? "Data submission"} · {s.requirement_name ?? "no register entry"} ·
                by {s.uploaded_by} · {formatDateTime(s.uploaded_at)}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                <span>Records: {s.records_received.toLocaleString()}</span>
                <span className={s.error_count ? "text-red-600" : ""}>Errors: {s.error_count}</span>
                <span className={s.warning_count ? "text-amber-600" : ""}>
                  Warnings: {s.warning_count}
                </span>
                {s.job && (
                  <span>
                    JOB-{s.job.id}: {s.job.status}
                  </span>
                )}
                {s.loaded_at && <span>Loaded {timeAgo(s.loaded_at)}</span>}
              </div>
              {(s.replaces_submission_id || s.replaced_by_id) && (
                <div className="text-[11px] text-slate-500">
                  {s.replaces_submission_id ? `Corrects SUB-${s.replaces_submission_id}. ` : ""}
                  {s.replaced_by_id ? `Corrected by SUB-${s.replaced_by_id}.` : ""}
                </div>
              )}
              <div className="flex gap-3">
                {(s.error_count > 0 || s.warning_count > 0) && (
                  <button
                    onClick={() => setOpenId(openId === s.id ? undefined : s.id)}
                    className="text-[11px] font-semibold text-[#168FA8] hover:underline"
                  >
                    {openId === s.id ? "Hide report" : "View report"}
                  </button>
                )}
                {canDownload && (
                  <button
                    onClick={() =>
                      api
                        .download(`/submissions/${s.id}/download`, s.filename)
                        .catch((e) => setError(errorMessage(e)))
                    }
                    className="text-[11px] font-semibold text-[#168FA8] hover:underline"
                  >
                    Download file
                  </button>
                )}
              </div>
              {openId === s.id && (
                <IssueReport loading={detail.isLoading} submission={detail.data} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IssueReport({ loading, submission }: { loading: boolean; submission?: Submission }) {
  if (loading || !submission)
    return <div className="text-[11px] text-slate-400">Loading report…</div>;
  const rows = [
    ...normalizeIssues(submission.errors).map((i) => ({ ...i, level: "Error" })),
    ...normalizeIssues(submission.warnings).map((i) => ({ ...i, level: "Warning" })),
  ];
  return (
    <table className="w-full text-[11px] border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <thead className="bg-slate-100 dark:bg-slate-800 text-left">
        <tr>
          <th className="px-2 py-1">Row</th>
          <th className="px-2 py-1">Column</th>
          <th className="px-2 py-1">Problem</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((r, i) => (
          <tr
            key={i}
            className={r.level === "Error" ? "text-red-700 dark:text-red-300" : "text-amber-700"}
          >
            <td className="px-2 py-1 font-mono whitespace-nowrap">{issueWhere(r)}</td>
            <td className="px-2 py-1 font-mono">{r.column}</td>
            <td className="px-2 py-1">
              {r.level}: {r.description}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
