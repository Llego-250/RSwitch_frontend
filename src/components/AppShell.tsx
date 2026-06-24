import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useRole } from "@/context/RoleContext";
import { ROLES, visible, type ModuleKey } from "@/lib/roles";
import {
  LayoutDashboard, Plug, GitBranch, Workflow, Users2, Brain, ShieldAlert,
  Siren, Sparkles, FileCheck2, ClipboardList, FileText, Lock, Settings,
  Search, Bell, ChevronDown, LogOut,
} from "lucide-react";
import { useState, type ReactNode } from "react";

type Item = { key: ModuleKey; label: string; to: string; icon: typeof Plug };
const CLUSTERS: { title: string; items: Item[] }[] = [
  {
    title: "Connect",
    items: [
      { key: "dashboard",    label: "Dashboard",          to: "/",             icon: LayoutDashboard },
      { key: "integrations", label: "Integrations",       to: "/integrations", icon: Plug },
      { key: "mapping",      label: "Standards & Mapping",to: "/mapping",      icon: GitBranch },
      { key: "pipelines",    label: "Pipelines",          to: "/pipelines",    icon: Workflow },
    ],
  },
  {
    title: "Unify & Govern",
    items: [
      { key: "customer360",  label: "Customer 360",       to: "/customer-360", icon: Users2 },
      { key: "governance",   label: "Governance",         to: "/governance",   icon: ShieldAlert },
      { key: "compliance",   label: "Compliance",         to: "/compliance",   icon: FileCheck2 },
    ],
  },
  {
    title: "Decide & Report",
    items: [
      { key: "ai",           label: "AI Decision Support",to: "/ai",           icon: Brain },
      { key: "credit",       label: "Credit Risk",        to: "/credit-risk",  icon: ClipboardList },
      { key: "fraud",        label: "Fraud Detection",    to: "/fraud",        icon: Siren },
      { key: "inclusion",    label: "Financial Inclusion",to: "/inclusion",    icon: Sparkles },
      { key: "reports",      label: "Reports",            to: "/reports",      icon: FileText },
    ],
  },
  {
    title: "Administer",
    items: [
      { key: "users",        label: "Users & Security",   to: "/users",        icon: Lock },
      { key: "settings",     label: "Settings",           to: "/settings",     icon: Settings },
    ],
  },
];

export function AppShell({
  title,
  breadcrumb,
  scope,
  primaryAction,
  toolbar,
  children,
}: {
  title: string;
  breadcrumb?: string;
  scope?: string;
  primaryAction?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const { role, setRole, roleLabel } = useRole();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [roleOpen, setRoleOpen] = useState(false);

  return (
    <div className="min-h-dvh flex flex-col bg-paper text-ink">
      {/* TOP BAR */}
      <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-4 z-20">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-brand grid place-items-center text-brand-foreground font-display font-700 text-sm">F</div>
          <span className="font-display font-600 text-[15px]">Financial Interop</span>
        </Link>
        <div className="hidden md:flex flex-1 max-w-md relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Search sources, pipelines, alerts…"
            className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-paper text-sm placeholder:text-muted-foreground"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            aria-label="Notifications"
            className="relative h-9 w-9 grid place-items-center rounded-md hover:bg-paper"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-fail" />
          </button>
          <div className="relative">
            <button
              onClick={() => setRoleOpen((v) => !v)}
              className="h-9 px-3 flex items-center gap-2 rounded-md border border-border bg-paper text-sm hover:border-signal"
            >
              <span className="h-2 w-2 rounded-full bg-signal" />
              <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wide">role</span>
              <span className="font-medium">{roleLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {roleOpen && (
              <div className="absolute right-0 mt-1 w-72 rounded-lg border border-border bg-surface shadow-lg p-1 z-30">
                <div className="px-3 py-2 text-[11px] font-mono text-muted-foreground uppercase">View as role (demo)</div>
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setRole(r.id); setRoleOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-start justify-between gap-2 hover:bg-paper ${role === r.id ? "bg-paper" : ""}`}
                  >
                    <div>
                      <div className="font-medium">{r.label}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{r.scope}</div>
                    </div>
                    {role === r.id && <span className="text-signal text-xs mt-1">●</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => navigate({ to: "/login" })}
            className="h-9 w-9 grid place-items-center rounded-md hover:bg-paper"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* LEFT NAV */}
        <nav className="w-60 shrink-0 border-r border-border bg-surface overflow-y-auto py-3 hidden lg:block">
          {CLUSTERS.map((c) => {
            const items = c.items.filter((i) => visible(role, i.key));
            if (items.length === 0) return null;
            return (
              <div key={c.title} className="mb-4">
                <div className="px-4 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {c.title}
                </div>
                {items.map((it) => {
                  const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.key}
                      to={it.to}
                      className={`mx-2 px-2.5 py-2 rounded-md flex items-center gap-2.5 text-[13.5px] ${
                        active
                          ? "bg-brand text-brand-foreground font-medium"
                          : "text-foreground hover:bg-paper"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{it.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* MAIN */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="px-6 pt-5 pb-3 flex flex-wrap items-start gap-3 justify-between border-b border-border bg-surface">
            <div className="min-w-0">
              {breadcrumb && (
                <div className="text-[11px] font-mono text-muted-foreground mb-1">{breadcrumb}</div>
              )}
              <h1 className="text-[24px] font-display font-600 leading-tight truncate">{title}</h1>
              {scope && (
                <div className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-border bg-paper px-2.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal" /> scope: {scope}
                </div>
              )}
            </div>
            {primaryAction}
          </div>
          {toolbar && (
            <div className="px-6 py-2.5 border-b border-border bg-surface/60 flex flex-wrap items-center gap-2 text-sm">
              {toolbar}
            </div>
          )}
          <div className="flex-1 min-w-0 p-6 overflow-auto">{children}</div>

          {/* STATUS STRIP */}
          <footer className="h-8 shrink-0 border-t border-border bg-surface px-4 flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
            <span>env: <span className="text-ink">staging</span></span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" /> data live
            </span>
            <span>session: 42m left</span>
            <span className="ml-auto">FDI Framework · v1.0 prototype</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export function PrimaryButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium hover:opacity-90 inline-flex items-center gap-1.5"
    >
      {children}
    </button>
  );
}
