import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useState } from "react";
import {
  Search, Shield, User2, Link2, CreditCard, Phone, MapPin, AlertTriangle,
} from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/customer-360")({
  component: Customer360,
});

// ─── Data ────────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  { id: "CUS-88421", name: "Amara Diallo",       risk: "medium", consent: "active"  as const },
  { id: "CUS-77302", name: "Samuel Osei",         risk: "low",    consent: "active"  as const },
  { id: "CUS-94108", name: "Fatima Al-Rashid",    risk: "high",   consent: "pending" as const },
];

const IDENTITY = {
  "CUS-88421": {
    email: "amara.diallo@email.com",
    phone: "+234 801 234 5678",
    location: "Lagos, Nigeria",
    quality: 94,
    initials: "AD",
  },
  "CUS-77302": {
    email: "samuel.osei@email.com",
    phone: "+233 20 987 6543",
    location: "Accra, Ghana",
    quality: 87,
    initials: "SO",
  },
  "CUS-94108": {
    email: "fatima.r@email.com",
    phone: "+971 50 345 6789",
    location: "Dubai, UAE",
    quality: 71,
    initials: "FR",
  },
};

const RISK_METRICS = {
  "CUS-88421": { pd: "2.4%", lgd: "38%", ead: "$48,200", score: "72/100" },
  "CUS-77302": { pd: "0.9%", lgd: "22%", ead: "$31,500", score: "88/100" },
  "CUS-94108": { pd: "7.1%", lgd: "54%", ead: "$92,400", score: "41/100" },
};

const ACCOUNTS_DATA = {
  "CUS-88421": [
    { id: "ACC-88421", type: "Checking", balance: "$12,480.22", status: "healthy" as const, source: "core-banking",  lastTx: "Jun 24, 2026" },
    { id: "ACC-88422", type: "Savings",  balance: "$48,103.10", status: "healthy" as const, source: "core-banking",  lastTx: "Jun 22, 2026" },
    { id: "LN-22019",  type: "Loan",     balance: "$24,000.00", status: "warning" as const, source: "loans-svc",     lastTx: "Jun 01, 2026" },
  ],
  "CUS-77302": [
    { id: "ACC-77302", type: "Checking", balance: "$8,220.50",  status: "healthy" as const, source: "core-banking",  lastTx: "Jun 25, 2026" },
    { id: "ACC-77303", type: "Savings",  balance: "$62,100.00", status: "healthy" as const, source: "core-banking",  lastTx: "Jun 20, 2026" },
    { id: "LN-19004",  type: "Loan",     balance: "$11,000.00", status: "healthy" as const, source: "loans-svc",     lastTx: "Jun 15, 2026" },
  ],
  "CUS-94108": [
    { id: "ACC-94108", type: "Checking", balance: "$3,402.80",  status: "warning" as const, source: "core-banking",  lastTx: "Jun 23, 2026" },
    { id: "ACC-94109", type: "Savings",  balance: "$19,870.00", status: "healthy" as const, source: "core-banking",  lastTx: "Jun 18, 2026" },
    { id: "LN-30812",  type: "Loan",     balance: "$88,500.00", status: "warning" as const, source: "loans-svc",     lastTx: "May 30, 2026" },
  ],
};

const TRANSACTIONS_DATA = [
  { date: "Jun 25",  desc: "Salary Credit",          amount: "+$4,200.00", source: "payroll-svc",    type: "Credit",  status: "completed" as const },
  { date: "Jun 24",  desc: "MTN Airtime Top-up",      amount: "-$15.00",    source: "telco-api",      type: "Debit",   status: "completed" as const },
  { date: "Jun 23",  desc: "Groceries — Shoprite",    amount: "-$82.50",    source: "pos-gateway",    type: "Debit",   status: "completed" as const },
  { date: "Jun 22",  desc: "Rent Payment",             amount: "-$650.00",   source: "bank-transfer",  type: "Debit",   status: "completed" as const },
  { date: "Jun 20",  desc: "Savings Transfer",         amount: "-$500.00",   source: "core-banking",   type: "Debit",   status: "completed" as const },
  { date: "Jun 18",  desc: "International Wire",       amount: "-$1,200.00", source: "swift-gw",       type: "Debit",   status: "warning"   as const },
  { date: "Jun 15",  desc: "Loan EMI Repayment",       amount: "-$340.00",   source: "loans-svc",      type: "Debit",   status: "completed" as const },
  { date: "Jun 10",  desc: "ATM Withdrawal",           amount: "-$200.00",   source: "atm-network",    type: "Debit",   status: "completed" as const },
];

