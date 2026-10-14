import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, RefreshCw } from "lucide-react";
import { AppShell, PrimaryButton } from "@/components/AppShell";
import { AttentionQueue } from "@/components/dashboard/AttentionQueue";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { WidgetCard } from "@/components/dashboard/WidgetCard";
import { WIDGET_VIEWS } from "@/components/dashboard/views";
import { FormError } from "@/components/governance/ui";
import { useRole } from "@/context/RoleContext";
import { errorMessage } from "@/lib/api";
import {
  useDashboard,
  useSessionState,
  type AttentionData,
  type DashboardFilters,
  type Widget,
  type WidgetSettings,
} from "@/lib/dashboard";
import { fmtTime } from "@/lib/governance";
import { hasCap } from "@/lib/roles";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

// SRS §5.2 / §15: the role-aware landing page (REQ-DASH-001). The API returns
// exactly the signed-in role's §15 widgets plus the Attention Queue,
// integration health, upcoming deadlines and recent activity; filters and
// each widget's period/scope persist for the browser session.
function Dashboard() {
  const { role, scope } = useRole();
  const navigate = useNavigate();
  const [filters, setFilters] = useSessionState<DashboardFilters>("rdip_dash_filters", {});
  const [settings, setSettings] = useSessionState<WidgetSettings>(`rdip_dash_widgets_${role}`, {});
  const [autoRefresh, setAutoRefresh] = useSessionState<boolean>("rdip_dash_autorefresh", false);
  const dash = useDashboard(filters, settings, autoRefresh);
  const d = dash.data;
  const busy = dash.isFetching;

  const setWidget = (key: string) => (name: "period" | "scope", value: string | number) =>
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], [name]: value } }));

  const card = (key: string, className = "") => {
    const widget = d?.data[key];
    const View = WIDGET_VIEWS[key];
    if (!widget || !View) return null;
    return (
      <WidgetCard
        key={key}
        widget={widget}
        onSetting={setWidget(key)}
        busy={busy}
        className={className}
      >
        <View data={widget.data} />
      </WidgetCard>
    );
  };

  const sections = (d?.sections ?? []).filter((k) => k !== "attention_queue");

  return (
    <AppShell
      title="Dashboard"
      subtitle="What needs your attention today"
      breadcrumb="RDIP › DASHBOARD"
      scope={scope}
      primaryAction={
        hasCap(role, "reports.view") ? (
          <PrimaryButton
            icon={<FileText className="h-4 w-4" />}
            onClick={() => navigate({ to: "/reports" })}
          >
            Reports
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <div className="flex flex-col gap-2 w-full">
          <FilterBar
            filters={filters}
            onChange={setFilters}
            inScope={d?.participants_in_scope}
            total={d?.participants_total}
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#7B8798]">
            {d && (
              <span>
                Updated {fmtTime(d.generated_at)} · computed in {d.elapsed_ms} ms
              </span>
            )}
            <button
              onClick={() => dash.refetch()}
              className="inline-flex items-center gap-1 font-semibold text-[#168FA8] hover:underline cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
              Refresh now
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              aria-pressed={autoRefresh}
              className={`ml-auto px-3 py-1 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                autoRefresh
                  ? "bg-[#E8F7F1] text-[#12825E] border-[#16A979]/30"
                  : "bg-white dark:bg-slate-800 text-[#526174] dark:text-slate-300 border-[#DCE3E8] dark:border-slate-700"
              }`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {autoRefresh ? "Auto-refresh every 5 min: on" : "Auto-refresh: off"}
            </button>
          </div>
        </div>
      }
    >
      {dash.error && (
        <div className="mb-4">
          <FormError message={`Couldn't load the dashboard: ${errorMessage(dash.error)}`} />
        </div>
      )}
      {!d && dash.isLoading && (
        <div className="py-16 text-center text-sm text-[#7B8798]">Loading your dashboard…</div>
      )}
      {d && (
        <div className="space-y-5">
          {/* §15 role widgets (REQ-DASH-002) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {d.widgets.map((key) => card(key))}
          </div>
          {/* REQ-DASH-003 + the §5.2 sections this role's §15 list doesn't already have */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
            {d.data.attention_queue && (
              <AttentionQueue
                widget={d.data.attention_queue as Widget<AttentionData>}
                onSetting={setWidget("attention_queue")}
                busy={busy}
              />
            )}
            <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              {sections.map((key) => card(key))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
