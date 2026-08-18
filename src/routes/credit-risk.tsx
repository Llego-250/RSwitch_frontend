import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  PrimaryButton,
  SecondaryButton,
  FilterChip,
  SectionCard,
} from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Eye, Plus, Star, X } from "lucide-react";

export const Route = createFileRoute("/credit-risk")({
  component: CreditRiskDashboard,
});

const riskDist = [
  { range: "0–20", count: 1240 },
  { range: "21–40", count: 3820 },
  { range: "41–60", count: 2940 },
  { range: "61–80", count: 1180 },
  { range: "81–100", count: 340 },
];

const DIST_COLORS = ["#0D9488", "#0D9488", "#D97706", "#E11D48", "#E11D48"];

const sectorData = [
  { name: "Retail", v: 38 },
  { name: "SME", v: 28 },
  { name: "Corporate", v: 18 },
  { name: "Agriculture", v: 10 },
  { name: "Other", v: 6 },
];

const SECTOR_COLORS = ["#2D6A9F", "#0D9488", "#7C3AED", "#D97706", "#9CA3AF"];

type Borrower = {
  id: string;
  name: string;
  sector: string;
  exposure: string;
  pd: string;
  lgd: string;
  ead: string;
  score: number;
  watchlist: boolean;
};

const BORROWERS: Borrower[] = [
  { id: "B-8821", name: "Apex Manufacturing", sector: "Corporate", exposure: "$4.2M", pd: "1.2%", lgd: "42%", ead: "$3.8M", score: 28, watchlist: false },
  { id: "B-7703", name: "Sunrise Farm Coop", sector: "Agriculture", exposure: "$820K", pd: "3.8%", lgd: "55%", ead: "$780K", score: 61, watchlist: true },
  { id: "B-9102", name: "Metro Retail Ltd", sector: "Retail", exposure: "$1.4M", pd: "2.1%", lgd: "38%", ead: "$1.2M", score: 44, watchlist: false },
  { id: "B-6614", name: "TechStart Kenya", sector: "SME", exposure: "$340K", pd: "6.2%", lgd: "65%", ead: "$310K", score: 74, watchlist: true },
  { id: "B-5501", name: "Kigali Properties", sector: "Real Estate", exposure: "$2.8M", pd: "1.8%", lgd: "35%", ead: "$2.6M", score: 33, watchlist: false },
  { id: "B-4490", name: "Pan-Africa Logistics", sector: "Corporate", exposure: "$6.1M", pd: "0.9%", lgd: "28%", ead: "$5.8M", score: 18, watchlist: false },
  { id: "B-3322", name: "Ubuntu Foods Ltd", sector: "SME", exposure: "$210K", pd: "8.4%", lgd: "72%", ead: "$195K", score: 82, watchlist: true },
  { id: "B-2211", name: "East Coast Fishing", sector: "Agriculture", exposure: "$480K", pd: "4.5%", lgd: "60%", ead: "$450K", score: 67, watchlist: false },
];

function scoreColor(score: number): string {
  if (score <= 40) return "var(--ok)";
  if (score <= 60) return "var(--warn)";
  return "var(--fail)";
}

function scoreBg(score: number): string {
  if (score <= 40) return "var(--ok-bg)";
  if (score <= 60) return "var(--warn-bg)";
  return "var(--fail-bg)";
}

const SECTORS = ["All Sectors", "Retail", "SME", "Corporate", "Agriculture", "Real Estate", "Other"];
const RISK_RANGES = ["All Risk", "Low (0–40)", "Medium (41–60)", "High (61–100)"];

