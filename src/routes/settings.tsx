import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Bell, Globe, Palette, KeyRound, Database } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Financial Interop" }] }),
  component: Settings,
});

const SECTIONS = [
  { icon: Globe,    title: "Organization",  desc: "Tenant name, time zone, regional defaults" },
  { icon: Palette,  title: "Appearance",    desc: "Theme, density, accessibility preferences" },
  { icon: Bell,     title: "Notifications", desc: "Alert channels, digest cadence, severity routing" },
  { icon: KeyRound, title: "API & keys",    desc: "Service tokens, webhook secrets, IP allow-lists" },
  { icon: Database, title: "Data retention",desc: "Per-domain retention windows, archival policy" },
];

function Settings() {
  return (
    <AppShell title="Settings" breadcrumb="ADMIN › SETTINGS">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <div key={s.title} className="rounded-lg border border-border bg-card p-5 hover:border-brand/40 transition-colors">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-md bg-brand/10 grid place-items-center text-brand">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-display font-600 text-[15px]">{s.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
                <button className="mt-3 text-[11px] font-mono text-brand">configure →</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <div className="font-display font-600 text-[15px] mb-2">System info</div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><dt className="font-mono text-[11px] text-muted-foreground">Build</dt><dd>2026.06.25-rc1</dd></div>
          <div><dt className="font-mono text-[11px] text-muted-foreground">Region</dt><dd>eu-west-1</dd></div>
          <div><dt className="font-mono text-[11px] text-muted-foreground">Tenant</dt><dd>acme-bank</dd></div>
          <div><dt className="font-mono text-[11px] text-muted-foreground">Support</dt><dd>support@interop.example</dd></div>
        </dl>
        <div className="mt-5 pt-4 border-t border-border font-mono text-[11px] text-muted-foreground">
          FR-SET-01 · NFR-USE-01
        </div>
      </div>
    </AppShell>
  );
}
