import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useRole } from "@/context/RoleContext";
import { ROLES, visible, type ModuleKey } from "@/lib/roles";
import {
  LayoutDashboard, Plug, GitBranch, Workflow, Users2, Brain,
  AlertTriangle, Sparkles, FileCheck2, ClipboardList, FileText, Lock, Settings,
  Search, Bell, ChevronDown, ChevronUp, LogOut, RefreshCw, Scale, Moon, Sun,
  Menu, X, MessageSquare, Plus, DollarSign
} from "lucide-react";
import { useState, type ReactNode } from "react";

type Item = { key: ModuleKey; label: string; to: string; icon: typeof Plug };

const CLUSTERS: { title: string; items: Item[] }[] = [
  {
    title: "Connect & Ingest",
    items: [
      { key: "dashboard",    label: "Dashboard",           to: "/",             icon: LayoutDashboard },
      { key: "integrations", label: "Integrations Catalog", to: "/integrations", icon: Plug },
      { key: "mapping",      label: "Standards & Mapping", to: "/mapping",      icon: GitBranch },
      { key: "pipelines",    label: "Pipeline Monitor",    to: "/pipelines",    icon: Workflow },
    ],
  },
  {
    title: "Govern & Comply",
    items: [
      { key: "customer360",  label: "Participant 360",     to: "/customer-360", icon: Users2 },
      { key: "governance",   label: "Governance Center",   to: "/governance",   icon: Scale },
      { key: "compliance",   label: "Compliance Register", to: "/compliance",   icon: FileCheck2 },
    ],
  },
  {
    title: "Intelligence & Reports",
    items: [
      { key: "ai",           label: "AI Decision Support", to: "/ai",           icon: Brain },
      { key: "inclusion",    label: "Financial Inclusion", to: "/inclusion",    icon: Sparkles },
      { key: "reports",      label: "Report Generator",    to: "/reports",      icon: FileText },
    ],
  },
  {
    title: "Administration",
    items: [
      { key: "users",        label: "Users & Security",    to: "/users",        icon: Lock },
      { key: "settings",     label: "System Settings",     to: "/settings",     icon: Settings },
    ],
  },
];

type NotificationItem = {
  id: string;
  title: string;
  desc: string;
  time: string;
  read: boolean;
  type: "alert" | "info" | "warning";
};

