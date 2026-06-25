import { createFileRoute } from "@tanstack/react-router"
import { useState, useMemo } from "react"
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "@/components/AppShell"
import { StatusBadge } from "@/components/StatusBadge"
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import {
  Search,
  X,
  Star,
  MapPin,
  Phone,
  Mail,
  AlertTriangle,
  Activity,
  CreditCard,
  User2,
  Shield,
  ChevronRight,
  Download,
  TrendingUp,
  TrendingDown,
} from "lucide-react"

export const Route = createFileRoute("/customer-360")({
  component: Customer360,
})

// ─── Data ─────────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  {
    id: "CUS-88421",
    name: "Amara Diallo",
    initials: "AD",
    email: "amara.d@email.com",
    phone: "+234 801 234 5678",
    location: "Lagos, Nigeria",
    risk: "medium",
    riskScore: 54,
    consent: "active" as "active" | "pending",
    pd: "2.4%",
    lgd: "38%",
    ead: "$48,200",
    qualityScore: 94,
    accounts: [
      { id: "ACC-001", type: "Checking", balance: "$12,480", source: "Core Banking",  status: "healthy" as const, lastTx: "Jun 25" },
      { id: "ACC-002", type: "Savings",  balance: "$48,103", source: "Core Banking",  status: "healthy" as const, lastTx: "Jun 20" },
      { id: "ACC-003", type: "Loan",     balance: "$24,000", source: "Credit Bureau", status: "warning" as const, lastTx: "Jun 15" },
    ],
    transactions: [
      { id: "TX-1", date: "Jun 25", desc: "Salary credit",    amount: "+$3,200",  type: "Credit",   status: "completed" as const },
      { id: "TX-2", date: "Jun 24", desc: "Rent payment",     amount: "-$800",    type: "Debit",    status: "completed" as const },
      { id: "TX-3", date: "Jun 23", desc: "Mobile top-up",    amount: "-$15",     type: "Debit",    status: "completed" as const },
      { id: "TX-4", date: "Jun 22", desc: "Grocery store",    amount: "-$120",    type: "Debit",    status: "completed" as const },
      { id: "TX-5", date: "Jun 20", desc: "Savings transfer", amount: "-$500",    type: "Transfer", status: "completed" as const },
    ],
    riskHistory: [
      { m: "Jan", score: 65 }, { m: "Feb", score: 68 }, { m: "Mar", score: 61 },
      { m: "Apr", score: 70 }, { m: "May", score: 67 }, { m: "Jun", score: 54 },
    ],
  },
  {
    id: "CUS-77302",
    name: "Samuel Osei",
    initials: "SO",
    email: "samuel.o@email.com",
    phone: "+233 244 567 890",
    location: "Accra, Ghana",
    risk: "low",
    riskScore: 28,
    consent: "active" as "active" | "pending",
    pd: "0.8%",
    lgd: "22%",
    ead: "$12,500",
    qualityScore: 98,
    accounts: [
      { id: "ACC-004", type: "Current", balance: "$4,200",  source: "Core Banking", status: "healthy" as const, lastTx: "Jun 25" },
      { id: "ACC-005", type: "Savings", balance: "$18,000", source: "Core Banking", status: "healthy" as const, lastTx: "Jun 18" },
    ],
    transactions: [
      { id: "TX-6", date: "Jun 25", desc: "Consulting fee",   amount: "+$5,000", type: "Credit", status: "completed" as const },
      { id: "TX-7", date: "Jun 24", desc: "Electricity bill", amount: "-$45",    type: "Debit",  status: "completed" as const },
      { id: "TX-8", date: "Jun 22", desc: "Grocery",          amount: "-$80",    type: "Debit",  status: "completed" as const },
    ],
    riskHistory: [
      { m: "Jan", score: 32 }, { m: "Feb", score: 30 }, { m: "Mar", score: 28 },
      { m: "Apr", score: 31 }, { m: "May", score: 29 }, { m: "Jun", score: 28 },
    ],
  },
  {
    id: "CUS-94108",
    name: "Fatima Al-Rashid",
    initials: "FA",
    email: "fatima.ar@email.com",
    phone: "+212 661 234 567",
    location: "Casablanca, Morocco",
    risk: "high",
    riskScore: 78,
    consent: "pending" as "active" | "pending",
    pd: "6.2%",
    lgd: "55%",
    ead: "$92,100",
    qualityScore: 71,
    accounts: [
      { id: "ACC-006", type: "Business", balance: "$67,400", source: "Core Banking", status: "warning" as const, lastTx: "Jun 20" },
    ],
    transactions: [
      { id: "TX-9",  date: "Jun 20", desc: "International wire", amount: "-$45,000", type: "Transfer", status: "completed" as const },
      { id: "TX-10", date: "Jun 18", desc: "Business income",    amount: "+$88,000", type: "Credit",   status: "completed" as const },
      { id: "TX-11", date: "Jun 15", desc: "Supplier payment",   amount: "-$12,000", type: "Debit",    status: "completed" as const },
    ],
    riskHistory: [
      { m: "Jan", score: 62 }, { m: "Feb", score: 65 }, { m: "Mar", score: 70 },
      { m: "Apr", score: 72 }, { m: "May", score: 75 }, { m: "Jun", score: 78 },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(score: number): string {
  if (score <= 40) return "#0D9488"
  if (score <= 65) return "#D97706"
  return "#E11D48"
}

function riskBg(score: number): string {
  if (score <= 40) return "#CCFBF1"
  if (score <= 65) return "#FEF3C7"
  return "#FFE4E6"
}

function riskLabel(risk: string): string {
  if (risk === "low")    return "Low Risk"
  if (risk === "medium") return "Medium Risk"
  return "High Risk"
}

function qualityBarColor(score: number): string {
  if (score >= 90) return "#0D9488"
  if (score >= 70) return "#D97706"
  return "#E11D48"
}

// ─── Custom tooltip for risk chart ────────────────────────────────────────────

function RiskTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const score = payload[0].value
  return (
    <div style={{
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "6px",
      padding: "8px 12px",
      fontSize: "12px",
      fontFamily: "monospace",
      color: "var(--neutral-900)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    }}>
      <div style={{ color: "var(--neutral-500)", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontWeight: 700, color: riskColor(score) }}>Score: {score}</div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

function Customer360() {
  const [selectedId, setSelectedId]           = useState("CUS-88421")
  const [activeTab, setActiveTab]             = useState<"overview" | "accounts" | "transactions" | "risk">("overview")
  const [watchlist, setWatchlist]             = useState<Set<string>>(new Set())
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchQuery, setSearchQuery]         = useState("")

  const selected = useMemo(() => CUSTOMERS.find(c => c.id === selectedId)!, [selectedId])
  const isOnWatchlist = watchlist.has(selectedId)

  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return CUSTOMERS
    return CUSTOMERS.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    )
  }, [searchQuery])

  function toggleWatchlist() {
    setWatchlist(prev => {
      const next = new Set(prev)
      if (next.has(selectedId)) next.delete(selectedId)
      else next.add(selectedId)
      return next
    })
  }

  const TABS: { key: "overview" | "accounts" | "transactions" | "risk"; label: string; icon: typeof Activity }[] = [
    { key: "overview",     label: "Overview",     icon: User2      },
    { key: "accounts",     label: "Accounts",     icon: CreditCard },
    { key: "transactions", label: "Transactions", icon: Activity   },
    { key: "risk",         label: "Risk History", icon: TrendingUp },
  ]

  const riskLineColor = riskColor(selected.riskScore)

  return (
    <AppShell
      title="Customer 360"
      breadcrumb="GOVERN › CUSTOMER 360"
      primaryAction={
        <PrimaryButton
          icon={<Search style={{ height: "15px", width: "15px" }} />}
          onClick={() => setShowSearchModal(true)}
        >
          Search Customer
        </PrimaryButton>
      }
    >

      {/* ── Customer selector chips ── */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {CUSTOMERS.map(c => {
          const active = c.id === selectedId
          return (
            <button
              key={c.id}
              onClick={() => { setSelectedId(c.id); setActiveTab("overview") }}
              style={{
                display: "inline-flex", alignItems: "center", gap: "10px",
                padding: "8px 14px", borderRadius: "8px",
                border: `1.5px solid ${active ? "var(--primary-500)" : "var(--border)"}`,
                backgroundColor: active ? "var(--primary-50)" : "var(--card)",
                cursor: "pointer",
                transition: "border-color 0.15s, background-color 0.15s",
              }}
            >
              <div style={{
                height: "28px", width: "28px", borderRadius: "50%", flexShrink: 0,
                backgroundColor: active ? "var(--primary-500)" : "var(--neutral-200)",
                color: active ? "#fff" : "var(--neutral-600)",
                display: "grid", placeItems: "center",
                fontSize: "11px", fontWeight: 700,
              }}>
                {c.initials}
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{
                  fontSize: "13px", fontWeight: 600, lineHeight: 1.2,
                  color: active ? "var(--primary-700)" : "var(--neutral-900)",
                }}>
                  {c.name}
                </div>
                <div style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--neutral-400)", marginTop: "1px" }}>
                  {c.id}
                </div>
              </div>
              <span style={{
                fontSize: "10px", fontFamily: "monospace", fontWeight: 700,
                padding: "2px 8px", borderRadius: "99px",
                color: riskColor(c.riskScore),
                backgroundColor: riskBg(c.riskScore),
                letterSpacing: "0.03em",
                textTransform: "uppercase" as const,
              }}>
                {c.risk}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Selected customer header card ── */}
      <SectionCard>
        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Left: identity */}
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", flex: "1 1 320px" }}>
            <div style={{
              height: "64px", width: "64px", borderRadius: "50%", flexShrink: 0,
              backgroundColor: "var(--primary-500)", color: "#fff",
              display: "grid", placeItems: "center",
              fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em",
            }}>
              {selected.initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{
                fontSize: "20px", fontWeight: 700, color: "var(--neutral-900)",
                lineHeight: 1.2, margin: "0 0 4px",
              }}>
                {selected.name}
              </h2>
              <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--neutral-400)", marginBottom: "10px" }}>
                {selected.id}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--neutral-600)" }}>
                  <Mail style={{ height: "13px", width: "13px", flexShrink: 0, color: "var(--neutral-400)" }} />
                  {selected.email}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--neutral-600)" }}>
                  <Phone style={{ height: "13px", width: "13px", flexShrink: 0, color: "var(--neutral-400)" }} />
                  {selected.phone}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--neutral-600)" }}>
                  <MapPin style={{ height: "13px", width: "13px", flexShrink: 0, color: "var(--neutral-400)" }} />
                  {selected.location}
                </div>
              </div>
            </div>
          </div>

          {/* Right: risk score + actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-end", flexShrink: 0 }}>
            {/* Risk score pill */}
            <div style={{
              display: "inline-flex", flexDirection: "column", alignItems: "center",
              padding: "12px 24px", borderRadius: "10px",
              backgroundColor: riskBg(selected.riskScore),
              border: `1.5px solid ${riskColor(selected.riskScore)}33`,
            }}>
              <div style={{
                fontSize: "36px", fontWeight: 800,
                color: riskColor(selected.riskScore),
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}>
                {selected.riskScore}
              </div>
              <div style={{
                fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase" as const,
                letterSpacing: "0.05em", color: riskColor(selected.riskScore),
                marginTop: "3px", fontWeight: 600,
              }}>
                {riskLabel(selected.risk)}
              </div>
            </div>

            {/* Consent row */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Shield style={{ height: "13px", width: "13px", color: "var(--neutral-400)" }} />
                <span style={{ fontSize: "12px", color: "var(--neutral-500)", fontFamily: "monospace" }}>Consent:</span>
                <StatusBadge status={selected.consent === "active" ? "active" : "queued"}>
                  {selected.consent === "active" ? "Active" : "Pending"}
                </StatusBadge>
              </div>
              <button
                onClick={() => alert("Consent revoke request sent")}
                style={{
                  height: "28px", padding: "0 10px", fontSize: "11px", fontFamily: "monospace",
                  borderRadius: "5px", border: "1px solid var(--border)",
                  backgroundColor: "var(--card)", color: "var(--neutral-600)", cursor: "pointer",
                  textTransform: "uppercase" as const, letterSpacing: "0.04em",
                }}
              >
                Revoke
              </button>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={toggleWatchlist}
                style={{
                  height: "32px", padding: "0 12px",
                  display: "inline-flex", alignItems: "center", gap: "5px",
                  fontSize: "12px", fontWeight: 600, fontFamily: "monospace",
                  borderRadius: "6px",
                  border: `1px solid ${isOnWatchlist ? "#D97706" : "var(--border)"}`,
                  backgroundColor: isOnWatchlist ? "var(--warn-bg)" : "var(--card)",
                  color: isOnWatchlist ? "var(--warn)" : "var(--neutral-600)",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <Star style={{
                  height: "13px", width: "13px",
                  fill: isOnWatchlist ? "var(--warn)" : "none",
                  stroke: isOnWatchlist ? "var(--warn)" : "currentColor",
                }} />
                {isOnWatchlist ? "Watchlisted" : "Add to Watchlist"}
              </button>
              <button
                onClick={() => alert(`Stress test queued for ${selected.name}`)}
                style={{
                  height: "32px", padding: "0 12px",
                  display: "inline-flex", alignItems: "center", gap: "5px",
                  fontSize: "12px", fontWeight: 600, fontFamily: "monospace",
                  borderRadius: "6px", border: "1px solid var(--border)",
                  backgroundColor: "var(--card)", color: "var(--neutral-600)", cursor: "pointer",
                }}
              >
                <Activity style={{ height: "13px", width: "13px" }} />
                Run Stress Test
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Tab bar ── */}
      <div style={{
        display: "flex", gap: "0", marginTop: "16px",
        borderBottom: "1px solid var(--border)", marginBottom: "16px",
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                height: "40px", padding: "0 16px",
                fontSize: "13px",
                fontWeight: active ? 600 : 400,
                color: active ? "var(--primary-500)" : "var(--neutral-500)",
                backgroundColor: "transparent", border: "none",
                borderBottom: active ? "2px solid var(--primary-500)" : "2px solid transparent",
                cursor: "pointer", transition: "color 0.15s",
                marginBottom: "-1px",
              }}
            >
              <Icon style={{ height: "14px", width: "14px" }} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ─────────────────── OVERVIEW TAB ─────────────────── */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px" }}>
          {/* Left col: identity card */}
          <SectionCard title="Identity & Data Quality">
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Data quality bar */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--neutral-500)" }}>Data Quality Score</span>
                  <span style={{
                    fontSize: "13px", fontWeight: 700, fontFamily: "monospace",
                    fontVariantNumeric: "tabular-nums",
                    color: qualityBarColor(selected.qualityScore),
                  }}>
                    {selected.qualityScore}%
                  </span>
                </div>
                <div style={{ height: "8px", borderRadius: "4px", backgroundColor: "var(--neutral-100)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${selected.qualityScore}%`,
                    backgroundColor: qualityBarColor(selected.qualityScore),
                    borderRadius: "4px", transition: "width 0.4s ease",
                  }} />
                </div>
                <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--neutral-400)", marginTop: "5px" }}>
                  {selected.qualityScore >= 90
                    ? "Excellent — all required fields complete"
                    : selected.qualityScore >= 70
                    ? "Good — minor gaps in enrichment data"
                    : "Needs attention — missing critical fields"}
                </div>
              </div>

              {/* Consent block */}
              <div style={{ padding: "12px", borderRadius: "6px", backgroundColor: "var(--neutral-50)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--neutral-400)", marginBottom: "8px" }}>
                  Consent Status
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <StatusBadge status={selected.consent === "active" ? "active" : "queued"}>
                    {selected.consent === "active" ? "Active" : "Pending"}
                  </StatusBadge>
                  <span style={{ fontSize: "12px", color: "var(--neutral-500)" }}>
                    {selected.consent === "active" ? "All data processing authorised" : "Awaiting customer confirmation"}
                  </span>
                </div>
              </div>

              {/* Profile fields */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { label: "Customer ID", value: selected.id,                       mono: true  },
                  { label: "Email",       value: selected.email,                     mono: false },
                  { label: "Phone",       value: selected.phone,                     mono: true  },
                  { label: "Location",    value: selected.location,                  mono: false },
                  { label: "Accounts",    value: `${selected.accounts.length} linked`, mono: true  },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "12px" }}>
                    <span style={{ color: "var(--neutral-400)", flexShrink: 0 }}>{row.label}</span>
                    <span style={{
                      color: "var(--neutral-800)", fontWeight: 500, textAlign: "right",
                      fontFamily: row.mono ? "monospace" : undefined,
                      fontVariantNumeric: row.mono ? "tabular-nums" : undefined,
                    }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* Right col: 4 credit metric cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", alignContent: "start" }}>
            {[
              {
                abbr: "PD",
                label: "Probability of Default",
                value: selected.pd,
                context: "12-month horizon",
                icon: <TrendingUp style={{ height: "16px", width: "16px" }} />,
                severityColor: parseFloat(selected.pd) >= 5 ? "#E11D48" : parseFloat(selected.pd) >= 2 ? "#D97706" : "#0D9488",
                severityBg:    parseFloat(selected.pd) >= 5 ? "#FFE4E6" : parseFloat(selected.pd) >= 2 ? "#FEF3C7" : "#CCFBF1",
              },
              {
                abbr: "LGD",
                label: "Loss Given Default",
                value: selected.lgd,
                context: "Recovery assumption",
                icon: <TrendingDown style={{ height: "16px", width: "16px" }} />,
                severityColor: parseFloat(selected.lgd) >= 50 ? "#E11D48" : parseFloat(selected.lgd) >= 35 ? "#D97706" : "#0D9488",
                severityBg:    parseFloat(selected.lgd) >= 50 ? "#FFE4E6" : parseFloat(selected.lgd) >= 35 ? "#FEF3C7" : "#CCFBF1",
              },
              {
                abbr: "EAD",
                label: "Exposure at Default",
                value: selected.ead,
                context: "Total credit exposure",
                icon: <CreditCard style={{ height: "16px", width: "16px" }} />,
                severityColor: "var(--primary-500)",
                severityBg: "var(--primary-50)",
              },
              {
                abbr: "SCORE",
                label: "Risk Score",
                value: String(selected.riskScore),
                context: riskLabel(selected.risk),
                icon: <AlertTriangle style={{ height: "16px", width: "16px" }} />,
                severityColor: riskColor(selected.riskScore),
                severityBg: riskBg(selected.riskScore),
              },
            ].map(metric => (
              <div key={metric.abbr} style={{
                padding: "18px 20px", borderRadius: "8px",
                backgroundColor: "var(--card)", border: "1px solid var(--border)",
                display: "flex", flexDirection: "column", gap: "4px",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize: "10px", fontFamily: "monospace", textTransform: "uppercase" as const,
                    letterSpacing: "0.08em", color: "var(--neutral-400)", fontWeight: 600,
                  }}>
                    {metric.abbr}
                  </span>
                  <span style={{ color: metric.severityColor }}>{metric.icon}</span>
                </div>
                <div style={{
                  fontSize: "28px", fontWeight: 800,
                  color: metric.severityColor,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.1, letterSpacing: "-0.02em",
                }}>
                  {metric.value}
                </div>
                <div style={{ fontSize: "12px", color: "var(--neutral-500)" }}>{metric.label}</div>
                <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--neutral-400)" }}>{metric.context}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────── ACCOUNTS TAB ─────────────────── */}
      {activeTab === "accounts" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
          {selected.accounts.map(acc => (
            <div key={acc.id} style={{
              padding: "20px", borderRadius: "8px",
              backgroundColor: "var(--card)", border: "1px solid var(--border)",
              display: "flex", flexDirection: "column", gap: "12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{
                  fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase" as const,
                  letterSpacing: "0.07em", fontWeight: 700,
                  padding: "3px 10px", borderRadius: "4px",
                  backgroundColor: "var(--primary-50)", color: "var(--primary-700)",
                }}>
                  {acc.type}
                </span>
                <StatusBadge status={acc.status} />
              </div>

              <div>
                <div style={{ fontSize: "11px", color: "var(--neutral-400)", marginBottom: "3px" }}>Balance</div>
                <div style={{
                  fontSize: "26px", fontWeight: 800, color: "var(--neutral-900)",
                  fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1,
                }}>
                  {acc.balance}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
                {[
                  { label: "Account ID",      value: acc.id,      mono: true  },
                  { label: "Data source",     value: acc.source,  mono: false },
                  { label: "Last transaction", value: acc.lastTx, mono: true  },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "var(--neutral-400)" }}>{row.label}</span>
                    <span style={{ fontFamily: row.mono ? "monospace" : undefined, color: "var(--neutral-700)" }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setActiveTab("transactions")}
                style={{
                  height: "32px", width: "100%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "5px",
                  fontSize: "12px", fontWeight: 600, fontFamily: "monospace",
                  borderRadius: "6px", border: "1px solid var(--primary-300)",
                  backgroundColor: "var(--primary-50)", color: "var(--primary-700)",
                  cursor: "pointer", transition: "background-color 0.15s",
                }}
              >
                View Transactions
                <ChevronRight style={{ height: "13px", width: "13px" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─────────────────── TRANSACTIONS TAB ─────────────────── */}
      {activeTab === "transactions" && (
        <SectionCard
          title="Transaction History"
          noPad
          action={
            <button
              onClick={() => alert("Exporting transactions")}
              style={{
                height: "28px", padding: "0 10px",
                display: "inline-flex", alignItems: "center", gap: "5px",
                fontSize: "12px", fontFamily: "monospace",
                borderRadius: "5px", border: "1px solid var(--border)",
                backgroundColor: "var(--card)", color: "var(--neutral-600)", cursor: "pointer",
              }}
            >
              <Download style={{ height: "12px", width: "12px" }} />
              Export CSV
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
                <tr>
                  {["Date", "Description", "Amount", "Type", "Status"].map(col => (
                    <th
                      key={col}
                      className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--neutral-500)", whiteSpace: "nowrap" }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.transactions.map(tx => (
                  <tr
                    key={tx.id}
                    className="hover:bg-[var(--neutral-50)] cursor-pointer"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td className="px-4 py-3" style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--neutral-500)", whiteSpace: "nowrap" }}>
                      {tx.date}
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: "13px", color: "var(--neutral-800)", fontWeight: 500 }}>
                      {tx.desc}
                    </td>
                    <td className="px-4 py-3" style={{
                      fontFamily: "monospace", fontSize: "13px", fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: tx.amount.startsWith("+") ? "#0D9488" : "#E11D48",
                      whiteSpace: "nowrap",
                    }}>
                      {tx.amount}
                    </td>
                    <td className="px-4 py-3">
                      <span style={{
                        fontSize: "11px", fontFamily: "monospace",
                        padding: "2px 8px", borderRadius: "4px",
                        backgroundColor:
                          tx.type === "Credit"   ? "#CCFBF1"
                          : tx.type === "Transfer" ? "var(--ai-bg)"
                          : "var(--neutral-100)",
                        color:
                          tx.type === "Credit"   ? "#0D9488"
                          : tx.type === "Transfer" ? "var(--ai)"
                          : "var(--neutral-600)",
                      }}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={tx.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{
            padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
            borderTop: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--neutral-400)" }}>
              {selected.transactions.length} transactions · {selected.id}
            </span>
          </div>
        </SectionCard>
      )}

      {/* ─────────────────── RISK HISTORY TAB ─────────────────── */}
      {activeTab === "risk" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <SectionCard title="Risk Score Trajectory — 6 Months">
            <div style={{ height: "240px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={selected.riskHistory} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="m"
                    tick={{ fontSize: 11, fontFamily: "monospace", fill: "var(--neutral-500)" }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fontFamily: "monospace", fill: "var(--neutral-500)" }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip content={<RiskTooltip />} />
                  <ReferenceLine y={40} stroke="#0D9488" strokeDasharray="4 3" strokeOpacity={0.4} />
                  <ReferenceLine y={65} stroke="#D97706" strokeDasharray="4 3" strokeOpacity={0.4} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={riskLineColor}
                    strokeWidth={2.5}
                    dot={{ fill: riskLineColor, r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--card)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: "16px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
              {[
                { label: "Low (0–40)",    color: "#0D9488" },
                { label: "Medium (41–65)", color: "#D97706" },
                { label: "High (66–100)", color: "#E11D48" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ height: "8px", width: "8px", borderRadius: "2px", backgroundColor: l.color, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--neutral-500)" }}>{l.label}</span>
                </div>
              ))}
              <span style={{ marginLeft: "auto", fontSize: "11px", fontFamily: "monospace", color: "var(--neutral-400)" }}>
                Dashed lines: risk tier boundaries
              </span>
            </div>
          </SectionCard>

          {/* Risk factors */}
          <SectionCard title="Contributing Risk Factors">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                {
                  factor: "Payment behavior",
                  detail: "2 late payments in past 6 months",
                  weight: "High",
                  severity: selected.riskScore >= 65 ? "fail" : selected.riskScore >= 41 ? "warn" : "ok",
                },
                {
                  factor: "Credit utilization",
                  detail: `Current utilization ${selected.riskScore > 60 ? "87%" : selected.riskScore > 40 ? "54%" : "22%"} of available limit`,
                  weight: "High",
                  severity: selected.riskScore >= 65 ? "fail" : selected.riskScore >= 41 ? "warn" : "ok",
                },
                {
                  factor: "Account age",
                  detail: "Oldest account 3 years 4 months",
                  weight: "Medium",
                  severity: "ok",
                },
                {
                  factor: "Inquiry recency",
                  detail: `${selected.riskScore > 60 ? "4" : "1"} hard inquiries in last 12 months`,
                  weight: "Low",
                  severity: selected.riskScore > 60 ? "warn" : "ok",
                },
                {
                  factor: "Income stability",
                  detail: "Regular salary deposits detected",
                  weight: "Medium",
                  severity: "ok",
                },
              ].map(row => {
                const sColor = row.severity === "fail" ? "#E11D48" : row.severity === "warn" ? "#D97706" : "#0D9488"
                const sBg    = row.severity === "fail" ? "#FFE4E6" : row.severity === "warn" ? "#FEF3C7" : "#CCFBF1"
                return (
                  <div key={row.factor} style={{
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px",
                    padding: "12px 14px", borderRadius: "6px",
                    backgroundColor: "var(--neutral-50)", border: "1px solid var(--border)",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--neutral-800)", marginBottom: "2px" }}>{row.factor}</div>
                      <div style={{ fontSize: "12px", color: "var(--neutral-500)" }}>{row.detail}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                      <span style={{
                        fontSize: "10px", fontFamily: "monospace", fontWeight: 700,
                        padding: "2px 8px", borderRadius: "4px",
                        backgroundColor: sBg, color: sColor,
                        textTransform: "uppercase" as const, letterSpacing: "0.04em",
                      }}>
                        {row.severity === "fail" ? "High" : row.severity === "warn" ? "Moderate" : "Low"}
                      </span>
                      <span style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--neutral-400)", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                        {row.weight} weight
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ─────────────────── SEARCH MODAL ─────────────────── */}
      {showSearchModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { setShowSearchModal(false); setSearchQuery("") }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full mx-4"
            style={{ maxWidth: "480px" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "10px" }}>
              <Search style={{ height: "16px", width: "16px", color: "var(--neutral-400)", flexShrink: 0 }} />
              <input
                type="text"
                autoFocus
                placeholder="Search by name, ID, email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  flex: 1, border: "none", outline: "none",
                  fontSize: "14px", color: "var(--neutral-900)",
                  backgroundColor: "transparent",
                  caretColor: "var(--primary-500)",
                }}
              />
              <button
                onClick={() => { setShowSearchModal(false); setSearchQuery("") }}
                style={{
                  height: "28px", width: "28px", display: "grid", placeItems: "center",
                  borderRadius: "5px", border: "1px solid var(--border)",
                  backgroundColor: "transparent", color: "var(--neutral-400)", cursor: "pointer",
                }}
              >
                <X style={{ height: "14px", width: "14px" }} />
              </button>
            </div>

            {/* Results list */}
            <div style={{ maxHeight: "320px", overflowY: "auto" }}>
              {searchResults.length === 0 ? (
                <div style={{ padding: "24px 20px", textAlign: "center", fontSize: "13px", fontFamily: "monospace", color: "var(--neutral-400)" }}>
                  No customers match that query.
                </div>
              ) : (
                searchResults.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedId(c.id)
                      setActiveTab("overview")
                      setShowSearchModal(false)
                      setSearchQuery("")
                    }}
                    style={{
                      width: "100%", padding: "12px 20px",
                      display: "flex", alignItems: "center", gap: "12px",
                      backgroundColor: "transparent", border: "none",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer", textAlign: "left",
                      transition: "background-color 0.1s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-50)" }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent" }}
                  >
                    <div style={{
                      height: "36px", width: "36px", borderRadius: "50%", flexShrink: 0,
                      backgroundColor: "var(--primary-500)", color: "#fff",
                      display: "grid", placeItems: "center",
                      fontSize: "13px", fontWeight: 700,
                    }}>
                      {c.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--neutral-900)" }}>{c.name}</div>
                      <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--neutral-400)" }}>
                        {c.id} · {c.email}
                      </div>
                    </div>
                    <span style={{
                      fontSize: "10px", fontFamily: "monospace", fontWeight: 700,
                      textTransform: "uppercase" as const,
                      padding: "2px 8px", borderRadius: "99px",
                      color: riskColor(c.riskScore),
                      backgroundColor: riskBg(c.riskScore),
                    }}>
                      {c.risk}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--neutral-400)" }}>
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
              </span>
              <SecondaryButton onClick={() => { setShowSearchModal(false); setSearchQuery("") }}>
                Close
              </SecondaryButton>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  )
}
