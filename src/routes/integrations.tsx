import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
import { Building2, Smartphone, CreditCard, FileSpreadsheet, Landmark, Database, Plus, Check, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: "Integrations · Financial Interop" }] }),
  component: Integrations,
});

const SOURCES = [
  { id: "core-banking", name: "Core Banking", icon: Building2, status: "healthy" as const, sync: "live", desc: "Accounts, balances, transactions" },
  { id: "mobile-money", name: "Mobile Money", icon: Smartphone, status: "running" as const, sync: "streaming", desc: "Wallets, P2P, agent network" },
  { id: "payment-gw", name: "Payment Gateway", icon: CreditCard, status: "healthy" as const, sync: "5 min", desc: "Cards, ACH, processor feed" },
  { id: "erp", name: "ERP / Accounting", icon: FileSpreadsheet, status: "failed" as const, sync: "18m ago", desc: "GL, AP/AR, journals" },
  { id: "bureau", name: "Credit Bureau", icon: Landmark, status: "queued" as const, sync: "nightly", desc: "Scores, tradelines, inquiries" },
  { id: "regulatory", name: "Regulatory Feed", icon: FileSpreadsheet, status: "healthy" as const, sync: "daily", desc: "Sanctions, PEP, watchlists" },
  { id: "custom", name: "Custom API", icon: Database, status: "draft" as const, sync: "—", desc: "OpenAPI / JSON / webhook" },
];

export default function Integrations() {
  const { role } = useRole();
  const manage = canManage(role, "integrations");
  const [wizard, setWizard] = useState<string | null>(null);

  return (
    <AppShell
      title="Integrations"
      breadcrumb="CONNECT › INTEGRATIONS"
      primaryAction={
        manage ? (
          <button onClick={() => setWizard("core-banking")} className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Connect source
          </button>
        ) : null
      }
    >
      {wizard ? (
        <ConnectorWizard onCancel={() => setWizard(null)} sourceId={wizard} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {SOURCES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.id} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-start justify-between">
                    <div className="h-10 w-10 rounded-md bg-paper grid place-items-center text-brand">
                      <Icon className="h-5 w-5" />
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <h3 className="mt-3 font-display font-600 text-[15px]">{s.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                  <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                    <span>last sync · {s.sync}</span>
                    <button
                      onClick={() => manage && setWizard(s.id)}
                      disabled={!manage}
                      className="text-info disabled:text-muted-foreground/50 hover:underline disabled:no-underline"
                      title={!manage ? "Requires Data Architect or Administrator" : ""}
                    >
                      {manage ? "configure →" : "view"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 font-mono text-[11px] text-muted-foreground">
            FR-INT-01 · FR-INT-03 · BR-03 — secrets never displayed, credential references only.
          </p>
        </>
      )}
    </AppShell>
  );
}

function ConnectorWizard({ onCancel, sourceId }: { onCancel: () => void; sourceId: string }) {
  const [step, setStep] = useState(2); // step 3 = Test (index 2)
  const steps = ["Select", "Authenticate", "Test", "Map", "Schedule"];
  const tests = [
    { ok: true,  label: "Endpoint reachable",   detail: "200 OK · 142ms" },
    { ok: true,  label: "Authentication accepted", detail: "token valid" },
    { ok: true,  label: "Sample record retrieved", detail: "1 row" },
    { ok: false, label: "Rate limit detected",  detail: "throttle 5 req/s", warn: true },
  ];
  const allPass = tests.every((t) => t.ok || t.warn);

  return (
    <div className="rounded-lg border border-border bg-card p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-600 text-lg">Connect source · {sourceId}</h2>
        <button onClick={onCancel} className="text-sm text-muted-foreground hover:underline">Cancel</button>
      </div>
      <div className="font-mono text-[11px] text-muted-foreground mb-6">FR-INT-02 · SYS-02 · gated by BR-03</div>

      <ol className="flex items-center gap-2 mb-6 flex-wrap">
        {steps.map((s, i) => {
          const done = i < step, current = i === step;
          return (
            <li key={s} className="flex items-center gap-2">
              <span className={`h-6 w-6 rounded-full grid place-items-center text-[11px] font-mono ${
                done ? "bg-ok text-white" : current ? "bg-brand text-brand-foreground" : "bg-neutral-bg text-muted-foreground"
              }`}>{done ? <Check className="h-3 w-3" /> : i + 1}</span>
              <span className={`text-sm ${current ? "font-medium" : "text-muted-foreground"}`}>{s}</span>
              {i < steps.length - 1 && <span className="text-muted-foreground mx-1">─</span>}
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-md border border-border bg-paper p-4">
          <h3 className="text-sm font-medium mb-3">Connection test</h3>
          <ul className="space-y-2">
            {tests.map((t) => (
              <li key={t.label} className="flex items-center gap-3 text-sm">
                {t.ok ? (
                  <span className="h-5 w-5 rounded-full bg-ok-bg text-ok grid place-items-center"><Check className="h-3 w-3" /></span>
                ) : t.warn ? (
                  <span className="h-5 w-5 rounded-full bg-warn-bg text-warn grid place-items-center"><AlertTriangle className="h-3 w-3" /></span>
                ) : (
                  <span className="h-5 w-5 rounded-full bg-fail-bg text-fail grid place-items-center">!</span>
                )}
                <span className="flex-1">{t.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{t.detail}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-md bg-info-bg text-info text-xs font-mono px-3 py-2">
            Secrets never displayed — credential reference only.
          </div>
          <button className="mt-3 h-8 px-3 rounded-md border border-border text-sm hover:bg-surface">
            Re-run test
          </button>
        </div>

        <div className="rounded-md border border-border bg-paper p-4">
          <h3 className="text-sm font-medium mb-3">Ingestion mode</h3>
          <Radio label="Real-time / stream" checked />
          <Radio label="Scheduled batch" />
          <Radio label="On-demand" />
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">FR-INT-02</p>
        </div>
      </div>

      <div className="mt-6 rounded-md bg-paper border border-border px-4 py-3 text-xs font-mono text-muted-foreground">
        <span className="text-warn">⚠ BR-03 gate:</span> "Next" disabled until all required checks pass.
      </div>

      <div className="mt-4 flex justify-between">
        <button className="h-9 px-4 rounded-md border border-border text-sm">Save draft</button>
        <div className="flex gap-2">
          <button onClick={() => setStep(Math.max(0, step - 1))} className="h-9 px-4 rounded-md border border-border text-sm">Back</button>
          <button
            disabled={!allPass}
            onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
            className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function Radio({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <label className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
      <span className={`h-4 w-4 rounded-full border-2 ${checked ? "border-brand" : "border-muted-foreground/40"} grid place-items-center`}>
        {checked && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      {label}
    </label>
  );
}
