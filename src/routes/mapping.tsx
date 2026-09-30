import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useParticipants, useTemplateColumns, useTemplates } from "@/lib/queries";
import type { Template, TemplateColumn } from "@/lib/types";
import {
  Plus,
  Edit2,
  Copy,
  Trash2,
  ChevronDown,
  ChevronRight,
  Check,
  AlertTriangle,
  GitBranch,
  Search,
  X,
  RotateCcw,
  CheckCircle2,
  Lock,
} from "lucide-react";

export const Route = createFileRoute("/mapping")({
  component: MappingPage,
});

const COLUMN_TYPES = ["string", "number", "date", "enum"];

function MappingPage() {
  const { role } = useRole();
  const canManageMapping = canManage(role, "mapping");
  const queryClient = useQueryClient();

  const templates = useTemplates();
  const participants = useParticipants();

  const [search, setSearch] = useState("");
  const [error, setError]   = useState<string | null>(null);

  // Modals state
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState("Monthly transaction report");
  const [newParticipant, setNewParticipant] = useState<number | "">("");
  const [col, setCol] = useState({ name: "", type: "string", rule: "", required: true });

  const editing = templates.data?.find((t) => t.id === editingId) ?? null;
  const columns = useTemplateColumns(editingId ?? undefined);

  const participantName = (id: number) => participants.data?.find((p) => p.id === id)?.name ?? `Participant #${id}`;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (templates.data ?? []).filter(
      (t) => q === "" || t.name.toLowerCase().includes(q) || participantName(t.participant_id).toLowerCase().includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.data, participants.data, search]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["templates"] });
  const onError = (e: unknown) => setError(errorMessage(e));

  const publish = useMutation({
    mutationFn: (t: Template) => api.post<Template>(`/templates/${t.id}/publish`),
    onSuccess: invalidate,
    onError,
  });

  const create = useMutation({
    mutationFn: () => api.post<Template>("/templates", { name: newName.trim(), participant_id: Number(newParticipant) }),
    onSuccess: (t) => {
      invalidate();
      setShowCreate(false);
      setEditingId(t.id);
    },
    onError,
  });

  // Clone = new template for the same participant with the same columns.
  const clone = useMutation({
    mutationFn: async (t: Template) => {
      const cols = await api.get<TemplateColumn[]>(`/templates/${t.id}/columns`);
      const copy = await api.post<Template>("/templates", {
        name: `${t.name} (Copy)`,
        participant_id: t.participant_id,
        applies_to: t.applies_to,
      });
      for (const c of cols) {
        await api.post(`/templates/${copy.id}/columns`, {
          template_id: copy.id,
          name: c.name,
          type: c.type,
          rule: c.rule,
          required: c.required,
          position: c.position,
        });
      }
      return copy;
    },
    onSuccess: invalidate,
    onError,
  });

  const addColumn = useMutation({
    mutationFn: () =>
      api.post<TemplateColumn>(`/templates/${editingId}/columns`, {
        template_id: editingId,
        ...col,
        name: col.name.trim(),
        position: columns.data?.length ?? 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates", editingId, "columns"] });
      setCol({ name: "", type: "string", rule: "", required: true });
    },
    onError,
  });

  // If business user attempts access, show access control note per §5.5 REQ-MAP-009
  if (role === "business") {
    return (
      <AppShell title="Standards & Mapping" breadcrumb="CONNECT › MAPPING" scope="Technical Only">
        <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg mx-auto mt-10 space-y-3">
          <Lock className="h-10 w-10 text-amber-500 mx-auto" />
          <h2 className="font-bold text-base text-slate-800 dark:text-white">Technical Configuration Restricted (§5.5)</h2>
          <p className="text-xs text-slate-500">
            Per SRS §5.5, Standards & Mapping is exposed strictly as a Technical/Admin configuration interface. Business users have no operational need to access raw field translation schemas.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Mapping & Schemas"
      subtitle="Per-participant ingestion templates"
      breadcrumb="CONNECT › STANDARDS & MAPPING"
      scope="Technical Configuration"
      primaryAction={
        canManageMapping ? (
          <PrimaryButton
            icon={<Plus className="h-4 w-4" />}
            onClick={() => { setError(null); setShowCreate(true); }}
          >
            New Ingestion Template
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7B8798]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates or participants…"
              className="h-8 pl-8 pr-3 rounded-xl text-xs w-60 bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#172033] dark:text-white focus:outline-none font-sans"
            />
          </div>

        </>
      }
    >
      {(templates.error || error) && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 flex items-center justify-between">
          <span>{templates.error ? `Couldn't load templates: ${errorMessage(templates.error)}` : error}</span>
          {error && <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>}
        </div>
      )}
      {templates.isLoading && <div className="py-10 text-center text-sm text-slate-400">Loading templates…</div>}
      {/* Mapping Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4 mb-6">
        {filtered.map((m) => (
          <div key={m.id} className="rounded-2xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-xs">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300">TPL-{m.id}</span>
                  <span className="font-mono text-[11px] font-bold text-[#168FA8]">v{m.version}</span>
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{m.name}</h3>
                <p className="text-xs text-slate-500">{participantName(m.participant_id)} → RDIP submission</p>
              </div>
              <StatusBadge status="active" />
            </div>

            <div className="grid grid-cols-2 gap-2 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-400 block">Applies To</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{m.applies_to || "—"}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Created</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{m.created_at.slice(0, 10)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => { setError(null); setEditingId(m.id); }}
                className="flex-1 h-9 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Edit2 className="h-3.5 w-3.5" />
                {canManageMapping ? "Edit Columns" : "View Columns"}
              </button>

              {canManageMapping && (
                <>
                  <button
                    onClick={() => publish.mutate(m)}
                    disabled={publish.isPending}
                    className="h-9 px-3 rounded-xl text-xs font-semibold bg-[#168FA8] text-white hover:bg-[#0F6F83] flex items-center gap-1 transition-all cursor-pointer"
                    title="Publish a new version"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Publish v{m.version + 1}
                  </button>

                  <button
                    onClick={() => clone.mutate(m)}
                    disabled={clone.isPending}
                    className="h-9 px-3 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-all cursor-pointer"
                    title="Clone template with its columns"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Clone
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Column Editor */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-bold text-base text-slate-900 dark:text-white">Template Columns</h2>
                <p className="text-xs text-[#168FA8] font-semibold">{editing.name} (v{editing.version}) · {participantName(editing.participant_id)}</p>
              </div>
              <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">#</th>
                      <th className="px-3 py-2 text-left font-semibold">Column</th>
                      <th className="px-3 py-2 text-left font-semibold">Type</th>
                      <th className="px-3 py-2 text-left font-semibold">Rule</th>
                      <th className="px-3 py-2 text-center font-semibold">Required</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {columns.isLoading && (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">Loading…</td></tr>
                    )}
                    {columns.data?.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">No columns yet.</td></tr>
                    )}
                    {columns.data?.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2.5 text-slate-400">{c.position}</td>
                        <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200">{c.name}</td>
                        <td className="px-3 py-2.5 text-[#168FA8]">{c.type}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{c.rule || "—"}</td>
                        <td className="px-3 py-2.5 text-center">
                          {c.required ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 font-bold">Required</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-bold">Optional</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canManageMapping && (
                <div className="grid grid-cols-12 gap-2 items-end text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="col-span-4">
                    <label className="block font-semibold text-slate-600 mb-1">Column name</label>
                    <input
                      value={col.name}
                      onChange={(e) => setCol({ ...col, name: e.target.value })}
                      placeholder="e.g. channel"
                      className="w-full h-8 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block font-semibold text-slate-600 mb-1">Type</label>
                    <select
                      value={col.type}
                      onChange={(e) => setCol({ ...col, type: e.target.value })}
                      className="w-full h-8 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none"
                    >
                      {COLUMN_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block font-semibold text-slate-600 mb-1">Rule</label>
                    <input
                      value={col.rule}
                      onChange={(e) => setCol({ ...col, rule: e.target.value })}
                      placeholder={col.type === "enum" ? "POS|ATM|Web" : "regex (optional)"}
                      className="w-full h-8 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono focus:outline-none"
                    />
                  </div>
                  <label className="col-span-1 flex items-center gap-1 h-8 font-semibold text-slate-600">
                    <input type="checkbox" checked={col.required} onChange={(e) => setCol({ ...col, required: e.target.checked })} />
                    Req.
                  </label>
                  <div className="col-span-2">
                    <PrimaryButton onClick={() => addColumn.mutate()} disabled={!col.name.trim() || addColumn.isPending}>
                      Add
                    </PrimaryButton>
                  </div>
                </div>
              )}
              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <SecondaryButton onClick={() => setEditingId(null)}>Close Editor</SecondaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">New Ingestion Template</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Participant</label>
                <select
                  value={newParticipant}
                  onChange={(e) => setNewParticipant(e.target.value ? Number(e.target.value) : "")}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="">Select participant…</option>
                  {participants.data?.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Template name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
              {error && <p className="text-red-600 font-medium">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton onClick={() => setShowCreate(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={() => create.mutate()} disabled={!newParticipant || !newName.trim() || create.isPending}>
                {create.isPending ? "Creating…" : "Create & Add Columns"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