const RISK_HISTORY = {
  "CUS-88421": [
    { month: "Jan", score: 65 }, { month: "Feb", score: 68 }, { month: "Mar", score: 66 },
    { month: "Apr", score: 70 }, { month: "May", score: 71 }, { month: "Jun", score: 72 },
    { month: "Jul", score: 74 }, { month: "Aug", score: 73 }, { month: "Sep", score: 75 },
    { month: "Oct", score: 72 }, { month: "Nov", score: 70 }, { month: "Dec", score: 72 },
  ],
  "CUS-77302": [
    { month: "Jan", score: 82 }, { month: "Feb", score: 84 }, { month: "Mar", score: 85 },
    { month: "Apr", score: 86 }, { month: "May", score: 87 }, { month: "Jun", score: 88 },
    { month: "Jul", score: 88 }, { month: "Aug", score: 89 }, { month: "Sep", score: 90 },
    { month: "Oct", score: 88 }, { month: "Nov", score: 87 }, { month: "Dec", score: 88 },
  ],
  "CUS-94108": [
    { month: "Jan", score: 55 }, { month: "Feb", score: 52 }, { month: "Mar", score: 48 },
    { month: "Apr", score: 44 }, { month: "May", score: 43 }, { month: "Jun", score: 41 },
    { month: "Jul", score: 40 }, { month: "Aug", score: 39 }, { month: "Sep", score: 42 },
    { month: "Oct", score: 38 }, { month: "Nov", score: 36 }, { month: "Dec", score: 41 },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: "Low Risk",    color: "#0D9488", bg: "#CCFBF1" },
  medium: { label: "Medium Risk", color: "#D97706", bg: "#FEF3C7" },
  high:   { label: "High Risk",   color: "#E11D48", bg: "#FFE4E6" },
};

// ─── Component ───────────────────────────────────────────────────────────────

