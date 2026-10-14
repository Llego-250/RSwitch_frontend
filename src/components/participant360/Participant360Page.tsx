// SRS §8.1 Participant 360 — a single-screen view of everything RSwitch knows
// about one participant institution (REQ-P360-001..014). Search by name, code
// or ID; the selected participant lives in the URL (?id=), so AI alert links
// (/participant?id=<id>) open straight onto it.
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useRole } from "@/context/RoleContext";
import { errorMessage } from "@/lib/api";
import { useRiskScores, useParticipantProfile } from "@/lib/participant360";
import { useParticipants } from "@/lib/queries";
import { hasCap } from "@/lib/roles";
import { ComplianceStatusCard } from "./ComplianceStatusCard";
import { IncidentsCard } from "./IncidentsCard";
import { IntegrationsCard, TechnicalPerformanceCard } from "./IntegrationsCard";
import { NotesCard } from "./NotesCard";
import { OutstandingActionsCard } from "./OutstandingActionsCard";
import { ProfileHeader } from "./ProfileHeader";
import { RiskAssessmentCard } from "./RiskAssessmentCard";
import { SubmissionHistoryCard } from "./SubmissionHistoryCard";
import { Empty, LoadError, RiskBadge } from "./ui";

export function Participant360Page({
  selectedId,
  onSelect,
}: {
  selectedId: number | undefined;
  onSelect: (id: number) => void;
}) {
  const { role } = useRole();
  const participants = useParticipants();
  const scores = useRiskScores();
  const [search, setSearch] = useState("");

  const list = useMemo(() => participants.data ?? [], [participants.data]);
  const scoreById = useMemo(
    () => new Map((scores.data ?? []).map((s) => [s.participant_id, s])),
    [scores.data],
  );
  const q = search.trim().toLowerCase();
  const filtered = q
    ? list.filter(
        (p) =>
          String(p.id) === q ||
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.short_name.toLowerCase().includes(q),
      )
    : list;

  const currentId = selectedId ?? list[0]?.id;
  const missing =
    selectedId !== undefined && participants.isSuccess && !list.some((p) => p.id === selectedId);
  const profile = useParticipantProfile(missing ? undefined : currentId);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const exact = list.find((p) => String(p.id) === q || p.code.toLowerCase() === q);
    const pick = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (pick) onSelect(pick.id);
  }

  return (
    <AppShell
      title="Participant 360"
      subtitle="Institution profile & risk assessment"
      breadcrumb="GOVERN › PARTICIPANT 360"
      scope="Institutional Intelligence"
      toolbar={
        <div className="flex flex-wrap items-center gap-3 w-full">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7B8798]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search by participant name, code or ID…"
              aria-label="Search participants by name, code or ID"
              className="h-8 pl-8 pr-3 rounded-xl text-xs w-full bg-white dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-[#172033] dark:text-white focus:outline-none"
            />
          </div>
          <div className="text-xs text-[#526174] dark:text-slate-400">
            Institution-level data only — no individual customer data
          </div>
        </div>
      }
    >
      {participants.error ? (
        <LoadError error={participants.error} />
      ) : participants.isLoading ? (
        <Empty>Loading participants…</Empty>
      ) : list.length === 0 ? (
        <Empty>No participant institution is registered yet.</Empty>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <aside className="lg:col-span-4 xl:col-span-3 space-y-2">
            <h2 className="font-semibold text-xs uppercase tracking-wider text-[#526174] dark:text-slate-400">
              Participants ({filtered.length})
            </h2>
            {filtered.length === 0 && <Empty>No participant matches “{search}”.</Empty>}
            <ul className="space-y-2 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto pr-1">
              {filtered.map((p) => {
                const score = scoreById.get(p.id);
                const selected = p.id === currentId;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => onSelect(p.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? "bg-[#E7F5F8] border-[#168FA8] dark:bg-slate-800"
                          : "bg-white dark:bg-slate-900 border-[#DCE3E8] dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-sm text-[#172033] dark:text-white">
                          {p.name}
                        </span>
                        <RiskBadge
                          composite={score?.composite}
                          band={score?.band}
                          pendingLabel="Pending"
                        />
                      </div>
                      <div className="text-[11px] text-[#526174] dark:text-slate-400 mt-1">
                        <span className="font-mono">{p.code}</span> · ID {p.id} · {p.type || "—"} ·{" "}
                        {p.status}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="lg:col-span-8 xl:col-span-9 space-y-5 min-w-0">
            {missing ? (
              <LoadError error={new Error(`Participant ${selectedId} could not be found.`)} />
            ) : profile.error ? (
              <LoadError error={new Error(errorMessage(profile.error))} />
            ) : !profile.data ? (
              <Empty>Loading profile…</Empty>
            ) : (
              <>
                <ProfileHeader profile={profile.data} />
                <RiskAssessmentCard risk={profile.data.risk} />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <IntegrationsCard integrations={profile.data.integrations} />
                  <TechnicalPerformanceCard perf={profile.data.technical_performance} />
                </div>
                <OutstandingActionsCard actions={profile.data.outstanding_actions} />
                <ComplianceStatusCard compliance={profile.data.compliance} />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <IncidentsCard incidents={profile.data.incidents} />
                  <NotesCard
                    participantId={profile.data.id}
                    canWrite={hasCap(role, "participant360.notes")}
                  />
                </div>
                <SubmissionHistoryCard profile={profile.data} />
                <p className="text-[11px] text-[#7B8798]">{profile.data.scope_notice}</p>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
