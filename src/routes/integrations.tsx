import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
} from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import type { Status } from "@/components/StatusBadge";
import {
  Building2,
  Smartphone,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  Database,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

export const Route = createFileRoute("/integrations")({
  component: IntegrationCatalog,
});

type Source = {
  id: string;
  name: string;
  Icon: typeof Building2;
  color: string;
  type: string;
  status: Status;
  sync: string;
  records: string;
  desc: string;
};

const SOURCES: Source[] = [
  { id: "core-banking",  name: "Core Banking",    Icon: Building2,       color: "#2D6A9F", type: "Banking",  status: "healthy", sync: "2m ago",  records: "128,400", desc: "Accounts, balances, transactions" },
  { id: "mobile-money",  name: "Mobile Money",    Icon: Smartphone,      color: "#0D9488", type: "Mobile",   status: "healthy", sync: "5m ago",  records: "84,201",  desc: "M-Pesa, Airtel Money transactions" },
  { id: "payment-gw",    name: "Payment Gateway", Icon: CreditCard,      color: "#7C3AED", type: "Payments", status: "warning", sync: "12m ago", records: "22,100",  desc: "Stripe, card transaction feed" },
  { id: "credit-bureau", name: "Credit Bureau",   Icon: FileSpreadsheet, color: "#D97706", type: "Credit",   status: "healthy", sync: "1h ago",  records: "45,890",  desc: "Credit scores and history" },
  { id: "erp",           name: "ERP / Accounting",Icon: Landmark,        color: "#0891B2", type: "ERP",      status: "failed",  sync: "3h ago",  records: "0",       desc: "SAP GL, AR/AP ledgers" },
  { id: "custom-api",    name: "Custom API",      Icon: Database,        color: "#374151", type: "Custom",   status: "queued",  sync: "Pending", records: "—",       desc: "Bespoke internal data source" },
];

const MOCK_URLS: Record<string, string> = {
  "core-banking":  "https://api.corebank.internal/v3/stream",
  "mobile-money":  "https://mm.gateway.internal/api/v2/feed",
  "payment-gw":    "https://hooks.stripe.com/v1/ingest",
  "credit-bureau": "https://bureau.credit.internal/pull/v4",
  "erp":           "https://sap.internal/gl/sync/v1",
  "custom-api":    "https://custom.internal/api/endpoint",
};

type StatusFilter = "all" | "healthy" | "warning" | "failed" | "queued";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all",     label: "All" },
  { value: "healthy", label: "Healthy" },
  { value: "warning", label: "Warning" },
  { value: "failed",  label: "Failed" },
  { value: "queued",  label: "Queued" },
];

function statusCount(status: StatusFilter) {
  if (status === "all") return SOURCES.length;
  return SOURCES.filter((s) => s.status === status).length;
}

