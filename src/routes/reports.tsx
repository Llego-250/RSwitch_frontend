import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Check, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: Reports,
});

function Reports() {
  return (
    <AppShell
      title="Reports · Builder"
      breadcrumb="DECIDE › REPORTS"
      primaryAction={
        <div className="flex gap-2">
          <button className="h-9 px-4 rounded-md border border-border text-sm">Save draft</button>
          <button className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium">Validate ▸</button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <aside className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-mono uppercase text-muted-foreground mb-2">Templates</h3>
          {[
            { id: "fsa", label: "FSA quarterly", selected: true, reg: true },
            { id: "liq", label: "Liquidity", reg: true },
            { id: "incl", label: "Financial Inclusion" },
            { id: "custom", label: "Custom" },
          ].map((t) => (
            <button
              key={t.id}
              className={`w-full text-left px-3 py-2 rounded-md mb-1 text-sm flex items-center justify-between ${t.selected ? "bg-paper font-medium" : "hover:bg-paper"}`}
            >
              <span>{t.label}</span>
              {t.reg && <span className="font-mono text-[10px] text-info rounded bg-info-bg px-1.5 py-0.5">REG</span>}
            </button>
          ))}
        </aside>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-display font-600 text-[15px] mb-3">Composition</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {["Cover", "Portfolio risk", "Fraud summary", "Data sources & freshness", "Sign-off", "Appendix"].map((s) => (
                <label key={s} className="flex items-center gap-2 rounded-md border border-border bg-paper px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" defaultChecked={s !== "Appendix"} className="accent-[oklch(0.32_0.16_275)]" /> {s}
                </label>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <Field label="Period" value="Q2 2026 ▾" />
              <Field label="Scope" value="All institutions ▾" />
              <Field label="Output" value="◉ PDF  ○ XLSX  ○ XBRL" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-display font-600 text-[15px] mb-3">Validation</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-ok" /> all required sections present</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-ok" /> data freshness within window</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-ok" /> lineage embedded for all figures</li>
              <li className="flex items-center gap-2 text-warn"><AlertTriangle className="h-4 w-4" /> awaiting approver sign-off</li>
            </ul>
            <div className="mt-4 rounded-md bg-warn-bg text-warn text-xs font-mono px-3 py-2">
              BR-07 · SYS-12 — Submit blocked until validation passes & required approvals are recorded.
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="h-9 px-4 rounded-md border border-border text-sm">Preview</button>
              <button disabled className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium opacity-40 cursor-not-allowed">
                Submit (gated)
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-display font-600 text-[15px] mb-3">Schedule & delivery</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Cadence" value="◉ Recurring (quarterly)  ○ One-off" />
              <Field label="Recipients" value="reg-portal · audit-file" />
            </div>
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              FR-REP-01 · FR-COMP-01 — receipts and submission status recorded for audit.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-paper p-3">
      <div className="text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
