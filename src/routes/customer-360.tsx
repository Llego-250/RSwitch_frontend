import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

function StubPage({ title, breadcrumb, summary, reqs }: { title: string; breadcrumb: string; summary: string; reqs: string }) {
  return (
    <AppShell title={title} breadcrumb={breadcrumb}>
      <div className="max-w-2xl mx-auto mt-8">
        <div className="rounded-xl border border-border bg-card p-8 blueprint-grid relative overflow-hidden">
          <div className="relative">
            <div className="font-mono text-[11px] text-muted-foreground mb-2">P2 · DEFERRED</div>
            <h2 className="font-display font-600 text-2xl">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
            <div className="mt-6 font-mono text-[11px] text-muted-foreground">{reqs}</div>
            <Link to="/" className="mt-6 inline-flex h-9 px-4 items-center rounded-md bg-brand text-brand-foreground text-sm font-medium">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export const customer360Route = (Component: ReactNode) => Component;

// === Routes ===
export const Route_Customer360 = createFileRoute("/customer-360")({
  head: () => ({ meta: [{ title: "Customer 360 · Financial Interop" }] }),
  component: () => (
    <StubPage
      title="Customer 360"
      breadcrumb="UNIFY › CUSTOMER 360"
      summary="Unified entity view across sources — accounts, transactions, relationships, and consent state — with masking by sensitivity."
      reqs="FR-CUST-01 · BR-02 · NFR-PRIV-01"
    />
  ),
});