const INITIAL_NOTIFS: NotificationItem[] = [
  {
    id: "n1",
    title: "ERP Pipeline Failed",
    desc: "Ingestion job erp-nightly-ingest failed connection validation.",
    time: "10m ago",
    read: false,
    type: "alert",
  },
  {
    id: "n2",
    title: "FSA Quarterly Return Due Soon",
    desc: "Deadline for FSA-Q2-2025 is in 14 days.",
    time: "1h ago",
    read: false,
    type: "warning",
  },
  {
    id: "n3",
    title: "AI Deviation Alert Generated",
    desc: "MTN Mobile Money error rate spike (+4.2%) detected by engine.",
    time: "2h ago",
    read: false,
    type: "alert",
  },
  {
    id: "n4",
    title: "New Governance Document Uploaded",
    desc: "Board Minutes v2.1 added by Compliance Officer.",
    time: "1d ago",
    read: true,
    type: "info",
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
  const [isDark, setIsDark] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>(INITIAL_NOTIFS);

  const unreadCount = notifs.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const toggleRead = (id: string) => {
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
    );
  };

  const avatarInitial = roleLabel.charAt(0).toUpperCase();

  const toggleDarkMode = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className={`h-screen max-h-screen overflow-hidden ${isDark ? 'bg-[#121B22] text-[#E2E8F0]' : 'bg-[#E4EAEE] text-[#1E293B]'} p-3 md:p-4 lg:p-5 flex gap-4 lg:gap-5 relative font-sans transition-colors duration-200`}>

      {/* ─── LEFT SIDEBAR PANEL (Floating neumorphic card) ─── */}
      <aside
        className={`
          fixed lg:static inset-y-3 left-3 z-40 lg:z-10
          w-64 lg:w-72 shrink-0
          ${isDark ? 'bg-[#1A2630]/90 border-slate-700/60' : 'bg-[#F4F7F9]/90 border-white/80'}
          backdrop-blur-md rounded-[28px] p-4 flex flex-col justify-between
          border shadow-[0_10px_30px_rgba(0,0,0,0.03)]
          transition-transform duration-200
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Top Logo & Header */}
        <div className="flex items-center justify-between px-1 pt-1 pb-3">
          <Link to="/" className="flex items-center gap-3">
            <div className={`h-11 w-11 rounded-full ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-[#E5ECEF] border-white/80'} border shadow-inner flex items-center justify-center p-1 overflow-hidden shrink-0`}>
              <img
                src="/insight-navigator-logo.png"
                alt="RDIP logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className={`font-bold text-[15px] leading-tight tracking-wide ${isDark ? 'text-white' : 'text-[#1E293B]'}`}>
                RDIP PLATFORM
              </div>
              <div className="text-[10px] font-medium tracking-widest uppercase text-[#718596] leading-none mt-0.5">
                RSWITCH INTELLIGENCE
              </div>
            </div>
          </Link>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1.5 rounded-full hover:bg-slate-200/50 text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto my-2 space-y-4 pr-1 scrollbar-none">
          {CLUSTERS.map((c) => {
            const items = c.items.filter((i) => visible(role, i.key));
            if (items.length === 0) return null;
            return (
              <div key={c.title} className="space-y-1">
                <div className="px-4 text-[10px] font-bold uppercase tracking-widest text-[#94A8B8]">
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
                      className={`
                        w-full rounded-2xl px-4 py-3 text-[14px] flex items-center gap-3.5 transition-all
                        ${active
                          ? "bg-[#56B4D3] text-[#092E3D] font-semibold shadow-md shadow-[#56B4D3]/25"
                          : isDark
                            ? "text-slate-300 hover:bg-slate-800/60 hover:text-white font-medium"
                            : "text-[#526678] hover:bg-white/70 hover:text-[#1E293B] font-medium"
                        }
                      `}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${active ? "text-[#092E3D]" : "text-[#718596]"}`} />
                      <span className="truncate">{it.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bottom User Profile */}
        <div className="pt-2 relative">
          <div
            onClick={() => setRoleOpen(!roleOpen)}
            className={`p-2.5 rounded-2xl ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white/70 border-white/80'} border shadow-sm flex items-center justify-between gap-3 cursor-pointer hover:bg-white transition-all`}
          >
            <div className="h-9 w-9 rounded-full bg-[#87C6E4] text-[#092E3D] font-bold text-xs flex items-center justify-center shadow-sm shrink-0">
              {avatarInitial}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-semibold truncate ${isDark ? 'text-white' : 'text-[#1E293B]'}`}>
                {roleLabel}
              </div>
              <div className="text-[10px] font-mono text-[#718596] truncate">
                {ROLES.find(r => r.id === role)?.scope}
              </div>
            </div>
            <ChevronUp className="h-4 w-4 text-[#718596] shrink-0" />
          </div>

          {/* Role selector menu popover */}
          {roleOpen && (
            <div
              className={`absolute bottom-full left-0 right-0 mb-2 rounded-2xl border shadow-xl p-1.5 z-50 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-[#E1E7EA]'}`}
            >
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#718596]">
                Select Role (Demo)
              </div>
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setRole(r.id); setRoleOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                    role === r.id
                      ? "bg-[#56B4D3]/15 text-[#56B4D3] font-semibold"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span>{r.label}</span>
                  {role === r.id && <span className="h-1.5 w-1.5 rounded-full bg-[#56B4D3]" />}
                </button>
              ))}
              <div className="border-t my-1 border-slate-200 dark:border-slate-800" />
              <button
                onClick={() => { setRoleOpen(false); navigate({ to: "/login" }); }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center gap-2 text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* ─── RIGHT MAIN SHELL AREA ─── */}
      <div className="flex-1 flex flex-col gap-3 lg:gap-4 min-w-0 h-full overflow-hidden">

        {/* ─── TOP UTILITY HEADER BAR ─── */}
        <header className="flex items-center justify-between gap-3 h-11 shrink-0">
          
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="lg:hidden h-11 w-11 rounded-full bg-[#DAE2E7] hover:bg-white flex items-center justify-center text-[#526678] border border-white/60 shadow-sm shrink-0"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Search Input Pill */}
          <div className="relative flex-1 max-w-xl h-11">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A8E9C]" />
            <input
              type="search"
              placeholder="Search client portal..."
              className={`w-full h-full pl-11 pr-5 rounded-full ${
                isDark
                  ? 'bg-slate-800/80 text-white placeholder:text-slate-400 border-slate-700'
                  : 'bg-[#DAE2E7] hover:bg-[#D6E0E6] text-[#1E293B] placeholder:text-[#7A8E9C] border-white/60'
              } focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-[#56B4D3]/40 text-sm font-medium transition-all border shadow-inner outline-none`}
            />
          </div>

          {/* Right Top Bar Utilities */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            
            {/* Dark/Light mode toggle button */}
            <button
              onClick={toggleDarkMode}
              aria-label="Toggle theme"
              className={`h-11 w-11 rounded-full ${
                isDark ? 'bg-slate-800 text-amber-400 border-slate-700' : 'bg-[#DAE2E7] text-[#526678] border-white/60'
              } hover:bg-white dark:hover:bg-slate-700 flex items-center justify-center border shadow-sm transition-all`}
            >
              {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            {/* Currency / Scope Pill */}
            <div
              onClick={() => setRoleOpen(!roleOpen)}
              className={`h-11 px-4 rounded-full ${
                isDark ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-[#DAE2E7] text-[#3B4C5A] border-white/60'
              } hover:bg-white dark:hover:bg-slate-700 flex items-center gap-2 text-xs font-semibold border shadow-sm transition-all cursor-pointer`}
            >
              <DollarSign className="h-3.5 w-3.5 text-[#56B4D3]" />
              <span>USD</span>
              <ChevronDown className="h-3.5 w-3.5 text-[#7A8E9C]" />
            </div>

            {/* Notifications Bell Button */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                aria-label="View notifications"
                className={`h-11 px-4 rounded-full ${
                  isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-[#DAE2E7] text-[#526678] border-white/60'
                } hover:bg-white dark:hover:bg-slate-700 flex items-center gap-2 text-xs font-mono border shadow-sm transition-all relative cursor-pointer`}
              >
                <Bell className="h-4 w-4 text-[#56B4D3]" />
                <span>{new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}</span>
                {unreadCount > 0 ? (
                  <span className="h-4 px-1.5 rounded-full bg-red-500 text-white font-bold text-[10px] flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                )}
              </button>

              {/* Notification Popover Modal (§5.12) */}
              {notifOpen && (
                <div
                  className={`absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border shadow-2xl p-4 z-50 ${
                    isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-[#56B4D3]" />
                      <span className="font-bold text-sm">Notifications ({unreadCount} unread)</span>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-[11px] text-[#56B4D3] hover:underline font-medium"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto py-2 space-y-2 divide-y divide-slate-100 dark:divide-slate-800">
                    {notifs.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => toggleRead(n.id)}
                        className={`pt-2 flex items-start gap-2.5 cursor-pointer p-2 rounded-xl transition-colors ${
                          !n.read
                            ? isDark ? 'bg-slate-800/80' : 'bg-blue-50/70'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${
                            n.type === "alert"
                              ? "bg-red-500"
                              : n.type === "warning"
                              ? "bg-amber-500"
                              : "bg-blue-500"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs truncate">{n.title}</span>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">{n.time}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-center">
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      Close Notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* ─── MAIN CONTENT FRAME (Double curved floating sheet) ─── */}
        <div className={`relative flex-1 ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-[#DCE4E9]/90 border-white/60'} rounded-[34px] p-2.5 lg:p-3 flex flex-col overflow-hidden border shadow-sm`}>
          <div className={`w-full h-full ${isDark ? 'bg-[#17222B] border-slate-800' : 'bg-[#F4F7F9] border-white/90'} rounded-[28px] flex flex-col overflow-hidden border shadow-[0_10px_35px_rgba(0,0,0,0.03)]`}>
            
            {/* Header bar inside main panel */}
            <div className={`px-6 py-4 border-b ${isDark ? 'border-slate-800 bg-slate-900/50' : 'border-[#E3EAEE] bg-white/60'} backdrop-blur-sm flex flex-wrap items-center justify-between gap-4 shrink-0`}>
              <div className="min-w-0">
                {breadcrumb && (
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#718596] mb-0.5">
                    {breadcrumb}
                  </div>
                )}
                <h1 className={`text-xl lg:text-2xl font-bold tracking-tight truncate ${isDark ? 'text-white' : 'text-[#1E293B]'}`}>
                  {title}
                </h1>
                {scope && (
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-mono bg-[#E5ECEF] dark:bg-slate-800 text-[#475569] dark:text-slate-300 border border-white/60 dark:border-slate-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    scope: {scope}
                  </div>
                )}
              </div>
              {primaryAction && <div className="flex items-center gap-2 shrink-0">{primaryAction}</div>}
            </div>

            {/* Optional toolbar */}
            {toolbar && (
              <div className={`px-6 py-2.5 border-b ${isDark ? 'border-slate-800 bg-slate-900/30' : 'border-[#E3EAEE] bg-[#EBF0F3]/80'} flex flex-wrap items-center gap-2 text-sm shrink-0`}>
                {toolbar}
              </div>
            )}

            {/* Page content */}
            <div className="flex-1 overflow-auto p-5 lg:p-7 text-[#1E293B] dark:text-slate-200">
              {children}
            </div>

          </div>
        </div>

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
      className="h-10 px-5 rounded-full text-sm font-semibold bg-[#56B4D3] hover:bg-[#47A4C3] text-[#092E3D] shadow-sm hover:shadow transition-all disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer active:scale-98"
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
      className="h-10 px-5 rounded-full text-sm font-medium bg-[#DAE2E7] hover:bg-white text-[#3B4C5A] dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-white/60 dark:border-slate-700 shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer active:scale-98"
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
      className="h-9 px-4 rounded-full bg-[#DAE2E7] hover:bg-white text-[#3B4C5A] dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-white/60 dark:border-slate-700 shadow-sm transition-all inline-flex items-center gap-2 text-xs font-medium cursor-pointer"
    >
      <span className="font-mono text-[10px] uppercase tracking-wide text-[#718596]">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
      <ChevronDown className="h-3 w-3 opacity-60" />
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
    <div className="rounded-[24px] bg-white/90 dark:bg-slate-800/80 border border-[#E3EAEE] dark:border-slate-700/80 shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden transition-all">
      {title && (
        <div className="px-6 py-4 flex items-center justify-between border-b border-[#E3EAEE] dark:border-slate-700/60 bg-white/40 dark:bg-slate-800/40">
          <div className="font-bold text-sm text-[#1E293B] dark:text-white">
            {title}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={noPad ? "" : "p-6"}>{children}</div>
    </div>
  );
}
