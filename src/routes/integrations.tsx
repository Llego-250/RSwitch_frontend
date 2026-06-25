import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  FilterChip,
  SectionCard,
} from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { canManage } from "@/lib/roles";
import {
  Building2,
  Smartphone,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  Database,
  Plus,
  Settings2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

export const Route = createFileRoute("/integrations")({
  component: Integrations,
});

type SourceStatus = "healthy" | "warning" | "failed" | "queued";

interface Source {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  type: string;
  status: SourceStatus;
  sync: string;
  records: string;
  desc: string;
}

const SOURCES: Source[] = [
  {
    id: "core-banking",
    name: "Core Banking",
    icon: Building2,
    color: "#2D6A9F",
    type: "Banking",
    status: "healthy",
    sync: "2m ago",
    records: "128,400",
    desc: "Accounts, balances, transactions",
  },
  {
    id: "mobile-money",
    name: "Mobile Money",
    icon: Smartphone,
    color: "#0D9488",
    type: "Mobile",
    status: "healthy",
    sync: "5m ago",
    records: "84,201",
    desc: "M-Pesa, Airtel Money transactions",
  },
  {
    id: "payment-gw",
    name: "Payment Gateway",
    icon: CreditCard,
    color: "#7C3AED",
    type: "Payments",
    status: "warning",
    sync: "12m ago",
    records: "22,100",
    desc: "Stripe, card transaction feed",
  },
  {
    id: "credit-bureau",
    name: "Credit Bureau",
    icon: FileSpreadsheet,
    color: "#D97706",
    type: "Credit",
    status: "healthy",
    sync: "1h ago",
    records: "45,890",
    desc: "Credit scores and history",
  },
  {
    id: "erp",
    name: "ERP / Accounting",
    icon: Landmark,
    color: "#0891B2",
    type: "ERP",
    status: "failed",
    sync: "3h ago",
    records: "0",
    desc: "SAP GL, AR/AP ledgers",
  },
  {
    id: "custom-api",
    name: "Custom API",
    icon: Database,
    color: "#374151",
    type: "Custom",
    status: "queued",
    sync: "Pending",
    records: "—",
    desc: "Bespoke internal data source",
  },
];

const SOURCE_TYPES = ["All types", "Banking", "Mobile", "Payments", "Credit", "ERP", "Custom"];
const STATUS_OPTIONS = ["All statuses", "healthy", "warning", "failed", "queued"];

export default function Integrations() {
  const { role } = useRole();
  const manage = canManage(role, "integrations");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All types");
  const [statusFilter, setStatusFilter] = useState("All statuses");

  const hasFilters =
    search.trim() !== "" ||
    typeFilter !== "All types" ||
    statusFilter !== "All statuses";

  const filtered = SOURCES.filter((s) => {
    const matchSearch =
      search.trim() === "" ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.desc.toLowerCase().includes(search.toLowerCase()) ||
      s.type.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "All types" || s.type === typeFilter;
    const matchStatus = statusFilter === "All statuses" || s.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const healthyCount = SOURCES.filter((s) => s.status === "healthy").length;
  const warningCount = SOURCES.filter((s) => s.status === "warning").length;
  const failedCount = SOURCES.filter((s) => s.status === "failed").length;
  const queuedCount = SOURCES.filter((s) => s.status === "queued").length;

  return (
    <AppShell
      title="Integration Catalog"
      breadcrumb="CONNECT › INTEGRATIONS"
      scope="all sources"
      primaryAction={
        manage ? (
          <PrimaryButton icon={<Plus className="h-4 w-4" />}>
            Add Integration
          </PrimaryButton>
        ) : undefined
      }
      toolbar={
        <>
          {/* Search */}
          <div className="relative flex-1 min-w-50 max-w-[320px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
              style={{ color: "var(--neutral-400)" }}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search integrations…"
              className="w-full h-8 pl-8 pr-3 rounded-lg text-[13px] border focus:outline-none transition-colors"
              style={{
                backgroundColor: "var(--neutral-50)",
                borderColor: "var(--border)",
                color: "var(--neutral-900)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--primary-500)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border)")
              }
            />
          </div>

          {/* Source type select */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 pl-3 pr-7 rounded-lg text-[13px] border appearance-none cursor-pointer focus:outline-none"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--neutral-700)",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "All types" ? "Source type" : t}
              </option>
            ))}
          </select>

          {/* Status select */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 pl-3 pr-7 rounded-lg text-[13px] border appearance-none cursor-pointer focus:outline-none"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--neutral-700)",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "All statuses" ? "Status" : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setTypeFilter("All types");
                setStatusFilter("All statuses");
              }}
              className="h-8 px-3 rounded-lg text-[13px] inline-flex items-center gap-1.5 transition-colors"
              style={{ color: "var(--neutral-500)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--neutral-900)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--neutral-500)")
              }
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </>
      }
    >
      {/* Integration source cards */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                className="rounded-lg p-5 flex flex-col gap-0"
                style={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                }}
              >
                {/* Top row: icon + name + status badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-12 w-12 rounded-full grid place-items-center shrink-0"
                      style={{ backgroundColor: s.color + "18" }}
                    >
                      <Icon
                        className="h-5 w-5"
                        style={{ color: s.color }}
                        strokeWidth={1.75}
                      />
                    </div>
                    <h3
                      className="text-[15px] font-semibold leading-snug truncate"
                      style={{ color: "var(--neutral-900)" }}
                    >
                      {s.name}
                    </h3>
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <StatusBadge status={s.status} />
                  </div>
                </div>

                {/* Type badge + description */}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium uppercase tracking-wide"
                    style={{
                      backgroundColor: "var(--neutral-100)",
                      color: "var(--neutral-500)",
                    }}
                  >
                    {s.type}
                  </span>
                  <span
                    className="text-[13px] truncate"
                    style={{ color: "var(--neutral-500)" }}
                  >
                    {s.desc}
                  </span>
                </div>

                {/* Stats row */}
                <div
                  className="mt-3 pt-3 flex items-center justify-between gap-4"
                  style={{ borderTop: "1px solid var(--neutral-100)" }}
                >
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: "var(--neutral-400)" }}
                  >
                    Last sync:{" "}
                    <span
                      className="tabular"
                      style={{ color: "var(--neutral-700)" }}
                    >
                      {s.sync}
                    </span>
                  </span>
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: "var(--neutral-400)" }}
                  >
                    Records:{" "}
                    <span
                      className="tabular"
                      style={{ color: "var(--neutral-700)" }}
                    >
                      {s.records}
                    </span>
                  </span>
                </div>

                {/* Bottom: connection status + configure button */}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <StatusBadge status={s.status} />
                  <SecondaryButton
                    icon={<Settings2 className="h-3.5 w-3.5" />}
                    onClick={() => {}}
                  >
                    Configure
                  </SecondaryButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="rounded-lg p-12 text-center"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <p
            className="text-[14px]"
            style={{ color: "var(--neutral-500)" }}
          >
            No integrations match your filters.
          </p>
          <button
            onClick={() => {
              setSearch("");
              setTypeFilter("All types");
              setStatusFilter("All statuses");
            }}
            className="mt-2 text-[13px] underline underline-offset-2"
            style={{ color: "var(--primary-500)" }}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Summary strip */}
      <div
        className="mt-5 rounded-lg px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <span
          className="font-mono text-[11px] uppercase tracking-wide"
          style={{ color: "var(--neutral-400)" }}
        >
          {SOURCES.length} sources total
        </span>

        <span className="flex items-center gap-1.5 font-mono text-[12px]">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--ok)" }}
          />
          <span style={{ color: "var(--neutral-700)" }}>
            <span
              className="font-semibold tabular"
              style={{ color: "var(--ok)" }}
            >
              {healthyCount}
            </span>{" "}
            Healthy
          </span>
        </span>

        <span className="flex items-center gap-1.5 font-mono text-[12px]">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--warn)" }}
          />
          <span style={{ color: "var(--neutral-700)" }}>
            <span
              className="font-semibold tabular"
              style={{ color: "var(--warn)" }}
            >
              {warningCount}
            </span>{" "}
            Warning
          </span>
        </span>

        <span className="flex items-center gap-1.5 font-mono text-[12px]">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--fail)" }}
          />
          <span style={{ color: "var(--neutral-700)" }}>
            <span
              className="font-semibold tabular"
              style={{ color: "var(--fail)" }}
            >
              {failedCount}
            </span>{" "}
            Failed
          </span>
        </span>

        <span className="flex items-center gap-1.5 font-mono text-[12px]">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--warn)" }}
          />
          <span style={{ color: "var(--neutral-700)" }}>
            <span
              className="font-semibold tabular"
              style={{ color: "var(--warn)" }}
            >
              {queuedCount}
            </span>{" "}
            Queued
          </span>
        </span>

        <span
          className="ml-auto font-mono text-[11px]"
          style={{ color: "var(--neutral-400)" }}
        >
          FR-INT-01 · FR-INT-03 · BR-03
        </span>
      </div>
    </AppShell>
  );
}
