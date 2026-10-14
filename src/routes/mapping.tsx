import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  GitBranch,
  Lock,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { formatDateTime } from "@/lib/integrations";
import {
  MAPPING_BADGE,
  unmappedOf,
  useMapping,
  useMappings,
  useMappingVersion,
  useMappingVersions,
  useStandards,
  type FieldRule,
  type Mapping,
} from "@/lib/mapping";
import { useParticipants, useTemplateColumns, useTemplates } from "@/lib/queries";
import { hasCap } from "@/lib/roles";
import type { Template, TemplateColumn } from "@/lib/types";

export const Route = createFileRoute("/mapping")({
  component: MappingPage,
});

const inputCls =
  "w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border text-slate-900 dark:text-white focus:outline-none text-xs";
const border = (bad?: string) =>
  bad ? "border-red-400" : "border-slate-200 dark:border-slate-700";
const COLUMN_TYPES = ["string", "number", "date", "enum"];

function MappingPage() {
  const { role } = useRole();
  const canView = hasCap(role, "mapping.view");
  const canManage = hasCap(role, "mapping.manage");
  const [tab, setTab] = useState<"mappings" | "schemas">("mappings");

  // REQ-MAP-009: Technical/Admin only; the API refuses everyone else too.
  if (!canView) {
    return (
      <AppShell
        title="Standards & Mapping"
        breadcrumb="CONNECT › INTEGRATIONS › STANDARDS & MAPPING"
      >
        <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg mx-auto mt-10 space-y-3">
          <Lock className="h-10 w-10 text-amber-500 mx-auto" />
          <h2 className="font-bold text-base text-slate-800 dark:text-white">
            You do not have permission to perform this action.
          </h2>
          <p className="text-xs text-slate-500">
            Standards & Mapping is a Technical/Admin configuration tool.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Standards & Mapping"
      subtitle="How incoming data is normalised"
      breadcrumb="CONNECT › INTEGRATIONS › STANDARDS & MAPPING"
      scope="Technical Configuration"
      toolbar={
        <div className="flex items-center gap-2">
          <Link
            to="/integrations"
            className="h-8 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#168FA8]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Integrations
          </Link>
          {(["mappings", "schemas"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-8 px-3 rounded-xl text-xs font-semibold border ${
                tab === t
                  ? "bg-[#168FA8] text-white border-[#168FA8]"
                  : "bg-white dark:bg-slate-800 border-[#DCE3E8] dark:border-slate-700"
              }`}
            >
              {t === "mappings" ? "Field mappings" : "Source schemas"}
            </button>
          ))}
        </div>
      }
    >
      {tab === "mappings" ? (
        <Mappings canManage={canManage} />
      ) : (
        <SourceSchemas canManage={canManage} />
      )}
    </AppShell>
  );
}

// ---- field mappings (REQ-MAP-001..008) ----------------------------------------

function Mappings({ canManage }: { canManage: boolean }) {
  const mappings = useMappings();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const clone = useMutation({
    mutationFn: (m: Mapping) =>
      api.post<Mapping>(`/integrations/mappings/${m.id}/clone`, { name: `${m.name} (copy)` }),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
      setOpenId(copy.id);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (mappings.data ?? []).filter(
      (m) =>
        !q ||
        m.code.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.source_system.toLowerCase().includes(q),
    );
  }, [mappings.data, search]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7B8798]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mapping ID, name or source…"
            className="h-9 pl-8 pr-3 rounded-xl text-xs w-72 bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 focus:outline-none"
          />
        </div>
        {canManage && (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New mapping
          </PrimaryButton>
        )}
      </div>
      {(mappings.error || error) && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {mappings.error ? `Couldn't load mappings: ${errorMessage(mappings.error)}` : error}
        </div>
      )}
      <SectionCard noPad>
        {mappings.isLoading && (
          <div className="px-4 py-6 text-center text-xs text-slate-400">Loading…</div>
        )}
        {!mappings.isLoading && filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            {(mappings.data ?? []).length ? "No mappings match." : "No mappings defined yet."}
          </div>
        )}
        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100/70 dark:bg-slate-800/70 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Mapping ID</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Source system</th>
                  <th className="px-4 py-2.5">Target standard</th>
                  <th className="px-4 py-2.5">Version</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Mapped / total</th>
                  <th className="px-4 py-2.5">Used by</th>
                  {canManage && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                    onClick={() => setOpenId(m.id)}
                  >
                    <td className="px-4 py-2.5 font-mono font-bold">{m.code}</td>
                    <td className="px-4 py-2.5 font-semibold">{m.name}</td>
                    <td className="px-4 py-2.5">{m.source_system || "—"}</td>
                    <td className="px-4 py-2.5">{m.target_standard}</td>
                    <td className="px-4 py-2.5 font-mono">
                      {m.version ?? "—"}
                      {m.has_draft && m.version && (
                        <span className="ml-1 text-[10px] text-amber-600">+ draft</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={MAPPING_BADGE[m.status]}>{m.status}</StatusBadge>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono ${m.mapped_count < m.total_count ? "text-amber-600" : ""}`}
                    >
                      {m.mapped_count} / {m.total_count}
                    </td>
                    <td className="px-4 py-2.5">
                      {m.used_by ? `${m.used_by} data source(s)` : "—"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => clone.mutate(m)}
                          disabled={clone.isPending}
                          className="inline-flex items-center gap-1 text-[#168FA8] font-semibold"
                          title="Clone as the starting point for a new mapping"
                        >
                          <Copy className="h-3.5 w-3.5" /> Clone
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      {openId !== null && (
        <MappingDetail id={openId} canManage={canManage} onClose={() => setOpenId(null)} />
      )}
      {creating && (
        <CreateMapping
          onClose={() => setCreating(false)}
          onCreated={(m) => {
            setCreating(false);
            setOpenId(m.id);
          }}
        />
      )}
    </>
  );
}

function CreateMapping({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (m: Mapping) => void;
}) {
  const standards = useStandards();
  const templates = useTemplates();
  const participants = useParticipants();
  const [form, setForm] = useState({
    name: "",
    source_system: "",
    target_standard: "JSON Canonical",
    source_template_id: 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () =>
      api.post<Mapping>("/integrations/mappings", {
        ...form,
        source_template_id: form.source_template_id || null,
      }),
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
      onCreated(m);
    },
    onError: (e) => setErrors({ ...fieldErrors(e), _: errorMessage(e) }),
  });
  const participantName = (id: number) =>
    participants.data?.find((p) => p.id === id)?.code ?? `#${id}`;

  return (
    <Modal title="New mapping" onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div>
          <label className="block font-semibold mb-1">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={`${inputCls} ${border(errors.name)}`}
          />
          {errors.name && <p className="mt-1 text-[11px] text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label className="block font-semibold mb-1">Source system</label>
          <input
            value={form.source_system}
            onChange={(e) => setForm({ ...form, source_system: e.target.value })}
            placeholder="e.g. Bank core banking export"
            className={`${inputCls} ${border()}`}
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">
            Source schema (its columns become the source fields)
          </label>
          <select
            value={form.source_template_id || ""}
            onChange={(e) => setForm({ ...form, source_template_id: Number(e.target.value) })}
            className={`${inputCls} ${border(errors.source_template_id)}`}
          >
            <option value="">None — add source fields by hand</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {participantName(t.participant_id)} · {t.name} v{t.version} (TPL-{t.id})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1">Target standard</label>
          <select
            value={form.target_standard}
            onChange={(e) => setForm({ ...form, target_standard: e.target.value })}
            className={`${inputCls} ${border(errors.target_standard)}`}
          >
            {Object.keys(standards.data?.standards ?? { "JSON Canonical": [] }).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {errors._ && !errors.name && <p className="text-red-600">{errors._}</p>}
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton
          onClick={() => create.mutate()}
          disabled={create.isPending || !form.name.trim()}
        >
          {create.isPending ? "Creating…" : "Create draft"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function MappingDetail({
  id,
  canManage,
  onClose,
}: {
  id: number;
  canManage: boolean;
  onClose: () => void;
}) {
  const mapping = useMapping(id);
  const versions = useMappingVersions(id);
  const standards = useStandards();
  const [view, setView] = useState<"draft" | "active" | "history">("draft");
  const [historyId, setHistoryId] = useState<number | null>(null);
  const historyVersion = useMappingVersion(id, historyId);
  const [rules, setRules] = useState<FieldRule[]>([]);
  const [dirty, setDirty] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmUnmapped, setConfirmUnmapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ruleErrors, setRuleErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const m = mapping.data;
  useEffect(() => {
    if (m && !dirty) {
      setRules((m.draft?.rules ?? []).map((r) => ({ ...r })));
      if (!m.draft && m.active_version) setView((v) => (v === "draft" ? "active" : v));
    }
  }, [m, dirty]);

  const targets = standards.data?.standards[m?.target_standard ?? ""] ?? [];
  const unmapped = unmappedOf(rules);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["mappings"] });
    setDirty(false);
    setError(null);
    setRuleErrors({});
  };
  const onError = (e: unknown) => {
    setRuleErrors(fieldErrors(e));
    setError(errorMessage(e));
  };
  const startDraft = useMutation({
    mutationFn: () => api.post(`/integrations/mappings/${id}/draft`),
    onSuccess: () => {
      refresh();
      setView("draft");
    },
    onError,
  });
  const saveDraft = useMutation({
    mutationFn: () => api.put(`/integrations/mappings/${id}/draft`, { rules }),
    onSuccess: refresh,
    onError,
  });
  const discard = useMutation({
    mutationFn: () => api.delete(`/integrations/mappings/${id}/draft`),
    onSuccess: refresh,
    onError,
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await api.put(`/integrations/mappings/${id}/draft`, { rules });
      return api.post(`/integrations/mappings/${id}/publish`, {
        notes,
        confirm_unmapped: confirmUnmapped,
      });
    },
    onSuccess: () => {
      refresh();
      setNotes("");
      setConfirmUnmapped(false);
      setView("active");
    },
    onError,
  });

  const updateRule = (index: number, patch: Partial<FieldRule>) => {
    setRules((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 p-6 shadow-2xl overflow-y-auto space-y-4">
        <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-[#168FA8]" />
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                {m ? `${m.code} · ${m.name}` : "Loading…"}
              </h2>
              {m && <StatusBadge status={MAPPING_BADGE[m.status]}>{m.status}</StatusBadge>}
            </div>
            {m && (
              <p className="text-xs text-slate-500">
                {m.source_system || "Source not described"} → {m.target_standard} · active{" "}
                {m.version ?? "— never published"} · {m.mapped_count}/{m.total_count} fields mapped
                {m.source_template_name ? ` · source schema ${m.source_template_name}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-2 text-xs">
          {(["draft", "active", "history"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`h-8 px-3 rounded-lg font-semibold ${view === v ? "bg-[#168FA8] text-white" : "bg-slate-100 dark:bg-slate-800"}`}
            >
              {v === "draft"
                ? "Draft"
                : v === "active"
                  ? `Active version${m?.version ? ` (${m.version})` : ""}`
                  : "Version history"}
            </button>
          ))}
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {view === "draft" && m && (
          <div className="space-y-3">
            {!m.draft ? (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                <p>
                  Published versions are immutable. Changes are made on a draft, which becomes the
                  next version when published.
                </p>
                {canManage && (
                  <PrimaryButton
                    onClick={() => startDraft.mutate()}
                    disabled={startDraft.isPending}
                  >
                    Start a draft from {m.version}
                  </PrimaryButton>
                )}
              </div>
            ) : (
              <>
                <RulesTable
                  rules={rules}
                  targets={targets.map((t) => ({
                    value: t.name,
                    label: `${t.name} (${t.type})`,
                    title: t.description,
                  }))}
                  transforms={standards.data?.transforms ?? []}
                  editable={canManage}
                  errors={ruleErrors}
                  onChange={updateRule}
                  onRemove={(i) => {
                    setRules((rs) => rs.filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                  onAdd={() => {
                    setRules((rs) => [
                      ...rs,
                      { source_field: "", target_field: "", transform: "" },
                    ]);
                    setDirty(true);
                  }}
                />
                {canManage && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 text-xs">
                    {/* REQ-MAP-008: warn about unmapped fields before publishing. */}
                    {unmapped.length > 0 && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800 space-y-2">
                        <div className="flex items-center gap-2 font-bold">
                          <AlertTriangle className="h-4 w-4" /> {unmapped.length} of {rules.length}{" "}
                          fields are unmapped
                        </div>
                        <p>
                          {unmapped.join(", ")} will not be loaded by the pipeline, and the mapping
                          will show as Warning.
                        </p>
                        <label className="flex items-center gap-2 font-semibold">
                          <input
                            type="checkbox"
                            checked={confirmUnmapped}
                            onChange={(e) => setConfirmUnmapped(e.target.checked)}
                          />
                          Publish with unmapped fields
                        </label>
                      </div>
                    )}
                    <div>
                      <label className="block font-semibold mb-1">Release notes</label>
                      <input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="What changed in this version"
                        className={`${inputCls} ${border()}`}
                      />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {m.active_version && (
                        <SecondaryButton onClick={() => discard.mutate()}>
                          Discard draft
                        </SecondaryButton>
                      )}
                      <SecondaryButton onClick={() => saveDraft.mutate()}>
                        {saveDraft.isPending ? "Saving…" : "Save draft"}
                      </SecondaryButton>
                      <PrimaryButton
                        onClick={() => publish.mutate()}
                        disabled={
                          publish.isPending ||
                          (unmapped.length > 0 && !confirmUnmapped) ||
                          rules.length === unmapped.length
                        }
                      >
                        {publish.isPending
                          ? "Publishing…"
                          : `Publish as v${(versions.data?.[0]?.number ?? 0) + 1}.0`}
                      </PrimaryButton>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {view === "active" &&
          m &&
          (m.active_version ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                {m.active_version.label} published by {m.active_version.published_by} on{" "}
                {formatDateTime(m.active_version.published_at)} — applied automatically by the
                pipeline.
              </p>
              <RulesTable
                rules={m.active_version.rules ?? []}
                targets={[]}
                transforms={standards.data?.transforms ?? []}
                editable={false}
              />
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Not published yet — the pipeline won't apply this mapping until it is.
            </p>
          ))}

        {view === "history" && (
          <div className="space-y-2 text-xs">
            {versions.data?.length === 0 && (
              <p className="text-slate-500">No published versions yet.</p>
            )}
            {versions.data?.map((v) => (
              <div
                key={v.id}
                className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold">
                    {v.label}
                    {m?.active_version?.id === v.id && (
                      <span className="ml-2 text-[10px] text-emerald-600">active</span>
                    )}
                  </span>
                  <span className="text-slate-500">
                    Published by {v.published_by} · {formatDateTime(v.published_at)}
                  </span>
                </div>
                <div className="text-slate-500 mt-1">
                  {v.mapped_count}/{v.total_count} fields mapped{v.notes ? ` · ${v.notes}` : ""}
                </div>
                <button
                  onClick={() => setHistoryId(historyId === v.id ? null : v.id)}
                  className="mt-1 text-[#168FA8] font-semibold"
                >
                  {historyId === v.id ? "Hide rules" : "View rules"}
                </button>
                {historyId === v.id && historyVersion.data && (
                  <div className="mt-2">
                    <RulesTable
                      rules={historyVersion.data.rules ?? []}
                      targets={[]}
                      transforms={standards.data?.transforms ?? []}
                      editable={false}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RulesTable({
  rules,
  targets,
  transforms,
  editable,
  errors = {},
  onChange,
  onRemove,
  onAdd,
}: {
  rules: FieldRule[];
  targets: { value: string; label: string; title: string }[];
  transforms: { key: string; label: string }[];
  editable: boolean;
  errors?: Record<string, string>;
  onChange?: (index: number, patch: Partial<FieldRule>) => void;
  onRemove?: (index: number) => void;
  onAdd?: () => void;
}) {
  const transformLabel = (key: string) =>
    transforms.find((t) => t.key === key)?.label ?? (key || "Copy as is");
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-xs">
        <thead className="bg-slate-100 dark:bg-slate-800 text-left">
          <tr>
            <th className="px-3 py-2">Source field</th>
            <th className="px-3 py-2">Target field</th>
            <th className="px-3 py-2">Transform</th>
            {editable && <th className="px-3 py-2 w-8" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rules.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-center text-slate-400">
                No fields.
              </td>
            </tr>
          )}
          {rules.map((r, i) => {
            const rowError =
              errors[`rules.${i}.source_field`] ||
              errors[`rules.${i}.target_field`] ||
              errors[`rules.${i}.transform`];
            return (
              <tr key={i} className={!r.target_field ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                <td className="px-3 py-1.5 font-mono">
                  {editable ? (
                    <input
                      value={r.source_field}
                      onChange={(e) => onChange?.(i, { source_field: e.target.value })}
                      className={`${inputCls} h-8 ${border(errors[`rules.${i}.source_field`])}`}
                    />
                  ) : (
                    r.source_field
                  )}
                  {rowError && (
                    <p className="mt-1 text-[11px] text-red-600 font-sans">{rowError}</p>
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono">
                  {editable ? (
                    <select
                      value={r.target_field}
                      onChange={(e) => onChange?.(i, { target_field: e.target.value })}
                      className={`${inputCls} h-8 ${border(errors[`rules.${i}.target_field`])}`}
                    >
                      <option value="">— unmapped —</option>
                      {targets.map((t) => (
                        <option key={t.value} value={t.value} title={t.title}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    r.target_field || <span className="text-amber-600 font-sans">unmapped</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {editable ? (
                    <select
                      value={r.transform}
                      onChange={(e) => onChange?.(i, { transform: e.target.value })}
                      className={`${inputCls} h-8 ${border()}`}
                    >
                      {transforms.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    transformLabel(r.transform)
                  )}
                </td>
                {editable && (
                  <td className="px-2">
                    <button
                      onClick={() => onRemove?.(i)}
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Remove field"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {editable && (
        <button
          onClick={onAdd}
          className="w-full py-2 text-xs font-semibold text-[#168FA8] border-t border-slate-200 dark:border-slate-700"
        >
          + Add source field
        </button>
      )}
    </div>
  );
}

// ---- source schemas (ingestion templates, REQ-INTG-008) -----------------------

function SourceSchemas({ canManage }: { canManage: boolean }) {
  const templates = useTemplates();
  const participants = useParticipants();
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const name = (id: number) =>
    participants.data?.find((p) => p.id === id)?.name ?? `Participant #${id}`;
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-500 max-w-2xl">
          The columns each file or API payload must have. Uploads and pulls are validated against
          them before anything is loaded; mappings take their source fields from them.
        </p>
        {canManage && (
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New schema
          </PrimaryButton>
        )}
      </div>
      <SectionCard noPad>
        {templates.isLoading && (
          <div className="px-4 py-6 text-center text-xs text-slate-400">Loading…</div>
        )}
        {templates.data?.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-slate-400">No source schemas yet.</div>
        )}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {templates.data?.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpenId(t.id)}
              className="w-full text-left px-4 py-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 flex justify-between"
            >
              <span>
                <span className="font-mono font-bold mr-2">TPL-{t.id}</span>
                <span className="font-semibold">{t.name}</span> · {name(t.participant_id)}
              </span>
              <span className="font-mono text-[#168FA8]">v{t.version}</span>
            </button>
          ))}
        </div>
      </SectionCard>
      {openId !== null && templates.data?.find((t) => t.id === openId) && (
        <SchemaEditor
          template={templates.data.find((t) => t.id === openId)!}
          canManage={canManage}
          onClose={() => setOpenId(null)}
        />
      )}
      {creating && (
        <CreateSchema
          onClose={() => setCreating(false)}
          onCreated={(t) => {
            setCreating(false);
            setOpenId(t.id);
          }}
        />
      )}
    </>
  );
}

function CreateSchema({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: Template) => void;
}) {
  const participants = useParticipants();
  const [participantId, setParticipantId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => api.post<Template>("/templates", { participant_id: participantId, name }),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      onCreated(t);
    },
    onError: (e) => setErrors({ ...fieldErrors(e), _: errorMessage(e) }),
  });
  return (
    <Modal title="New source schema" onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div>
          <label className="block font-semibold mb-1">Participant</label>
          <select
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value ? Number(e.target.value) : "")}
            className={`${inputCls} ${border(errors.participant_id)}`}
          >
            <option value="">Select participant…</option>
            {participants.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Monthly transaction report"
            className={`${inputCls} ${border(errors.name)}`}
          />
        </div>
        {errors._ && <p className="text-red-600">{errors._}</p>}
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton
          onClick={() => create.mutate()}
          disabled={!participantId || !name.trim() || create.isPending}
        >
          Create & add columns
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function SchemaEditor({
  template,
  canManage,
  onClose,
}: {
  template: Template;
  canManage: boolean;
  onClose: () => void;
}) {
  const columns = useTemplateColumns(template.id);
  const [col, setCol] = useState({ name: "", type: "string", rule: "", required: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["templates"] });
  const onError = (e: unknown) => setErrors({ ...fieldErrors(e), _: errorMessage(e) });
  const add = useMutation({
    mutationFn: () =>
      api.post<TemplateColumn>(`/templates/${template.id}/columns`, {
        template_id: template.id,
        ...col,
        position: columns.data?.length ?? 0,
      }),
    onSuccess: () => {
      refresh();
      setCol({ name: "", type: "string", rule: "", required: true });
      setErrors({});
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (c: TemplateColumn) => api.delete(`/templates/${template.id}/columns/${c.id}`),
    onSuccess: refresh,
    onError,
  });
  const bump = useMutation({
    mutationFn: () => api.post(`/templates/${template.id}/publish`),
    onSuccess: refresh,
    onError,
  });

  return (
    <Modal
      title={`TPL-${template.id} · ${template.name} (v${template.version})`}
      onClose={onClose}
      wide
    >
      <table className="w-full text-xs">
        <thead className="bg-slate-100 dark:bg-slate-800 text-left">
          <tr>
            <th className="px-3 py-2">Column</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Rule</th>
            <th className="px-3 py-2">Required</th>
            {canManage && <th className="px-3 py-2 w-8" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
          {columns.data?.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-slate-400 font-sans">
                No columns yet.
              </td>
            </tr>
          )}
          {columns.data?.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2">{c.name}</td>
              <td className="px-3 py-2 text-[#168FA8]">{c.type}</td>
              <td className="px-3 py-2">{c.rule || "—"}</td>
              <td className="px-3 py-2 font-sans">{c.required ? "Required" : "Optional"}</td>
              {canManage && (
                <td className="px-2">
                  <button
                    onClick={() => remove.mutate(c)}
                    className="text-slate-400 hover:text-red-600"
                    aria-label={`Remove ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canManage && (
        <div className="grid grid-cols-12 gap-2 items-end text-xs pt-2">
          <div className="col-span-4">
            <label className="block font-semibold mb-1">Column name</label>
            <input
              value={col.name}
              onChange={(e) => setCol({ ...col, name: e.target.value })}
              className={`${inputCls} font-mono ${border(errors.name)}`}
            />
          </div>
          <div className="col-span-2">
            <label className="block font-semibold mb-1">Type</label>
            <select
              value={col.type}
              onChange={(e) => setCol({ ...col, type: e.target.value })}
              className={`${inputCls} ${border(errors.type)}`}
            >
              {COLUMN_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="col-span-3">
            <label className="block font-semibold mb-1">Rule</label>
            <input
              value={col.rule}
              onChange={(e) => setCol({ ...col, rule: e.target.value })}
              placeholder={col.type === "enum" ? "POS|ATM|Web" : "regex:^[A-Z]+$ (optional)"}
              className={`${inputCls} font-mono ${border()}`}
            />
          </div>
          <label className="col-span-1 flex items-center gap-1 h-9 font-semibold">
            <input
              type="checkbox"
              checked={col.required}
              onChange={(e) => setCol({ ...col, required: e.target.checked })}
            />
            Req.
          </label>
          <div className="col-span-2">
            <PrimaryButton
              onClick={() => add.mutate()}
              disabled={!col.name.trim() || add.isPending}
            >
              Add
            </PrimaryButton>
          </div>
        </div>
      )}
      {errors._ && <p className="text-xs text-red-600">{errors.name || errors._}</p>}
      <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
        {canManage && (
          <SecondaryButton onClick={() => bump.mutate()}>
            Mark as v{template.version + 1}
          </SecondaryButton>
        )}
        <SecondaryButton onClick={onClose}>Close</SecondaryButton>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-bold text-base text-slate-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