function IntegrationCatalog() {
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [showAddModal, setShowAddModal]   = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [refreshing, setRefreshing]       = useState<Set<string>>(new Set());

  // Add modal fields
  const [addName, setAddName]         = useState("");
  const [addType, setAddType]         = useState("Banking");
  const [addEndpoint, setAddEndpoint] = useState("");
  const [addApiKey, setAddApiKey]     = useState("");

  // Configure modal fields
  const [cfgEndpoint, setCfgEndpoint]     = useState("");
  const [cfgApiKey, setCfgApiKey]         = useState("");
  const [cfgFrequency, setCfgFrequency]   = useState("Real-time");

  const filtered = useMemo(() => {
    return SOURCES.filter((s) => {
      const matchSearch =
        search.trim() === "" ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.desc.toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

  function handleSyncNow(id: string) {
    setRefreshing((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setRefreshing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  }

  function openConfigure(s: Source) {
    setSelectedSource(s);
    setCfgEndpoint(MOCK_URLS[s.id] ?? "");
    setCfgApiKey("sk-••••••••••••••••••••••••••••••");
    setCfgFrequency("Real-time");
  }

  return (
    <AppShell
      title="Integration Catalog"
      breadcrumb="CONNECT › INTEGRATIONS"
      scope="all sources"
      primaryAction={
        <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddModal(true)}>
          Add Integration
        </PrimaryButton>
      }
      toolbar={
        <>
          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
              style={{ color: "var(--neutral-400)" }}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search integrations…"
              className="h-8 pl-8 pr-3 rounded-lg text-[13px] w-52 focus:outline-none"
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--paper)",
                color: "var(--neutral-900)",
              }}
            />
          </div>

          {/* Status filter buttons */}
          <div className="flex items-center gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className="h-8 px-3 rounded-lg text-[12px] font-medium transition-colors"
                style={{
                  backgroundColor: statusFilter === opt.value ? "var(--primary-500)" : "transparent",
                  color:           statusFilter === opt.value ? "#fff" : "var(--neutral-700)",
                  border:          statusFilter === opt.value ? "1px solid var(--primary-500)" : "1px solid var(--border)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      }
    >
      {/* ── Card grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
        {filtered.map((s) => {
          const Icon = s.Icon;
          const isRefreshing = refreshing.has(s.id);
          return (
            <div
              key={s.id}
              className="rounded-xl p-5 cursor-pointer transition-shadow"
              style={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.boxShadow = "none")
              }
              onClick={() => openConfigure(s)}
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-xl grid place-items-center shrink-0"
                    style={{ backgroundColor: s.color }}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3
                      className="text-[15px] font-semibold leading-tight"
                      style={{ color: "var(--neutral-900)" }}
                    >
                      {s.name}
                    </h3>
                    <span
                      className="inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium"
                      style={{
                        backgroundColor: "var(--neutral-100)",
                        color: "var(--neutral-500)",
                      }}
                    >
                      {s.type}
                    </span>
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </div>

              {/* Description */}
              <p
                className="text-[13px] mb-3 leading-snug"
                style={{ color: "var(--neutral-500)" }}
              >
                {s.desc}
              </p>

              {/* Stats row */}
              <div
                className="flex items-center justify-between mb-4 font-mono text-[11px] px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: "var(--neutral-50)",
                  border: "1px solid var(--neutral-200)",
                }}
              >
                <span style={{ color: "var(--neutral-500)" }}>
                  Last sync:{" "}
                  <span style={{ color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}>
                    {s.sync}
                  </span>
                </span>
                <span style={{ color: "var(--neutral-500)" }}>
                  Records:{" "}
                  <span style={{ color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}>
                    {s.records}
                  </span>
                </span>
              </div>

              {/* Bottom action row */}
              <div
                className="flex items-center justify-between"
                onClick={(e) => e.stopPropagation()}
              >
                <SecondaryButton onClick={() => openConfigure(s)}>
                  Configure
                </SecondaryButton>

                <button
                  onClick={() => handleSyncNow(s.id)}
                  className="h-8 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors"
                  style={{
                    backgroundColor: "transparent",
                    color:  s.status === "failed" ? "var(--fail)" : "var(--neutral-500)",
                    border: `1px solid ${s.status === "failed" ? "rgba(225,29,72,0.25)" : "var(--border)"}`,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      s.status === "failed" ? "var(--fail-bg)" : "var(--neutral-100)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  {s.status === "failed" ? "Retry" : isRefreshing ? "Syncing…" : "Sync now"}
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div
            className="col-span-full py-16 text-center"
            style={{ color: "var(--neutral-400)" }}
          >
            <span className="font-mono text-[13px]">
              No integrations match the current filters.
            </span>
          </div>
        )}
      </div>

      {/* ── Summary strip ── */}
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl font-mono text-[12px]"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <span style={{ color: "var(--neutral-500)" }}>
          {SOURCES.length} sources total
        </span>
        <span style={{ color: "var(--neutral-300, #D1D5DB)" }}>·</span>
        <span style={{ color: "var(--ok)" }}>
          {statusCount("healthy")} Healthy
        </span>
        <span style={{ color: "var(--neutral-300, #D1D5DB)" }}>·</span>
        <span style={{ color: "var(--warn)" }}>
          {statusCount("warning")} Warning
        </span>
        <span style={{ color: "var(--neutral-300, #D1D5DB)" }}>·</span>
        <span style={{ color: "var(--fail)" }}>
          {statusCount("failed")} Failed
        </span>
        <span style={{ color: "var(--neutral-300, #D1D5DB)" }}>·</span>
        <span style={{ color: "var(--warn)" }}>
          {statusCount("queued")} Queued
        </span>
      </div>

      {/* ── Configure modal ── */}
      {selectedSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedSource(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-xl grid place-items-center shrink-0"
                  style={{ backgroundColor: selectedSource.color }}
                >
                  <selectedSource.Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2
                    className="text-[16px] font-semibold"
                    style={{ color: "var(--neutral-900)" }}
                  >
                    Configure
                  </h2>
                  <p className="text-[12px] font-mono" style={{ color: "var(--neutral-500)" }}>
                    {selectedSource.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSource(null)}
                className="h-8 w-8 rounded-lg grid place-items-center transition-colors"
                style={{ color: "var(--neutral-500)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--neutral-100)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")
                }
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Read-only status strip */}
            <div
              className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-lg mb-5 font-mono text-[12px]"
              style={{
                backgroundColor: "var(--neutral-50)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ color: "var(--neutral-500)" }}>Status</span>
                <StatusBadge status={selectedSource.status} />
              </div>
              <div style={{ color: "var(--neutral-400)" }}>·</div>
              <div style={{ color: "var(--neutral-500)" }}>
                Type:{" "}
                <span style={{ color: "var(--neutral-900)" }}>{selectedSource.type}</span>
              </div>
              <div style={{ color: "var(--neutral-400)" }}>·</div>
              <div style={{ color: "var(--neutral-500)" }}>
                Sync:{" "}
                <span style={{ color: "var(--neutral-900)" }}>{selectedSource.sync}</span>
              </div>
              <div style={{ color: "var(--neutral-400)" }}>·</div>
              <div style={{ color: "var(--neutral-500)" }}>
                Records:{" "}
                <span style={{ color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}>
                  {selectedSource.records}
                </span>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4 mb-6">
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 font-mono uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Endpoint URL
                </label>
                <input
                  type="text"
                  value={cfgEndpoint}
                  onChange={(e) => setCfgEndpoint(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg text-[13px] font-mono focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--paper)",
                    color: "var(--neutral-900)",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 font-mono uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  API Key
                </label>
                <input
                  type="password"
                  value={cfgApiKey}
                  onChange={(e) => setCfgApiKey(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg text-[13px] font-mono focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--paper)",
                    color: "var(--neutral-900)",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 font-mono uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Sync Frequency
                </label>
                <select
                  value={cfgFrequency}
                  onChange={(e) => setCfgFrequency(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg text-[13px] focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--paper)",
                    color: "var(--neutral-900)",
                  }}
                >
                  {["Real-time", "5min", "15min", "Hourly", "Daily"].map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => alert("Connection test: OK")}
                className="h-9 px-4 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors"
                style={{
                  backgroundColor: "var(--primary-50)",
                  color: "var(--primary-700)",
                  border: "1px solid var(--primary-100)",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-100)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-50)")
                }
              >
                Test Connection
              </button>
              <SecondaryButton onClick={() => setSelectedSource(null)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={() => setSelectedSource(null)}>Save Configuration</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Integration modal ── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2
                className="text-[16px] font-semibold"
                style={{ color: "var(--neutral-900)" }}
              >
                Add Integration
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="h-8 w-8 rounded-lg grid place-items-center transition-colors"
                style={{ color: "var(--neutral-500)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--neutral-100)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")
                }
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 font-mono uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Name
                </label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Savings Core"
                  className="w-full h-9 px-3 rounded-lg text-[13px] focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--paper)",
                    color: "var(--neutral-900)",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 font-mono uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Type
                </label>
                <select
                  value={addType}
                  onChange={(e) => setAddType(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg text-[13px] focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--paper)",
                    color: "var(--neutral-900)",
                  }}
                >
                  {["Banking", "Mobile", "Payments", "Credit", "ERP", "Custom"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 font-mono uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  Endpoint URL
                </label>
                <input
                  type="text"
                  value={addEndpoint}
                  onChange={(e) => setAddEndpoint(e.target.value)}
                  placeholder="https://api.yourservice.com/v1/"
                  className="w-full h-9 px-3 rounded-lg text-[13px] font-mono focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--paper)",
                    color: "var(--neutral-900)",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-[12px] font-medium mb-1.5 font-mono uppercase tracking-wide"
                  style={{ color: "var(--neutral-500)" }}
                >
                  API Key
                </label>
                <input
                  type="password"
                  value={addApiKey}
                  onChange={(e) => setAddApiKey(e.target.value)}
                  placeholder="sk-••••••••••••••••"
                  className="w-full h-9 px-3 rounded-lg text-[13px] font-mono focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--paper)",
                    color: "var(--neutral-900)",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <SecondaryButton onClick={() => setShowAddModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton
                onClick={() => {
                  setShowAddModal(false);
                  setAddName("");
                  setAddType("Banking");
                  setAddEndpoint("");
                  setAddApiKey("");
                  alert("Integration added");
                }}
              >
                Add Integration
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
