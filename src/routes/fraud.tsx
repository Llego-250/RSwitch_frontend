import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/fraud")({
  head: () => ({ meta: [{ title: "Fraud Detection · Financial Interop" }] }),
  component: Fraud,
});

const ALERTS = [
  { id: "F-2208", kind: "velocity",   sev: "failed" as const, ago: "2m",  conf: 0.88 },
  { id: "F-2207", kind: "geo",        sev: "warning" as const,ago: "8m",  conf: 0.71 },
  { id: "F-2205", kind: "device",     sev: "warning" as const,ago: "22m", conf: 0.66 },
  { id: "F-2201", kind: "structuring",sev: "completed" as const, ago: "1h", conf: 0.92 },
];

function Fraud() {
  const [sel, setSel] = useState("F-2208");
  const alert = ALERTS.find((a) => a.id === sel)!;

  return (
    <AppShell
      title={`Fraud · Case #${alert.id}`}
      breadcrumb="DECIDE › FRAUD DETECTION"
      toolbar={
        <>
          <span className="font-mono text-[11px] rounded-md bg-fail-bg text-fail px-2 py-0.5">3 open · 1 critical</span>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">detection: rules + ML</span>
        </>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr_300px] gap-4">
        {/* Queue */}
        <aside className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-[11px] font-mono uppercase text-muted-foreground bg-paper">
            Alert queue · severity-ordered
          </div>
          <ul>
            {ALERTS.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setSel(a.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-paper ${sel === a.id ? "bg-paper" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[13px]">#{a.id}</span>
                    <StatusBadge status={a.sev}>{a.sev === "failed" ? "high" : a.sev === "warning" ? "med" : "resolved"}</StatusBadge>
                  </div>
                  <div className="text-sm mt-0.5">{a.kind}</div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{a.ago} ago · conf {a.conf}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Evidence */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[11px] text-muted-foreground">EVIDENCE · {alert.id}</div>
              <h3 className="font-display font-600 text-[18px] capitalize">{alert.kind} pattern detected</h3>
            </div>
            <StatusBadge status={alert.sev}>{alert.sev === "failed" ? "HIGH SEVERITY" : "MEDIUM"}</StatusBadge>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Kv k="Detection" v="rules + ML" />
            <Kv k="Confidence" v={alert.conf.toString()} />
            <Kv k="Source" v="core-banking · card-stream" />
            <Kv k="Owner" v="Unassigned" />
          </div>

          <h4 className="mt-5 mb-2 text-xs font-mono uppercase text-muted-foreground">Linked transactions</h4>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-paper text-[11px] font-mono uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-normal">Txn</th>
                  <th className="text-left px-3 py-2 font-normal">Amount</th>
                  <th className="text-left px-3 py-2 font-normal">Time</th>
                  <th className="text-left px-3 py-2 font-normal">Channel</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {[
                  ["TXN-99812", "$4,200", "12:03:14", "card · POS"],
                  ["TXN-99813", "$4,180", "12:04:02", "card · POS"],
                  ["TXN-99814", "$4,250", "12:05:11", "card · POS"],
                ].map((r) => (
                  <tr key={r[0]} className="border-t border-border">
                    {r.map((c, i) => <td key={i} className="px-3 py-2 text-[13px]">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">3 transactions / 2 min · same card cluster · SYS-11</p>

          <h4 className="mt-5 mb-1.5 text-xs font-mono uppercase text-muted-foreground">Decision</h4>
          <textarea
            placeholder="Investigator notes…"
            className="w-full h-20 rounded-md border border-border bg-paper p-3 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="h-9 px-4 rounded-md bg-fail text-white text-sm font-medium">Confirm fraud</button>
            <button className="h-9 px-4 rounded-md bg-ok text-white text-sm font-medium">Mark clean</button>
            <button className="h-9 px-4 rounded-md border border-border text-sm">Escalate</button>
          </div>
        </div>

        {/* Audit timeline */}
        <aside className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-display font-600 text-[15px] mb-3">Action history</h3>
          <ol className="relative border-l border-border pl-4 space-y-4">
            <Timeline status="ok"   when="12:05" who="system"    what="alert raised (velocity rule)" />
            <Timeline status="info" when="12:09" who="admin"     what="assigned to J. Okello" />
            <Timeline status="info" when="12:14" who="J. Okello" what="evidence reviewed" />
            <Timeline status="warn" when="12:16" who="J. Okello" what="awaiting decision" />
          </ol>
          <p className="mt-4 font-mono text-[11px] text-muted-foreground">
            BR-09 · SYS-10 — append-only history: source · reason · severity · status · owner · action.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] font-mono uppercase text-muted-foreground">{k}</div>
      <div className="text-sm">{v}</div>
    </div>
  );
}

function Timeline({ status, when, who, what }: { status: "ok" | "info" | "warn"; when: string; who: string; what: string }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-${status}`} />
      <div className="text-sm">{what}</div>
      <div className="font-mono text-[11px] text-muted-foreground">{who} · {when}</div>
    </li>
  );
}
