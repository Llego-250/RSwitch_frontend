import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PrimaryButton } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard · Financial Interop" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { role, roleLabel, scope } = useRole();
  const masked = role === "regulator" || role === "analyst";

  return (
    <AppShell
      title={`${roleLabel} · Dashboard`}
      breadcrumb="HOME"
      scope={scope}
      primaryAction={<PrimaryButton><Plus className="h-4 w-4" /> New report</PrimaryButton>}
      toolbar={
        <>
          <FilterChip label="scope" value="My portfolio" />
          <FilterChip label="period" value="MTD" />
          <FilterChip label="institution" value="All" />
          <span className="ml-auto font-mono text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" /> data live · refreshed 12:04
          </span>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Portfolio at risk"
          value="4.82%"
          delta={{ dir: "up", text: "0.3pp", tone: "bad" }}
          source="core-banking"
          updated="12:04"
          version="v2.3 model"
          masked={masked && role === "analyst"}
        />
        <KpiCard label="Average PD" value="1.9%" delta={{ dir: "down", text: "0.1pp", tone: "good" }} source="credit-bureau" updated="12:04" version="v2.3 model" />
        <KpiCard label="Open fraud alerts" value="3" delta={{ dir: "up", text: "+1", tone: "bad" }} source="fraud-ml" updated="12:04" version="rules v8.1" />
        <KpiCard label="Pipelines healthy" value="11 / 12" source="orchestrator" updated="12:04" freshness="live" />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-600 text-[15px]">Risk trend · 90 days</h3>
            <div className="font-mono text-[11px] text-muted-foreground">source: core-banking · v2.3 model</div>
          </div>
          <Sparkline />
          <div className="mt-3 flex justify-between text-[11px] font-mono text-muted-foreground">
            <span>day -90</span><span>day -60</span><span>day -30</span><span>today</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-display font-600 text-[15px] mb-3">Attention queue</h3>
          <ul className="space-y-2.5">
            <AttentionRow status="failed"  to="/pipelines" title="erp-nightly failed" meta="412 records · 18m ago" />
            <AttentionRow status="warning" to="/fraud"     title="3 high-severity fraud alerts" meta="velocity · geo · device" />
            <AttentionRow status="draft"   to="/mapping"   title="mapping v4 ready to publish" meta="1 required field unmapped" />
            <AttentionRow status="warning" to="/reports"   title="report FSA-22 due in 2 days" meta="quarterly · awaiting approver" />
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-600 text-[15px]">Data lineage (preview)</h3>
          <Link to="/pipelines" className="text-xs font-mono text-info hover:underline">view full →</Link>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 font-mono text-[11px]">
          {["source: core-banking", "transform: dedupe", "canonical: ISO 20022", "analytics: risk model v2.3", "report: FSA-Q2"].map((s, i, a) => (
            <span key={s} className="flex items-center gap-2">
              <span className="rounded-md border border-border bg-paper px-2.5 py-1.5 whitespace-nowrap">{s}</span>
              {i < a.length - 1 && <span className="text-muted-foreground">▸</span>}
            </span>
          ))}
        </div>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">SYS-05 · lineage captured end-to-end</p>
      </div>
    </AppShell>
  );
}

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <button className="h-7 px-2.5 rounded-md border border-border bg-paper text-xs flex items-center gap-1.5">
      <span className="font-mono text-[10px] text-muted-foreground uppercase">{label}</span>
      <span className="font-medium">{value}</span>
      <span className="text-muted-foreground">▾</span>
    </button>
  );
}

function AttentionRow({ status, title, meta, to }: { status: any; title: string; meta: string; to: string }) {
  return (
    <li>
      <Link to={to} className="flex items-start gap-3 rounded-md p-2 hover:bg-paper">
        <StatusBadge status={status}>{status}</StatusBadge>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-[11px] font-mono text-muted-foreground">{meta}</div>
        </div>
      </Link>
    </li>
  );
}

function Sparkline() {
  // Hand-drawn risk trend
  const pts = [22, 24, 23, 26, 28, 27, 30, 33, 31, 35, 38, 36, 40, 42, 45, 43, 47, 48];
  const max = Math.max(...pts), min = Math.min(...pts);
  const w = 100, h = 30;
  const path = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - ((p - min) / (max - min)) * h;
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" preserveAspectRatio="none">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.32 0.16 275)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="oklch(0.32 0.16 275)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#g)" />
      <path d={path} fill="none" stroke="oklch(0.32 0.16 275)" strokeWidth="0.6" />
    </svg>
  );
}
