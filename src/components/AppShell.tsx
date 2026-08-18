import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useRole } from "@/context/RoleContext";
import { ROLES, visible, type ModuleKey } from "@/lib/roles";
import {
  LayoutDashboard, Plug, GitBranch, Workflow, Users2, Brain,
  AlertTriangle, Sparkles, FileCheck2, FileText, Lock, Settings,
  Search, Bell, ChevronUp, LogOut, Moon, Sun, Menu, X, ShieldAlert,
  TrendingUp, PanelLeftClose, PanelLeftOpen, Command, CheckCheck,
  Trash2, Filter, Scale, ChevronDown
} from "lucide-react";
import { useState, useEffect, useRef, type ReactNode } from "react";

type Item = { key: ModuleKey; label: string; to: string; icon: typeof Plug; desc?: string };

const CLUSTERS: { title: string; items: Item[] }[] = [
  {
    title: "Connect & Ingest",
    items: [
      { key: "dashboard", label: "Dashboard", to: "/", icon: LayoutDashboard, desc: "System performance overview & key KPIs" },
      { key: "integrations", label: "Integrations Catalog", to: "/integrations", icon: Plug, desc: "Manage participant connections & APIs" },
      { key: "mapping", label: "Standards & Mapping", to: "/mapping", icon: GitBranch, desc: "ISO 20022 schemas & transformations" },
      { key: "pipelines", label: "Pipeline Monitor", to: "/pipelines", icon: Workflow, desc: "Real-time ETL execution & status" },
    ],
  },
  {
    title: "Govern & Comply",
    items: [
      { key: "participant360", label: "Participant 360", to: "/participant-360", icon: Users2, desc: "Unified institution profile & risk data" },
      { key: "governance", label: "Governance Center", to: "/governance", icon: Scale, desc: "Board documents & action tracking" },
      { key: "compliance", label: "Compliance Register", to: "/compliance", icon: FileCheck2, desc: "Regulatory deadlines & incident tracking" },
    ],
  },
  {
    title: "Intelligence & Reports",
    items: [
      { key: "ai", label: "AI Decision Support", to: "/ai", icon: Brain, desc: "Anomaly alerts & operational risk ranking" },
      { key: "inclusion", label: "Financial Inclusion", to: "/inclusion", icon: Sparkles, desc: "National reach & telemetry reports" },
      { key: "reports", label: "Report Generator", to: "/reports", icon: FileText, desc: "Automated regulatory & operational export" },
    ],
  },
  {
    title: "Administration",
    items: [
      { key: "users", label: "Users & Security", to: "/users", icon: Lock, desc: "Role permissions & security audit log" },
      { key: "settings", label: "System Settings", to: "/settings", icon: Settings, desc: "Global configuration & API policies" },
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
  subtitle,
  breadcrumb,
  scope,
  primaryAction,
  toolbar,
  children,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  scope?: string;
  primaryAction?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const { role, setRole, roleLabel } = useRole();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  // Desktop sidebar collapse state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("rdip_sidebar_collapsed") === "true";
    }
    return false;
  });

  const [roleOpen, setRoleOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifFilter, setNotifFilter] = useState<"all" | "alert" | "warning" | "info">("all");

  // Notifications state with localStorage persistence
  const [notifs, setNotifs] = useState<NotificationItem[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rdip_notifications");
      if (saved) {
        try { return JSON.parse(saved); } catch { /* ignore */ }
      }
    }
    return INITIAL_NOTIFS;
  });

  // Dark mode state with persistence
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved) return saved === "dark";
      return document.documentElement.classList.contains("dark") ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  // Sync dark class on <html> element
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem("rdip_sidebar_collapsed", isCollapsed ? "true" : "false");
  }, [isCollapsed]);

  // Persist notifications
  useEffect(() => {
    localStorage.setItem("rdip_notifications", JSON.stringify(notifs));
  }, [notifs]);

  // Keyboard shortcut listener for Command Palette (⌘K or Ctrl+K or /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setRoleOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const roleMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  // Click outside to dismiss menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(event.target as Node)) {
        setRoleOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifs.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearReadNotifications = () => {
    setNotifs((prev) => prev.filter((n) => !n.read));
  };

  const toggleRead = (id: string) => {
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
    );
  };

  const toggleDarkMode = () => {
    setIsDark(!isDark);
  };

  const avatarInitial = roleLabel.charAt(0).toUpperCase();

  // Filter items for search command palette
  const allNavItems = CLUSTERS.flatMap((c) => c.items).filter((i) => visible(role, i.key));
  const filteredSearchItems = searchQuery.trim() === ""
    ? allNavItems
    : allNavItems.filter((i) =>
        i.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (i.desc && i.desc.toLowerCase().includes(searchQuery.toLowerCase()))
      );

  const filteredNotifs = notifFilter === "all"
    ? notifs
    : notifs.filter((n) => n.type === notifFilter);

  return (
    <div className={`h-screen max-h-screen overflow-hidden ${isDark ? 'bg-[#121B22] text-[#E2E8F0]' : 'bg-[#E4EAEE] text-[#1E293B]'} p-3 md:p-4 lg:p-5 flex gap-3 lg:gap-4 relative font-sans transition-colors duration-200`}>

      {/* ─── LEFT SIDEBAR PANEL ─── */}
      <aside
        className={`
          fixed lg:static inset-y-3 left-3 z-40 lg:z-10
          ${isCollapsed ? "lg:w-20" : "w-64 lg:w-72"} shrink-0
          bg-[#168FA8] border-[#0F6F83]/40
          backdrop-blur-md rounded-[24px] p-3.5 lg:p-4 flex flex-col justify-between
          border shadow-lg text-white
          transition-all duration-300 ease-in-out
          ${mobileNavOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Top Logo & Header */}
        <div className="flex items-center justify-between px-1 pt-1 pb-3 border-b border-white/20">
          <Link to="/" className="flex items-center gap-3 group min-w-0">
            <div className="h-10 w-10 rounded-xl bg-white p-1.5 shadow-sm flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105">
              <img
                src="/insight-navigator-logo.png"
                alt="RDIP logo"
                className="h-full w-full object-contain filter drop-shadow-xs"
              />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 overflow-hidden transition-opacity duration-200">
                <div className="font-bold text-[15px] leading-tight tracking-wide text-white transition-colors truncate">
                  RDIP PLATFORM
                </div>
                <div className="text-[10px] font-semibold tracking-widest uppercase text-[#D5EEF2] leading-none mt-0.5 flex items-center gap-1">
                  <span className="truncate">RSWITCH INTELLIGENCE</span>
                </div>
              </div>
            )}
          </Link>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1.5 rounded-full hover:bg-white/20 text-white shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto my-3 space-y-4 pr-0.5 scrollbar-none">
          {CLUSTERS.map((c) => {
            const items = c.items.filter((i) => visible(role, i.key));
            if (items.length === 0) return null;
            return (
              <div key={c.title} className="space-y-1">
                {!isCollapsed && (
                  <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[#D5EEF2] truncate">
                    {c.title}
                  </div>
                )}
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
                      title={isCollapsed ? it.label : undefined}
                      className={`
                        w-full rounded-xl ${isCollapsed ? "px-0 justify-center h-10" : "px-3.5 py-2.5"} text-[15px] flex items-center gap-3 transition-all duration-200 relative group
                        ${active
                          ? "bg-[#073B4C] text-white font-semibold shadow-md"
                          : "text-white/95 hover:bg-white/15 hover:text-white font-medium"
                        }
                      `}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${active ? "text-[#168FA8]" : "text-white"}`} />
                      {!isCollapsed && <span className="truncate">{it.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bottom Section: Desktop Collapse Toggle + User Profile */}
        <div className="pt-2 relative border-t border-white/25 space-y-2" ref={roleMenuRef}>

          {/* User Profile Card */}
          <div
            onClick={() => setRoleOpen(!roleOpen)}
            title={isCollapsed ? `${roleLabel} (${ROLES.find(r => r.id === role)?.scope})` : undefined}
            className={`p-2.5 rounded-2xl bg-white/90 border border-white/90 shadow-sm flex items-center ${isCollapsed ? "justify-center" : "justify-between"} gap-3 cursor-pointer hover:bg-white transition-all text-[#092E3D]`}
          >
            <div className="h-9 w-9 rounded-full bg-[#56B4D3] text-[#092E3D] font-extrabold text-xs flex items-center justify-center shadow-sm shrink-0">
              {avatarInitial}
            </div>
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate text-[#092E3D]">
                    {roleLabel}
                  </div>
                  <div className="text-[10px] font-mono text-[#2B8FB1] font-bold truncate">
                    {ROLES.find(r => r.id === role)?.scope}
                  </div>
                </div>
                <ChevronUp className="h-4 w-4 text-[#2B8FB1] shrink-0" />
              </>
            )}
          </div>

          {/* Role selector menu popover */}
          {roleOpen && (
            <div
              className={`absolute bottom-full left-0 right-0 mb-2 rounded-2xl border shadow-2xl p-2 z-50 min-w-[240px] ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-[#E1E7EA]'}`}
            >
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#718596] font-bold">
                Select Active Role (Demo)
              </div>
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setRole(r.id); setRoleOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${role === r.id
                      ? "bg-[#56B4D3]/15 text-[#56B4D3] font-bold"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                >
                  <div className="flex flex-col">
                    <span className="font-semibold">{r.label}</span>
                    <span className="text-[10px] text-slate-400 font-normal">{r.scope}</span>
                  </div>
                  {role === r.id && <span className="h-2 w-2 rounded-full bg-[#56B4D3] shrink-0" />}
                </button>
              ))}
              <div className="border-t my-1 border-slate-200 dark:border-slate-800" />
              <button
                onClick={() => { setRoleOpen(false); navigate({ to: "/login" }); }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors font-semibold"
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
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs lg:hidden"
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
            aria-label="Open sidebar menu"
            className="lg:hidden h-11 w-11 rounded-full bg-[#DAE2E7] dark:bg-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 flex items-center justify-center text-[#526678] border border-white/60 dark:border-slate-700 shadow-sm shrink-0 transition-all"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Desktop collapse sidebar toggle button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`hidden lg:flex h-11 w-11 rounded-full ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-[#DAE2E7] text-[#526678] border-white/60'} hover:bg-white dark:hover:bg-slate-700 items-center justify-center border shadow-sm shrink-0 transition-all cursor-pointer`}
          >
            {isCollapsed ? <PanelLeftOpen className="h-5 w-5 text-[#56B4D3]" /> : <PanelLeftClose className="h-5 w-5 text-[#526678] dark:text-slate-400" />}
          </button>

          {/* Search Input Trigger Bar */}
          <div
            onClick={() => setSearchOpen(true)}
            className="relative flex-1 max-w-xl h-11 cursor-pointer group"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A8E9C] group-hover:text-[#56B4D3] transition-colors" />
            <input
              type="text"
              readOnly
              placeholder="Search portal modules, reports, governance... (Press ⌘K)"
              className={`w-full h-full pl-11 pr-16 rounded-full ${isDark
                  ? 'bg-slate-800/80 text-slate-200 placeholder:text-slate-400 border-slate-700'
                  : 'bg-[#DAE2E7] hover:bg-[#D6E0E6] text-[#1E293B] placeholder:text-[#7A8E9C] border-white/60'
                } text-xs sm:text-sm font-medium transition-all border shadow-inner outline-none cursor-pointer`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-white/60 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 text-[10px] font-mono text-slate-500 dark:text-slate-300">
              <Command className="h-3 w-3" />
              <span>K</span>
            </div>
          </div>

          {/* Right Top Bar Utilities */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">

            {/* Dark/Light mode toggle button */}
            <button
              onClick={toggleDarkMode}
              aria-label="Toggle theme"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className={`h-11 w-11 rounded-full ${isDark ? 'bg-slate-800 text-amber-400 border-slate-700' : 'bg-[#DAE2E7] text-[#526678] border-white/60'
                } hover:bg-white dark:hover:bg-slate-700 flex items-center justify-center border shadow-sm transition-all cursor-pointer`}
            >
              {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            {/* Notifications Bell Button & Popover */}
            <div className="relative" ref={notifMenuRef}>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                aria-label="View notifications"
                className={`h-11 px-3.5 sm:px-4 rounded-full ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-[#DAE2E7] text-[#526678] border-white/60'
                  } hover:bg-white dark:hover:bg-slate-700 flex items-center gap-2 text-xs font-mono border shadow-sm transition-all relative cursor-pointer`}
              >
                <Bell className="h-4 w-4 text-[#56B4D3]" />
                <span className="hidden sm:inline">{new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}</span>
                {unreadCount > 0 ? (
                  <span className="h-4 px-1.5 rounded-full bg-red-500 text-white font-bold text-[10px] flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                )}
              </button>

              {/* Notification Popover Modal */}
              {notifOpen && (
                <div
                  className={`absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border shadow-2xl p-4 z-50 ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-[#56B4D3]" />
                      <span className="font-bold text-sm">Notifications ({unreadCount} unread)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          title="Mark all as read"
                          className="text-[11px] text-[#56B4D3] hover:underline font-medium flex items-center gap-1"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Mark read
                        </button>
                      )}
                      {notifs.some((n) => n.read) && (
                        <button
                          onClick={clearReadNotifications}
                          title="Clear read notifications"
                          className="text-[11px] text-slate-400 hover:text-red-500 font-medium flex items-center gap-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex items-center gap-1 my-2.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-[11px] font-semibold">
                    {(["all", "alert", "warning", "info"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setNotifFilter(tab)}
                        className={`flex-1 py-1 rounded-lg capitalize transition-colors ${notifFilter === tab
                            ? "bg-white dark:bg-slate-700 text-[#56B4D3] shadow-xs font-bold"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                          }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Notification List */}
                  <div className="max-h-72 overflow-y-auto py-1 space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800 scrollbar-none">
                    {filteredNotifs.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400 font-medium">
                        No notifications in this view
                      </div>
                    ) : (
                      filteredNotifs.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => toggleRead(n.id)}
                          className={`pt-2 flex items-start gap-2.5 cursor-pointer p-2 rounded-xl transition-colors ${!n.read
                              ? isDark ? 'bg-slate-800/80' : 'bg-blue-50/70'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'
                            }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${n.type === "alert"
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
                      ))
                    )}
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

        {/* ─── MAIN CONTENT FRAME ─── */}
        <div className={`relative flex-1 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-[#F4F7F9] border-[#DCE3E8]'} rounded-[24px] flex flex-col overflow-hidden border shadow-xs`}>
          <div className={`w-full h-full ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-[#F4F7F9] border-white'} rounded-[24px] flex flex-col overflow-hidden`}>

            {/* Header bar inside main panel */}
            <div className={`px-6 py-4 border-b ${isDark ? 'border-slate-800 bg-slate-900' : 'border-[#DCE3E8] bg-white'} flex flex-wrap items-center justify-between gap-4 shrink-0`}>
              <div className="min-w-0">
                {breadcrumb && (
                  <div className="text-xs font-semibold tracking-wide uppercase text-[#526174] dark:text-slate-400 mb-0.5">
                    {breadcrumb}
                  </div>
                )}
                <div className="flex flex-col">
                  <h1 className={`text-2xl lg:text-[28px] font-bold tracking-tight truncate ${isDark ? 'text-white' : 'text-[#172033]'}`}>
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="text-sm font-normal text-[#526174] dark:text-slate-400 mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
              {primaryAction && <div className="flex items-center gap-2 shrink-0">{primaryAction}</div>}
            </div>

            {/* Optional toolbar */}
            {toolbar && (
              <div className={`px-6 py-3 border-b ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-[#DCE3E8] bg-white/70'} flex flex-wrap items-center gap-2 text-sm shrink-0`}>
                {toolbar}
              </div>
            )}

            {/* Page content */}
            <div className="flex-1 overflow-auto p-5 lg:p-7 text-[#172033] dark:text-slate-100">
              {children}
            </div>

          </div>
        </div>

      </div>

      {/* ─── SEARCH COMMAND PALETTE OVERLAY (⌘K) ─── */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center pt-16 sm:pt-24 p-4">
          <div className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-[#DCE3E8] text-[#172033]'}`}>
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <Search className="h-5 w-5 text-[#168FA8] shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type to search portal modules..."
                className="flex-1 bg-transparent border-none outline-none text-sm font-medium placeholder:text-[#7B8798]"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="px-2 py-1 rounded-md text-xs font-mono bg-slate-100 dark:bg-slate-800 text-[#526174] dark:text-slate-300"
              >
                ESC
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filteredSearchItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#7B8798]">
                  No portal modules match "<span className="font-semibold">{searchQuery}</span>"
                </div>
              ) : (
                filteredSearchItems.map((it) => {
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.key}
                      to={it.to}
                      onClick={() => setSearchOpen(false)}
                      className="p-3 rounded-xl flex items-center justify-between hover:bg-[#E7F5F8] dark:hover:bg-slate-800 transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-[#E7F5F8] dark:bg-slate-800 text-[#168FA8] flex items-center justify-center shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-[#172033] dark:text-slate-100 group-hover:text-[#168FA8] transition-colors">
                            {it.label}
                          </div>
                          {it.desc && (
                            <div className="text-xs text-[#526174] font-normal">
                              {it.desc}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-[#168FA8] opacity-0 group-hover:opacity-100 transition-opacity">
                        Go →
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

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
      className="h-10 px-4 rounded-xl text-sm font-semibold bg-[#168FA8] hover:bg-[#0F6F83] text-white shadow-xs transition-all duration-200 disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer active:scale-98"
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
      className="h-10 px-4 rounded-xl text-sm font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#172033] dark:text-slate-100 border border-[#DCE3E8] dark:border-slate-700 shadow-2xs transition-all duration-200 inline-flex items-center gap-2 cursor-pointer active:scale-98"
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
      className="h-9 px-3.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#526174] dark:text-slate-200 border border-[#DCE3E8] dark:border-slate-700 shadow-2xs transition-all inline-flex items-center gap-2 text-xs font-semibold cursor-pointer active:scale-98 font-sans"
    >
      <span className="text-xs font-normal text-[#526174] dark:text-slate-400">
        {label}
      </span>
      <span className="font-semibold text-[#168FA8]">{value}</span>
      <ChevronDown className="h-3.5 w-3.5 opacity-70 text-[#526174]" />
    </button>
  );
}

export function SectionCard({
  title,
  action,
  children,
  noPad,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  noPad?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE3E8] dark:border-slate-800 shadow-2xs overflow-hidden ${className || ""}`}>
      {title && (
        <div className="px-6 py-4 flex items-center justify-between border-b border-[#DCE3E8] dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="font-bold text-[17px] text-[#172033] dark:text-white flex items-center gap-2 font-sans">
            {title}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={noPad ? "" : "p-6"}>{children}</div>
    </div>
  );
}
