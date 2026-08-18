import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { ShieldAlert, ArrowRight, Brain, Users2 } from "lucide-react";

export const Route = createFileRoute("/credit-risk")({
  component: CreditRiskOutofScope,
});

function CreditRiskOutofScope() {
  const navigate = useNavigate();

  return (
    <AppShell
      title="Credit Risk"
      subtitle="Out of Scope"
      breadcrumb="RDIP › OUT OF SCOPE"
    >
      <div className="max-w-4xl mx-auto py-12">
        <SectionCard className="p-8 text-center border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/10">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-6 shadow-sm">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-sans">
            SRS §2.8 Constraint & Scope Boundary
          </span>

          <h2 className="text-2xl font-bold font-heading text-[#172033] dark:text-white mt-4 mb-3">
            Individual Credit Scoring is Excluded from RDIP v1 Scope
          </h2>

          <p className="text-sm text-[#526174] dark:text-slate-300 max-w-2xl mx-auto leading-relaxed font-sans mb-8">
            According to <strong>Section 2.8 (Out of Scope)</strong> of the RSwitch Data Intelligence Platform SRS v1.1 specification:
            <br />
            <em className="block my-2 p-3 rounded-xl bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 font-mono text-xs text-left">
              "Automated credit scoring or lending decisions for individual customers is explicitly out of scope. RDIP is an internal operational platform for RSwitch to monitor participant institution health and compliance, not a retail credit rating agency."
            </em>
            Institutional operational risk scoring is natively supported under <strong>Participant 360</strong> and operational anomaly detection is handled in <strong>AI Decision Support</strong>.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <PrimaryButton
              icon={<Brain className="w-4 h-4" />}
              onClick={() => navigate({ to: "/ai" })}
            >
              Open AI Decision Support
            </PrimaryButton>
            <SecondaryButton
              icon={<Users2 className="w-4 h-4" />}
              onClick={() => navigate({ to: "/participant-360" })}
            >
              View Participant 360 Risk Scores
            </SecondaryButton>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