function Customer360() {
  const [selectedId, setSelectedId] = useState("CUS-88421");
  const [activeTab, setActiveTab] = useState<"overview" | "accounts" | "transactions" | "risk">("overview");

  const customer = CUSTOMERS.find((c) => c.id === selectedId)!;
  const identity = IDENTITY[selectedId as keyof typeof IDENTITY];
  const risk = RISK_METRICS[selectedId as keyof typeof RISK_METRICS];
  const accounts = ACCOUNTS_DATA[selectedId as keyof typeof ACCOUNTS_DATA];
  const riskHistory = RISK_HISTORY[selectedId as keyof typeof RISK_HISTORY];
  const riskCfg = RISK_CONFIG[customer.risk];

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "overview",      label: "Overview"      },
    { key: "accounts",      label: "Accounts"      },
    { key: "transactions",  label: "Transactions"  },
    { key: "risk",          label: "Risk History"  },
  ];

  return (
    <AppShell
      title="Customer 360"
      breadcrumb="GOVERN › CUSTOMER 360"
      primaryAction={
        <SecondaryButton icon={<Search className="h-3.5 w-3.5" />}>
          Search Customer
        </SecondaryButton>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* ── Customer Selector Bar ── */}
        <SectionCard>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              className="font-mono"
              style={{ fontSize: "11px", color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "4px" }}
            >
              Customer
            </span>
            {CUSTOMERS.map((c) => {
              const cfg = RISK_CONFIG[c.risk];
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); setActiveTab("overview"); }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: active ? `1.5px solid var(--primary-500)` : "1.5px solid var(--border)",
                    backgroundColor: active ? "var(--primary-50)" : "var(--card)",
                    color: active ? "var(--primary-700)" : "var(--neutral-700)",
                    fontWeight: active ? 600 : 400,
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "border-color 0.15s, background-color 0.15s",
                  }}
                >
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      backgroundColor: cfg.color,
                      flexShrink: 0,
                    }}
                  />
                  <span>{c.name}</span>
                  <span
                    className="font-mono"
                    style={{ fontSize: "10px", color: active ? "var(--primary-500)" : "var(--neutral-400)" }}
                  >
                    {c.id}
                  </span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Customer Header ── */}
        <div
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            borderLeft: `4px solid ${riskCfg.color}`,
            padding: "20px 24px",
            display: "flex",
            alignItems: "flex-start",
            gap: "20px",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              backgroundColor: "var(--primary-100)",
              color: "var(--primary-700)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              fontWeight: 700,
              flexShrink: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {identity.initials}
          </div>

          {/* Identity */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <h1
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "var(--neutral-900)",
                  letterSpacing: "-0.02em",
                  margin: 0,
                }}
              >
                {customer.name}
              </h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "3px 10px",
                  borderRadius: "4px",
                  backgroundColor: riskCfg.bg,
                  color: riskCfg.color,
                  fontSize: "12px",
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {customer.risk === "high" && <AlertTriangle style={{ width: "11px", height: "11px" }} />}
                {riskCfg.label}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "6px", flexWrap: "wrap" }}>
              <span className="font-mono" style={{ fontSize: "12px", color: "var(--neutral-500)" }}>
                {customer.id}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <StatusBadge status={customer.consent === "active" ? "active" : "queued"}>
                  Consent {customer.consent === "active" ? "Active" : "Pending"}
                </StatusBadge>
              </span>
              <button
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: "12px",
                  color: "var(--fail)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                }}
              >
                Revoke consent
              </button>
            </div>
          </div>

          {/* Shield icon */}
          <Shield style={{ width: "20px", height: "20px", color: "var(--neutral-300)", flexShrink: 0, marginTop: "4px" }} />
        </div>

        {/* ── Tabs ── */}
        <div
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--border)",
              padding: "0 20px",
              gap: "0",
            }}
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: "12px 16px",
                    fontSize: "13px",
                    fontWeight: active ? 600 : 400,
                    color: active ? "var(--primary-500)" : "var(--neutral-500)",
                    background: "none",
                    border: "none",
                    borderBottom: active ? "2px solid var(--primary-500)" : "2px solid transparent",
                    marginBottom: "-1px",
                    cursor: "pointer",
                    transition: "color 0.12s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ padding: "24px" }}>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === "overview" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>

                {/* Left: Identity card */}
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div
                    style={{
                      backgroundColor: "var(--neutral-50)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "20px",
                    }}
                  >
                    {/* Avatar + name */}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "50%",
                          backgroundColor: "var(--primary-100)",
                          color: "var(--primary-700)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "15px",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {identity.initials}
                      </div>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--neutral-900)" }}>
                          {customer.name}
                        </div>
                        <div className="font-mono" style={{ fontSize: "11px", color: "var(--neutral-400)" }}>
                          {customer.id}
                        </div>
                      </div>
                    </div>

                    {/* Contact fields */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {[
                        { icon: <User2 style={{ width: "13px", height: "13px" }} />, label: "Email",    value: identity.email    },
                        { icon: <Phone style={{ width: "13px", height: "13px" }} />, label: "Phone",    value: identity.phone    },
                        { icon: <MapPin style={{ width: "13px", height: "13px" }} />, label: "Location", value: identity.location },
                      ].map((row) => (
                        <div key={row.label} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                          <span style={{ color: "var(--neutral-400)", marginTop: "1px", flexShrink: 0 }}>
                            {row.icon}
                          </span>
                          <div>
                            <div className="font-mono" style={{ fontSize: "10px", color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {row.label}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--neutral-700)", marginTop: "1px" }}>
                              {row.value}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Data quality */}
                    <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span className="font-mono" style={{ fontSize: "10px", color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Data Quality Score
                        </span>
                        <span className="font-mono" style={{ fontSize: "12px", fontWeight: 600, color: "#0D9488" }}>
                          {identity.quality}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: "5px",
                          borderRadius: "3px",
                          backgroundColor: "var(--neutral-200)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${identity.quality}%`,
                            borderRadius: "3px",
                            backgroundColor: identity.quality >= 85 ? "#0D9488" : identity.quality >= 70 ? "#D97706" : "#E11D48",
                          }}
                        />
                      </div>
                    </div>

                    {/* Consent */}
                    <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="font-mono" style={{ fontSize: "10px", color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Consent
                      </span>
                      <StatusBadge status={customer.consent === "active" ? "active" : "queued"}>
                        {customer.consent === "active" ? "Active" : "Pending"}
                      </StatusBadge>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <PrimaryButton>
                      Add to Watchlist
                    </PrimaryButton>
                    <SecondaryButton>
                      Run Stress Test
                    </SecondaryButton>
                  </div>
                </div>

                {/* Right: Risk metric KPI grid */}
                <div>
                  <div className="font-mono" style={{ fontSize: "11px", color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>
                    Risk Metrics
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <KpiCard
                      label="PD — Probability of Default"
                      value={risk.pd}
                      source="risk-engine"
                      freshness="live"
                      updated="12:00"
                      delta={{ dir: "up", text: "+0.3%", tone: "bad" }}
                    />
                    <KpiCard
                      label="LGD — Loss Given Default"
                      value={risk.lgd}
                      source="risk-engine"
                      freshness="live"
                      updated="12:00"
                    />
                    <KpiCard
                      label="EAD — Exposure at Default"
                      value={risk.ead}
                      source="risk-engine"
                      freshness="live"
                      updated="12:00"
                      delta={{ dir: "down", text: "-$2.1k", tone: "good" }}
                    />
                    <KpiCard
                      label="Composite Risk Score"
                      value={risk.score}
                      source="risk-engine"
                      freshness="live"
                      updated="12:00"
                    />
                  </div>

                  {/* Linked accounts summary */}
                  <div style={{ marginTop: "20px" }}>
                    <div className="font-mono" style={{ fontSize: "11px", color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
                      Linked Accounts
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {accounts.map((acc) => (
                        <div
                          key={acc.id}
                          style={{
                            padding: "8px 14px",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--neutral-50)",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <CreditCard style={{ width: "13px", height: "13px", color: "var(--neutral-400)" }} />
                          <span style={{ fontSize: "12px", color: "var(--neutral-700)" }}>{acc.type}</span>
                          <span className="font-mono" style={{ fontSize: "11px", color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}>
                            {acc.balance}
                          </span>
                          <StatusBadge status={acc.status} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Relationships */}
                  <div style={{ marginTop: "20px" }}>
                    <div className="font-mono" style={{ fontSize: "11px", color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Link2 style={{ width: "11px", height: "11px" }} />
                      Related Entities
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0", border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden" }}>
                      {[
                        { name: "Primary Employer",   role: "Employer",    since: "2020" },
                        { name: "J. Doe (Spouse)",     role: "Joint Owner", since: "2022" },
                        { name: "Family Trust",        role: "Beneficiary", since: "2023" },
                      ].map((rel, i) => (
                        <div
                          key={rel.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--neutral-50)",
                            borderBottom: i < 2 ? "1px solid var(--border)" : "none",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "13px", color: "var(--neutral-900)" }}>{rel.name}</div>
                            <div className="font-mono" style={{ fontSize: "10px", color: "var(--neutral-400)" }}>
                              {rel.role} · since {rel.since}
                            </div>
                          </div>
                          <button
                            style={{
                              fontSize: "11px",
                              color: "var(--primary-500)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            view →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── ACCOUNTS TAB ── */}
            {activeTab === "accounts" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "18px 20px",
                      backgroundColor: "var(--card)",
                      display: "flex",
                      alignItems: "center",
                      gap: "20px",
                      borderLeft: `4px solid ${acc.status === "healthy" ? "#0D9488" : "#D97706"}`,
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "8px",
                        backgroundColor: acc.status === "healthy" ? "#CCFBF1" : "#FEF3C7",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <CreditCard style={{ width: "18px", height: "18px", color: acc.status === "healthy" ? "#0D9488" : "#D97706" }} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--neutral-900)" }}>
                          {acc.type} Account
                        </span>
                        <StatusBadge status={acc.status} />
                      </div>
                      <div className="font-mono" style={{ fontSize: "11px", color: "var(--neutral-400)" }}>
                        {acc.id} · Source: {acc.source} · Last transaction: {acc.lastTx}
                      </div>
                    </div>

                    <div
                      className="font-mono"
                      style={{
                        fontSize: "20px",
                        fontWeight: 700,
                        color: "var(--neutral-900)",
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: "-0.02em",
                        flexShrink: 0,
                      }}
                    >
                      {acc.balance}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── TRANSACTIONS TAB ── */}
            {activeTab === "transactions" && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
                      {["Date", "Description", "Amount", "Source", "Type", "Status"].map((col) => (
                        <th
                          key={col}
                          style={{
                            textAlign: "left",
                            padding: "10px 16px",
                            fontSize: "11px",
                            fontWeight: 500,
                            color: "var(--neutral-500)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            fontFamily: "var(--font-mono)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TRANSACTIONS_DATA.map((tx, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                        }}
                      >
                        <td className="font-mono" style={{ padding: "12px 16px", fontSize: "12px", color: "var(--neutral-500)", whiteSpace: "nowrap" }}>
                          {tx.date}
                        </td>
                        <td style={{ padding: "12px 16px", color: "var(--neutral-900)", fontWeight: 500 }}>
                          {tx.desc}
                        </td>
                        <td
                          className="font-mono"
                          style={{
                            padding: "12px 16px",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            color: tx.amount.startsWith("+") ? "#0D9488" : "var(--neutral-900)",
                          }}
                        >
                          {tx.amount}
                        </td>
                        <td className="font-mono" style={{ padding: "12px 16px", fontSize: "11px", color: "var(--neutral-400)", whiteSpace: "nowrap" }}>
                          {tx.source}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontFamily: "var(--font-mono)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              backgroundColor: tx.type === "Credit" ? "#CCFBF1" : "var(--neutral-100)",
                              color: tx.type === "Credit" ? "#0D9488" : "var(--neutral-500)",
                            }}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <StatusBadge status={tx.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── RISK HISTORY TAB ── */}
            {activeTab === "risk" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--neutral-900)" }}>
                      Risk Score — 12-Month Trend
                    </div>
                    <div className="font-mono" style={{ fontSize: "11px", color: "var(--neutral-400)", marginTop: "2px" }}>
                      Source: risk-engine · Updated: 12:00 today
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{
                        width: "24px",
                        height: "3px",
                        borderRadius: "2px",
                        backgroundColor: "var(--primary-500)",
                        display: "inline-block",
                      }}
                    />
                    <span className="font-mono" style={{ fontSize: "11px", color: "var(--neutral-500)" }}>
                      Risk score (0–100)
                    </span>
                  </div>
                </div>

                <div style={{ height: "280px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={riskHistory} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fontFamily: "var(--font-mono)", fill: "#9CA3AF" }}
                        axisLine={{ stroke: "#E5E7EB" }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fontFamily: "var(--font-mono)", fill: "#9CA3AF" }}
                        axisLine={false}
                        tickLine={false}
                        width={28}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0A2540",
                          border: "none",
                          borderRadius: "6px",
                          padding: "8px 12px",
                          fontSize: "12px",
                          fontFamily: "var(--font-mono)",
                          color: "#fff",
                        }}
                        formatter={(value) => [`${value}`, "Score"]}
                        labelStyle={{ color: "#6B9BCF", marginBottom: "2px" }}
                        cursor={{ stroke: "var(--primary-500)", strokeWidth: 1, strokeDasharray: "4 2" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#2D6A9F"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#2D6A9F", strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: "#2D6A9F", strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Summary stats below chart */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginTop: "20px" }}>
                  {[
                    { label: "Current",  value: riskHistory[riskHistory.length - 1].score.toString() },
                    { label: "12M High", value: Math.max(...riskHistory.map(d => d.score)).toString() },
                    { label: "12M Low",  value: Math.min(...riskHistory.map(d => d.score)).toString() },
                    { label: "Trend",    value: riskHistory[riskHistory.length - 1].score > riskHistory[0].score ? "Improving" : "Declining" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--neutral-50)",
                      }}
                    >
                      <div className="font-mono" style={{ fontSize: "10px", color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {stat.label}
                      </div>
                      <div
                        className="font-mono"
                        style={{
                          fontSize: "20px",
                          fontWeight: 700,
                          color: stat.label === "Trend"
                            ? (stat.value === "Improving" ? "#0D9488" : "#E11D48")
                            : "var(--neutral-900)",
                          marginTop: "4px",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </AppShell>
  );
}