function BorrowerDrawer({
  borrower,
  onClose,
}: {
  borrower: Borrower;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.35)",
          zIndex: 40,
        }}
      />
      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "400px",
          maxWidth: "90vw",
          backgroundColor: "var(--card)",
          borderLeft: "1px solid var(--border)",
          zIndex: 50,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--neutral-400)",
                marginBottom: "4px",
              }}
            >
              Borrower Detail
            </div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--neutral-900)", lineHeight: 1.2 }}>
              {borrower.name}
            </div>
            <div style={{ fontSize: "13px", color: "var(--neutral-500)", marginTop: "2px", fontFamily: "monospace" }}>
              {borrower.id} · {borrower.sector}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
              height: "32px",
              width: "32px",
              display: "grid",
              placeItems: "center",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              backgroundColor: "transparent",
              color: "var(--neutral-500)",
              cursor: "pointer",
            }}
          >
            <X style={{ height: "15px", width: "15px" }} />
          </button>
        </div>

        {/* Risk score prominent display */}
        <div
          style={{
            margin: "20px 24px 0",
            padding: "16px 20px",
            borderRadius: "8px",
            backgroundColor: scoreBg(borrower.score),
            border: `1px solid ${scoreColor(borrower.score)}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--neutral-500)" }}>
              Risk Score
            </div>
            <div
              style={{
                fontSize: "40px",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: scoreColor(borrower.score),
                lineHeight: 1,
                marginTop: "4px",
              }}
            >
              {borrower.score}
            </div>
            <div style={{ fontSize: "12px", color: "var(--neutral-500)", marginTop: "4px" }}>
              {borrower.score <= 40 ? "Low Risk" : borrower.score <= 60 ? "Medium Risk" : "High Risk"}
            </div>
          </div>
          {borrower.watchlist && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                backgroundColor: "#FEF3C7",
                border: "1px solid #D97706",
                color: "#D97706",
                fontSize: "12px",
                fontWeight: 600,
                fontFamily: "monospace",
              }}
            >
              <Star style={{ height: "13px", width: "13px", fill: "#D97706" }} />
              WATCHLIST
            </div>
          )}
        </div>

        {/* Metrics grid */}
        <div style={{ padding: "20px 24px" }}>
          <div
            style={{
              fontSize: "11px",
              fontFamily: "monospace",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--neutral-400)",
              marginBottom: "12px",
            }}
          >
            Credit Metrics
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
            }}
          >
            {[
              { label: "Exposure", value: borrower.exposure },
              { label: "EAD", value: borrower.ead },
              { label: "Probability of Default", value: borrower.pd },
              { label: "Loss Given Default", value: borrower.lgd },
            ].map((m) => (
              <div
                key={m.label}
                style={{
                  padding: "12px 14px",
                  borderRadius: "6px",
                  backgroundColor: "var(--neutral-50)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--neutral-500)",
                    marginBottom: "4px",
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--neutral-900)",
                    lineHeight: 1,
                  }}
                >
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk score bar */}
        <div style={{ padding: "0 24px 20px" }}>
          <div
            style={{
              fontSize: "11px",
              fontFamily: "monospace",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--neutral-400)",
              marginBottom: "10px",
            }}
          >
            Score Spectrum
          </div>
          <div style={{ position: "relative", height: "12px", borderRadius: "6px", overflow: "hidden", backgroundColor: "var(--neutral-100)" }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to right, #0D9488 0%, #0D9488 40%, #D97706 40%, #D97706 60%, #E11D48 60%, #E11D48 100%)",
                opacity: 0.25,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: `${borrower.score}%`,
                background: scoreColor(borrower.score),
                borderRadius: "6px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
            <span style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--neutral-400)" }}>0</span>
            <span style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--neutral-400)" }}>100</span>
          </div>
        </div>

        {/* Sector tag */}
        <div style={{ padding: "0 24px 24px" }}>
          <div
            style={{
              fontSize: "11px",
              fontFamily: "monospace",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--neutral-400)",
              marginBottom: "10px",
            }}
          >
            Classification
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "12px",
                fontFamily: "monospace",
                padding: "4px 10px",
                borderRadius: "4px",
                backgroundColor: "var(--info-bg)",
                color: "var(--info)",
                border: "1px solid var(--info-bg)",
              }}
            >
              {borrower.sector}
            </span>
            {borrower.watchlist && (
              <span
                style={{
                  fontSize: "12px",
                  fontFamily: "monospace",
                  padding: "4px 10px",
                  borderRadius: "4px",
                  backgroundColor: "var(--warn-bg)",
                  color: "var(--warn)",
                  border: "1px solid var(--warn-bg)",
                }}
              >
                Watchlist
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Custom tooltip for bar chart
function RiskDistTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "8px 12px",
        fontSize: "12px",
        fontFamily: "monospace",
        color: "var(--neutral-900)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ color: "var(--neutral-500)", marginBottom: "2px" }}>Score {label}</div>
      <div style={{ fontWeight: 700 }}>{payload[0].value.toLocaleString()} borrowers</div>
    </div>
  );
}

// Custom tooltip for pie chart
function SectorTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "8px 12px",
        fontSize: "12px",
        fontFamily: "monospace",
        color: "var(--neutral-900)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 700 }}>{payload[0].name}</div>
      <div style={{ color: "var(--neutral-500)" }}>{payload[0].value}% of portfolio</div>
    </div>
  );
}

function CreditRiskDashboard() {
  const { role } = useRole();
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
  const [riskFilter, setRiskFilter] = useState("All Risk");
  const [sectorFilter, setSectorFilter] = useState("All Sectors");
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  const filteredBorrowers = BORROWERS.filter((b) => {
    if (watchlistOnly && !b.watchlist) return false;
    if (sectorFilter !== "All Sectors" && b.sector !== sectorFilter) return false;
    if (riskFilter === "Low (0–40)" && b.score > 40) return false;
    if (riskFilter === "Medium (41–60)" && (b.score < 41 || b.score > 60)) return false;
    if (riskFilter === "High (61–100)" && b.score < 61) return false;
    return true;
  });

  return (
    <AppShell
      title="Credit Risk Dashboard"
      subtitle="Portfolio concentration, probability of default (PD) scoring, and borrower watchlist"
      breadcrumb="DECIDE › CREDIT RISK"
      primaryAction={
        <PrimaryButton icon={<Download style={{ height: "15px", width: "15px" }} />}>
          Export Report
        </PrimaryButton>
      }
      toolbar={
        <>
          <FilterChip label="Portfolio" value="All Portfolios" />
          <FilterChip label="Period" value="Q2 2026" />
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                height: "7px",
                width: "7px",
                borderRadius: "50%",
                backgroundColor: "var(--ok)",
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "12px",
                color: "#526174",
              }}
            >
              live · model v2.3
            </span>
          </div>
        </>
      }
    >
      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "20px" }}>
        <KpiCard
          label="Total portfolio exposure"
          value="$2.84B"
          delta={{ dir: "up", text: "+$120M", tone: "bad" }}
          context="vs. prior quarter"
          freshness="live"
        />
        <KpiCard
          label="Weighted average PD"
          value="1.9%"
          delta={{ dir: "down", text: "-0.1pp", tone: "good" }}
          context="probability of default"
          freshness="live"
        />
        <KpiCard
          label="Watchlist borrowers"
          value="47"
          delta={{ dir: "up", text: "+3", tone: "bad" }}
          context="requiring review"
          freshness="live"
        />
        <KpiCard
          label="Stress test pass rate"
          value="92%"
          delta={{ dir: "up", text: "+2%", tone: "good" }}
          context="Basel III scenario"
          freshness="live"
        />
      </div>

      {/* Charts Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        {/* Risk Score Distribution */}
        <SectionCard title="Risk Score Distribution">
          <div style={{ height: "220px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskDist} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 11, fontFamily: "monospace", fill: "var(--neutral-500)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: "monospace", fill: "var(--neutral-500)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                />
                <Tooltip content={<RiskDistTooltip />} cursor={{ fill: "var(--neutral-100)" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {riskDist.map((_, i) => (
                    <Cell key={i} fill={DIST_COLORS[i]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{
              display: "flex",
              gap: "16px",
              marginTop: "12px",
              paddingTop: "12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            {[
              { label: "Low (0–40)", color: "var(--ok)" },
              { label: "Medium (41–60)", color: "var(--warn)" },
              { label: "High (61–100)", color: "var(--fail)" },
            ].map((l) => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span
                  style={{ height: "8px", width: "8px", borderRadius: "2px", backgroundColor: l.color, display: "inline-block", flexShrink: 0 }}
                />
                <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--neutral-500)" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Sector Exposure */}
        <SectionCard title="Sector Exposure">
          <div style={{ height: "180px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sectorData}
                  dataKey="v"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {sectorData.map((_, i) => (
                    <Cell key={i} fill={SECTOR_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip content={<SectorTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginTop: "8px" }}>
            {sectorData.map((s, i) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <span
                    style={{
                      height: "8px",
                      width: "8px",
                      borderRadius: "2px",
                      backgroundColor: SECTOR_COLORS[i],
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: "12px", color: "var(--neutral-700)" }}>{s.name}</span>
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    fontFamily: "monospace",
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--neutral-500)",
                  }}
                >
                  {s.v}%
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Borrower Portfolio Table */}
      <SectionCard
        title="Borrower Portfolio"
        noPad
        action={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Risk range select */}
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              style={{
                height: "30px",
                paddingLeft: "10px",
                paddingRight: "28px",
                fontSize: "12px",
                fontFamily: "monospace",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--neutral-700)",
                cursor: "pointer",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239CA3AF' strokeWidth='1.5' fill='none' strokeLinecap='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
              }}
            >
              {RISK_RANGES.map((r) => <option key={r}>{r}</option>)}
            </select>

            {/* Sector select */}
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              style={{
                height: "30px",
                paddingLeft: "10px",
                paddingRight: "28px",
                fontSize: "12px",
                fontFamily: "monospace",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--neutral-700)",
                cursor: "pointer",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239CA3AF' strokeWidth='1.5' fill='none' strokeLinecap='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
              }}
            >
              {SECTORS.map((s) => <option key={s}>{s}</option>)}
            </select>

            {/* Watchlist toggle */}
            <button
              onClick={() => setWatchlistOnly((v) => !v)}
              style={{
                height: "30px",
                paddingLeft: "10px",
                paddingRight: "10px",
                fontSize: "12px",
                fontFamily: "monospace",
                borderRadius: "6px",
                border: `1px solid ${watchlistOnly ? "#D97706" : "var(--border)"}`,
                backgroundColor: watchlistOnly ? "var(--warn-bg)" : "var(--card)",
                color: watchlistOnly ? "var(--warn)" : "var(--neutral-700)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontWeight: watchlistOnly ? 600 : 400,
                transition: "all 0.15s ease",
              }}
            >
              <Star
                style={{
                  height: "12px",
                  width: "12px",
                  fill: watchlistOnly ? "#D97706" : "none",
                  stroke: watchlistOnly ? "#D97706" : "currentColor",
                }}
              />
              Watchlist
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "860px" }}>
            <thead style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                {[
                  "Borrower ID",
                  "Name",
                  "Sector",
                  "Exposure",
                  "PD",
                  "LGD",
                  "EAD",
                  "Risk Score",
                  "Watchlist",
                  "Actions",
                ].map((col) => (
                  <th
                    key={col}
                    className="text-left px-4 py-3 text-[12px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--neutral-500)", whiteSpace: "nowrap" }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBorrowers.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    style={{
                      padding: "32px 16px",
                      textAlign: "center",
                      color: "var(--neutral-400)",
                      fontFamily: "monospace",
                      fontSize: "13px",
                    }}
                  >
                    No borrowers match the current filters.
                  </td>
                </tr>
              ) : (
                filteredBorrowers.map((b, i) => (
                  <tr
                    key={b.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      backgroundColor: i % 2 === 0 ? "transparent" : "var(--neutral-50)",
                    }}
                  >
                    <td
                      className="px-4 py-3 font-mono text-[13px]"
                      style={{ color: "var(--neutral-700)", fontVariantNumeric: "tabular-nums" }}
                    >
                      {b.id}
                    </td>
                    <td
                      className="px-4 py-3 text-[13px]"
                      style={{ fontWeight: 500, color: "var(--neutral-900)", whiteSpace: "nowrap" }}
                    >
                      {b.name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        style={{
                          fontSize: "11px",
                          fontFamily: "monospace",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          backgroundColor: "var(--info-bg)",
                          color: "var(--info)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.sector}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-[13px]"
                      style={{ color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
                    >
                      {b.exposure}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-[13px]"
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: parseFloat(b.pd) >= 5 ? "var(--fail)" : parseFloat(b.pd) >= 3 ? "var(--warn)" : "var(--neutral-700)",
                      }}
                    >
                      {b.pd}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-[13px]"
                      style={{ color: "var(--neutral-700)", fontVariantNumeric: "tabular-nums" }}
                    >
                      {b.lgd}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-[13px]"
                      style={{ color: "var(--neutral-700)", fontVariantNumeric: "tabular-nums" }}
                    >
                      {b.ead}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 9px",
                          borderRadius: "4px",
                          backgroundColor: scoreBg(b.score),
                          color: scoreColor(b.score),
                          fontFamily: "monospace",
                          fontSize: "12px",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {b.score}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {b.watchlist ? (
                        <Star
                          style={{ height: "16px", width: "16px", fill: "#D97706", stroke: "#D97706" }}
                          aria-label="On watchlist"
                        />
                      ) : (
                        <span style={{ color: "var(--neutral-300)", fontSize: "13px", fontFamily: "monospace" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedBorrower(b)}
                        aria-label={`View details for ${b.name}`}
                        style={{
                          height: "28px",
                          width: "28px",
                          display: "grid",
                          placeItems: "center",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          backgroundColor: "transparent",
                          color: "var(--neutral-500)",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--primary-50)";
                          (e.currentTarget as HTMLElement).style.borderColor = "var(--primary-500)";
                          (e.currentTarget as HTMLElement).style.color = "var(--primary-500)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                          (e.currentTarget as HTMLElement).style.color = "var(--neutral-500)";
                        }}
                      >
                        <Eye style={{ height: "14px", width: "14px" }} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Table footer */}
        <div
          style={{
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--neutral-400)" }}>
            {filteredBorrowers.length} of {BORROWERS.length} borrowers
          </span>
          <button
            style={{
              height: "28px",
              paddingLeft: "10px",
              paddingRight: "10px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "12px",
              fontFamily: "monospace",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              backgroundColor: "transparent",
              color: "var(--neutral-500)",
              cursor: "pointer",
            }}
          >
            <Plus style={{ height: "12px", width: "12px" }} />
            Add Borrower
          </button>
        </div>
      </SectionCard>

      {/* Borrower drawer/modal */}
      {selectedBorrower && (
        <BorrowerDrawer
          borrower={selectedBorrower}
          onClose={() => setSelectedBorrower(null)}
        />
      )}
    </AppShell>
  );
}
