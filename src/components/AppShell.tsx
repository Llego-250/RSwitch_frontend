import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useRole } from "@/context/RoleContext";
import { ROLES, visible, type ModuleKey } from "@/lib/roles";
import {
  LayoutDashboard, Plug, GitBranch, Workflow, Users2, Brain, ShieldAlert,
  AlertTriangle, Sparkles, FileCheck2, ClipboardList, FileText, Lock, Settings,
  Search, Bell, ShieldCheck, ChevronDown, LogOut, RefreshCw, Scale,
} from "lucide-react";
import { useState, type ReactNode } from "react";

type Item = { key: ModuleKey; label: string; to: string; icon: typeof Plug };

const CLUSTERS: { title: string; items: Item[] }[] = [
  {
    title: "Connect",
    items: [
      { key: "dashboard",    label: "Dashboard",           to: "/",             icon: LayoutDashboard },
      { key: "integrations", label: "Integrations",        to: "/integrations", icon: Plug },
      { key: "mapping",      label: "Standards & Mapping", to: "/mapping",      icon: GitBranch },
      { key: "pipelines",    label: "Pipelines",           to: "/pipelines",    icon: Workflow },
    ],
  },
  {
    title: "Govern",
    items: [
      { key: "customer360",  label: "Customer 360",        to: "/customer-360", icon: Users2 },
      { key: "governance",   label: "Governance",          to: "/governance",   icon: Scale },
      { key: "compliance",   label: "Compliance",          to: "/compliance",   icon: FileCheck2 },
    ],
  },
  {
    title: "Decide",
    items: [
      { key: "ai",           label: "AI Decision Support", to: "/ai",           icon: Brain },
      { key: "credit",       label: "Credit Risk",         to: "/credit-risk",  icon: ClipboardList },
      { key: "fraud",        label: "Fraud Detection",     to: "/fraud",        icon: AlertTriangle },
      { key: "inclusion",    label: "Financial Inclusion", to: "/inclusion",    icon: Sparkles },
      { key: "reports",      label: "Reports",             to: "/reports",      icon: FileText },
    ],
  },
  {
    title: "Admin",
    items: [
      { key: "users",        label: "Users & Security",    to: "/users",        icon: Lock },
      { key: "settings",     label: "Settings",            to: "/settings",     icon: Settings },
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const avatarInitial = roleLabel.charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh bg-paper text-ink">

      {/* ─── GLOBAL TOP BAR (spec §5.2 — 56px, Primary 900) ─── */}
      <header className="fixed top-0 left-0 right-0 h-14 flex items-center px-4 gap-3 z-30"
        style={{ backgroundColor: "var(--topbar)" }}>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileNavOpen(v => !v)}
          className="lg:hidden h-9 w-9 grid place-items-center rounded-md text-white/70 hover:text-white hover:bg-white/10"
          aria-label="Open navigation"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 mr-1">
          <img
            src="/insight-navigator-logo.png"
            alt="Finterop logo"
            className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 object-contain"
          />
          <div className="hidden sm:block">
            <div className="text-white font-semibold text-[14px] leading-tight tracking-tight">
              Finterop
            </div>
            <div className="text-[10px] font-mono leading-none" style={{ color: "var(--primary-300)" }}>
              Governed insights · secure access
            </div>
          </div>
        </Link>

        {/* Global search */}
        <div className="hidden md:flex flex-1 max-w-[400px] mx-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--primary-300)" }} />
          <input
            type="search"
            placeholder="Search sources, pipelines, alerts…"
            className="w-full h-9 pl-9 pr-3 rounded-md text-sm text-white placeholder:text-white/40 border focus:outline-none focus:border-white/40"
            style={{
              backgroundColor: "var(--primary-700)",
              borderColor: "var(--primary-700)",
            }}
          />
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-0.5">
          {/* Data freshness */}
          <div
            className="hidden lg:flex items-center gap-1.5 font-mono text-[11px] mr-3 px-2 py-1 rounded-md"
            style={{ color: "var(--primary-300)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#0D9488]" />
            Data live · {new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
          </div>

          {/* Notification bell */}
          <button
            aria-label="Notifications"
            className="relative h-9 w-9 grid place-items-center rounded-md text-white/70 hover:text-white hover:bg-white/10"
          >
            <Bell className="h-4.5 w-4.5" />
            <span
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full border-[1.5px]"
              style={{ backgroundColor: "var(--fail)", borderColor: "var(--topbar)" }}
            />
          </button>

          {/* Security shield */}
          <button
            aria-label="Security status"
            className="h-9 w-9 grid place-items-center rounded-md hover:bg-white/10"
            style={{ color: "#0D9488" }}
          >
            <ShieldCheck className="h-4.5 w-4.5" />
          </button>

          {/* Role / profile switcher */}
          <div className="relative ml-1">
            <button
              onClick={() => setRoleOpen(v => !v)}
              className="h-9 pl-1.5 pr-3 flex items-center gap-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 text-sm"
            >
              <div
                className="h-7 w-7 rounded-full grid place-items-center text-white text-[12px] font-semibold shrink-0"
                style={{ backgroundColor: "var(--primary-500)" }}
              >
                {avatarInitial}
              </div>
              <span className="hidden md:block font-medium text-[13px]">{roleLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>

            {roleOpen && (
              <div
                className="absolute right-0 mt-1 w-72 rounded-xl border shadow-xl p-1 z-40"
                style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
              >
                <div
                  className="px-3 py-2 text-[11px] font-mono uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  View as role (demo)
                </div>
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setRole(r.id); setRoleOpen(false); }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between gap-2 transition-colors"
                    style={{
                      backgroundColor: role === r.id ? "var(--primary-50)" : "transparent",
                      color: role === r.id ? "var(--primary-500)" : "var(--foreground)",
                    }}
                    onMouseEnter={e => { if (role !== r.id) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--secondary)"; }}
                    onMouseLeave={e => { if (role !== r.id) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                  >
                    <div>
                      <div className="font-medium">{r.label}</div>
                      <div className="text-[11px] font-mono" style={{ color: "var(--muted-foreground)" }}>{r.scope}</div>
                    </div>
                    {role === r.id && (
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--primary-500)" }} />
                    )}
                  </button>
                ))}
                <div className="border-t my-1" style={{ borderColor: "var(--border)" }} />
                <button
                  onClick={() => { setRoleOpen(false); navigate({ to: "/login" }); }}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
                  style={{ color: "var(--fail)" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--fail-bg)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ─── SIDEBAR (always fixed below topbar) ─── */}
      <nav
        className={`
          fixed left-0 z-20 flex flex-col overflow-y-auto
          transition-transform duration-200
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{
          top: "56px",
          bottom: 0,
          width: "256px",
          backgroundColor: "var(--card)",
          borderRight: "1px solid var(--border)",
        }}
      >
          <div className="flex-1 py-3">
            {CLUSTERS.map((c) => {
              const items = c.items.filter((i) => visible(role, i.key));
              if (items.length === 0) return null;
              return (
                <div key={c.title} className="mb-1">
                  <div
                    className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-widest"
                    style={{ color: "var(--neutral-400)" }}
                  >
                    {c.title}
                  </div>
                  {items.map((it) => {
                    const active =
                      pathname === it.to ||
                      (it.to !== "/" && pathname.startsWith(it.to));
                    const Icon = it.icon;
                    return (
                      <Link
                        key={it.key}
                        to={it.to}
                        onClick={() => setMobileNavOpen(false)}
                        className="mx-2 h-10 flex items-center gap-2.5 text-[13.5px] transition-colors relative"
                        style={{
                          paddingLeft: active ? "11px" : "14px",
                          paddingRight: "12px",
                          borderRadius: active ? "0 6px 6px 0" : "6px",
                          borderLeft: active ? `3px solid var(--primary-500)` : "3px solid transparent",
                          backgroundColor: active ? "var(--primary-50)" : "transparent",
                          color: active ? "var(--primary-500)" : "var(--neutral-700)",
                          fontWeight: active ? 600 : 400,
                          marginLeft: "4px",
                        }}
                        onMouseEnter={e => {
                          if (!active) {
                            (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-100)";
                            (e.currentTarget as HTMLElement).style.color = "var(--primary-700)";
                          }
                        }}
                        onMouseLeave={e => {
                          if (!active) {
                            (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                            (e.currentTarget as HTMLElement).style.color = "var(--neutral-700)";
                          }
                        }}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="truncate">{it.label}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Bottom user mini-card */}
          <div className="p-3 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <div
              className="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
              style={{ color: "var(--ink)" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--secondary)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
            >
              <div
                className="h-8 w-8 rounded-full grid place-items-center text-white text-[13px] font-semibold shrink-0"
                style={{ backgroundColor: "var(--primary-500)" }}
              >
                {avatarInitial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate" style={{ color: "var(--neutral-900)" }}>
                  {roleLabel}
                </div>
                <div className="text-[11px] font-mono truncate" style={{ color: "var(--neutral-500)" }}>
                  {ROLES.find(r => r.id === role)?.scope}
                </div>
              </div>
              <button
                onClick={() => navigate({ to: "/login" })}
                aria-label="Sign out"
                className="shrink-0 hover:text-fail transition-colors"
                style={{ color: "var(--neutral-400)" }}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </nav>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* ─── MAIN CONTENT — offset by topbar (56px) + sidebar (256px) ─── */}
      <div className="flex flex-col lg:pl-[256px]" style={{ paddingTop: "56px", height: "100dvh" }}>
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">

          {/* Page header */}
          <div
            className="px-6 pt-5 pb-3.5 flex flex-wrap items-start gap-3 justify-between shrink-0"
            style={{
              backgroundColor: "var(--card)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div className="min-w-0">
              {breadcrumb && (
                <div className="text-[11px] font-mono uppercase tracking-wider mb-1"
                  style={{ color: "var(--neutral-400)" }}>
                  {breadcrumb}
                </div>
              )}
              <h1 className="text-[22px] font-bold leading-tight tracking-tight truncate"
                style={{ color: "var(--neutral-900)" }}>
                {title}
              </h1>
              {scope && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-mono"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--paper)",
                    color: "var(--neutral-500)",
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--signal)" }} />
                  scope: {scope}
                </div>
              )}
            </div>
            {primaryAction && <div className="flex items-center gap-2 shrink-0">{primaryAction}</div>}
          </div>

          {/* Optional toolbar */}
          {toolbar && (
            <div
              className="px-6 py-2.5 flex flex-wrap items-center gap-2 text-sm shrink-0"
              style={{
                backgroundColor: "var(--card)",
                borderBottom: "1px solid var(--border)",
                opacity: 0.95,
              }}
            >
              {toolbar}
            </div>
          )}

          {/* Page content */}
          <div className="flex-1 min-h-0 overflow-auto p-6">
            {children}
          </div>

          {/* Status strip */}
          <footer
            className="h-8 shrink-0 px-5 flex items-center gap-4 font-mono text-[11px]"
            style={{
              backgroundColor: "var(--card)",
              borderTop: "1px solid var(--border)",
              color: "var(--neutral-400)",
            }}
          >
            <span>
              env: <span style={{ color: "var(--neutral-700)" }}>staging</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--signal)" }} />
              data live
            </span>
            <RefreshCw className="h-3 w-3" />
            <span>refreshed {new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="ml-auto">FDIF · v1.0</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

/* ─── SHARED BUTTON VARIANTS ─── */

export function PrimaryButton({
  children,
  onClick,
  icon,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-9 px-4 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 transition-opacity disabled:opacity-50"
      style={{ backgroundColor: "var(--primary-500)" }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-700)"; }}
      onMouseLeave={e => { if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-500)"; }}
    >
      {icon}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="h-9 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition-colors"
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        color: "var(--neutral-900)",
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--secondary)")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--card)")}
    >
      {icon}
      {children}
    </button>
  );
}

export function FilterChip({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-[13px] transition-colors"
      style={{
        border: "1px solid var(--border)",
        backgroundColor: "var(--card)",
        color: "var(--neutral-700)",
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--secondary)")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--card)")}
    >
      <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--neutral-400)" }}>
        {label}
      </span>
      <span className="font-medium">{value}</span>
      <ChevronDown className="h-3 w-3 opacity-50" />
    </button>
  );
}

export function SectionCard({
  title,
  action,
  children,
  noPad,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  noPad?: boolean;
}) {
  return (
    <div
      className="rounded-lg"
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
      }}
    >
      {title && (
        <div
          className="px-5 py-3.5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="font-semibold text-[14px]" style={{ color: "var(--neutral-900)" }}>
            {title}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={noPad ? "" : "p-5"}>{children}</div>
    </div>
  );
}
