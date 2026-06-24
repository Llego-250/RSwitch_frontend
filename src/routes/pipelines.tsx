import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge, type Status } from "@/components/StatusBadge";

export const Route = createFileRoute("/pipelines")({
  head: () => ({ meta: [{ title: "Pipelines · Financial Interop" }] }),
  component: Pipelines,
});

const JOBS: { id: string; name: string; status: Status; records: string; duration: string }[] = [
  { id: "j1", name: "core-banking-ingest",  status: "completed", records: "128,400",    duration: "3m 12s" },
  { id: "j2", name: "mobilemoney-stream",   status: "running",   records: "live",       duration: "—" },
  { id: "j3", name: "erp-nightly",          status: "failed",    records: "412 errored",duration: "1m 02s" },
  { id: "j4", name: "bureau-batch",         status: "queued",    records: "—",          duration: "—" },
  { id: "j5", name: "dedupe-merge",         status: "completed", records: "96,210",     duration: "48s" },
];

function Pipelines() {
  const [selected, setSelected] = useState("j3");
  const job = JOBS.find((j) => j.id === selected)!;

  return (
    <AppShell
      title="Pipelines"
      breadcrumb="CONNECT › PIPELINES"
      toolbar={
        <>
          <span className="font-mono text-[11px] text-muted-foreground">5 jobs · 1 failed · 1 queued · 1 running</span>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">refresh: live</span>
        </>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-mono uppercase text-muted-foreground bg-paper">
                <th className="text-left px-4 py-2 font-normal">Job</th>
                <th className="text-left px-4 py-2 font-normal">Status</th>
                <th className="text-left px-4 py-2 font-normal">Records</th>
                <th className="text-left px-4 py-2 font-normal">Duration</th>
                <th className="text-right px-4 py-2 font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {JOBS.map((j) => (
                <tr
                  key={j.id}
                  onClick={() => setSelected(j.id)}
                  className={`border-t border-border cursor-pointer hover:bg-paper ${selected === j.id ? "bg-paper" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-[13px]">{j.name}</td>
                  <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                  <td className="px-4 py-3 tabular">{j.records}</td>
                  <td className="px-4 py-3 tabular text-muted-foreground">{j.duration}</td>
                  <td className="px-4 py-3 text-right">
                    {j.status === "failed" ? (
                      <button className="text-info text-xs hover:underline">reprocess</button>
                    ) : (
                      <button className="text-info text-xs hover:underline">logs</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div>
            <div className="font-mono text-[11px] text-muted-foreground">JOB · {job.id}</div>
            <h3 className="font-display font-600 text-[15px]">{job.name}</h3>
            <div className="mt-1"><StatusBadge status={job.status} /></div>
          </div>

          {job.status === "failed" && (
            <div className="rounded-md border border-fail/30 bg-fail-bg/40 p-3 text-xs">
              <div className="font-medium text-fail mb-1">Failed records: 412</div>
              <div className="text-muted-foreground">Reason: <code className="font-mono">currency not in canonical set</code></div>
              <div className="text-muted-foreground mt-1">Retry: 2 attempts · auto-retry exhausted</div>
              <div className="mt-3 flex gap-2">
                <button className="h-8 px-3 rounded-md bg-brand text-brand-foreground text-xs font-medium">Reprocess</button>
                <button className="h-8 px-3 rounded-md border border-border text-xs">Open issue</button>
              </div>
              <div className="mt-2 font-mono text-[10px] text-muted-foreground">SYS-07 · BR-05 — records routed, never dropped.</div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-mono uppercase text-muted-foreground mb-2">Data lineage</h4>
            <div className="space-y-1.5">
              {["source · core-banking", "transform · dedupe-merge", "canonical · ISO 20022", "analytics · risk v2.3", "report · FSA-Q2"].map((s, i) => (
                <div key={s} className="flex items-center gap-2 text-xs font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[10px] text-muted-foreground">SYS-05 · end-to-end lineage</p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
