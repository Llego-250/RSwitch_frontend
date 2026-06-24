import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Check, AlertTriangle, X } from "lucide-react";

export const Route = createFileRoute("/mapping")({
  head: () => ({ meta: [{ title: "Standards & Mapping · Financial Interop" }] }),
  component: Mapping,
});

const FIELDS = [
  { src: "acct_no",   dst: "account.id",        ok: true,  transform: "trim" },
  { src: "cust_name", dst: "customer.fullName", ok: true,  transform: "trim · titlecase" },
  { src: "bal_amt",   dst: "account.balance",   ok: true,  transform: "cast → decimal(18,2)" },
  { src: "txn_dt",    dst: "txn.timestamp",     ok: true,  transform: "parse ISO-8601" },
  { src: "ccy",       dst: "amount.currency",   ok: false, transform: "—", required: true },
  { src: "branch",    dst: "account.branchCode",ok: true,  transform: "lookup" },
];

function Mapping() {
  return (
    <AppShell
      title="Standards & Mapping · Core Banking → Canonical"
      breadcrumb="CONNECT › MAPPING"
      primaryAction={
        <button disabled className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium opacity-40 cursor-not-allowed">
          Publish v4 (blocked)
        </button>
      }
      toolbar={
        <>
          <span className="font-mono text-[11px] rounded-md bg-info-bg text-info px-2 py-0.5">v4 · draft</span>
          <span className="font-mono text-[11px] text-muted-foreground">format: ISO 20022 / JSON</span>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">autosaved · 12:03</span>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card">
          <div className="grid grid-cols-[1fr_auto_1fr_1.2fr] gap-0 px-4 py-2 border-b border-border bg-paper text-[11px] font-mono uppercase text-muted-foreground">
            <span>Source field</span><span /><span>Canonical model</span><span>Transform / status</span>
          </div>
          {FIELDS.map((f) => (
            <div key={f.src} className="grid grid-cols-[1fr_auto_1fr_1.2fr] gap-0 px-4 py-3 border-b border-border last:border-0 items-center text-sm">
              <span className="font-mono">{f.src}</span>
              <span className="text-muted-foreground px-3">───▶</span>
              <span className="font-mono">
                {f.dst} {f.required && <span className="text-fail text-[10px] ml-1">*required</span>}
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{f.transform}</span>
                {f.ok ? (
                  <span className="text-ok"><Check className="h-4 w-4" /></span>
                ) : (
                  <span className="text-fail"><X className="h-4 w-4" /></span>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-display font-600 text-[15px] mb-3">Validation</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-ok" /> types & formats ok</li>
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-ok" /> transforms compile</li>
            <li className="flex items-start gap-2 text-fail">
              <X className="h-4 w-4 mt-0.5" />
              <span>required unmapped: <code className="font-mono">amount.currency</code></span>
            </li>
            <li className="flex items-start gap-2 text-warn">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <span>type-mismatch warning on <code className="font-mono">branch</code></span>
            </li>
          </ul>
          <div className="mt-4 rounded-md bg-warn-bg text-warn text-xs font-mono px-3 py-2">
            BR-04: cannot publish until required fields are resolved.
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-xs font-mono uppercase text-muted-foreground mb-2">version diff</h4>
            <ul className="space-y-1 text-xs font-mono">
              <li className="text-ok">+ branchCode (lookup)</li>
              <li className="text-fail">– legacy `cust_code`</li>
              <li className="text-info">~ balance precision 2→4</li>
            </ul>
          </div>
        </div>
      </div>

      <p className="mt-4 font-mono text-[11px] text-muted-foreground">
        FR-MAP-01 · FR-MAP-02 · FR-MAP-03 · SYS-03 — versioned mapping with auto-documentation.
      </p>
    </AppShell>
  );
}
