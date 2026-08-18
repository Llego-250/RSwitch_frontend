import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState } from "react";
import { AppShell, PrimaryButton, SecondaryButton, SectionCard } from "@/components/AppShell";
import { useOnboardingState } from "@/hooks/useOnboardingState";
import { StepInstitutionInfo } from "@/components/onboarding/StepInstitutionInfo";
import { StepTechnicalSetup } from "@/components/onboarding/StepTechnicalSetup";
import { StepComplianceInfo } from "@/components/onboarding/StepComplianceInfo";
import { StepDataMapping } from "@/components/onboarding/StepDataMapping";
import { StepReviewSubmit } from "@/components/onboarding/StepReviewSubmit";
import {
  Building2,
  Server,
  ShieldCheck,
  Database,
  CheckCircle2,
  Save,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Check,
  Clock,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingRoute,
});

const STEPS = [
  { id: 1, label: "Institution Identity", icon: Building2 },
  { id: 2, label: "Technical Setup", icon: Server },
  { id: 3, label: "Compliance & DPO", icon: ShieldCheck },
  { id: 4, label: "Data Mapping", icon: Database },
  { id: 5, label: "Review & Submit", icon: CheckCircle2 },
];

function OnboardingRoute() {
  const {
    state,
    isSaving,
    setStep,
    updateStep1,
    updateStep2,
    updateStep3,
    updateFieldMapping,
    submitOnboarding,
    resetOnboarding,
  } = useOnboardingState();

  const [submittedSuccess, setSubmittedSuccess] = useState(state.status === "SUBMITTED");

  const handleNext = () => {
    if (state.currentStep < 5) {
      setStep(state.currentStep + 1);
    }
  };

  const handleBack = () => {
    if (state.currentStep > 1) {
      setStep(state.currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    const success = await submitOnboarding();
    if (success) {
      setSubmittedSuccess(true);
    }
  };

  return (
    <AppShell
      title="Participant Onboarding Wizard"
      subtitle="Institutional Registration & Technical Setup"
      breadcrumb="ADMIN › PARTICIPANT ONBOARDING"
      scope="Technical & Compliance Onboarding"
      toolbar={
        <div className="flex items-center justify-between w-full text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-700">Status:</span>
            <span
              className={`px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                state.status === "SUBMITTED"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-amber-100 text-amber-800 border border-amber-300"
              }`}
            >
              {state.status}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {state.lastSavedAt && (
              <span className="text-neutral-500 font-mono flex items-center gap-1 text-[11px]">
                <Clock className="h-3 w-3 text-neutral-400" /> Auto-saved at {state.lastSavedAt}
              </span>
            )}
            {isSaving && <span className="text-sky-600 font-semibold text-[11px] animate-pulse">Syncing...</span>}
            <button
              onClick={resetOnboarding}
              className="text-neutral-400 hover:text-neutral-600 font-medium text-[11px] flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" /> Reset Draft
            </button>
          </div>
        </div>
      }
    >
      {submittedSuccess ? (
        <div className="max-w-xl mx-auto my-8 p-8 bg-white border border-neutral-200 rounded-2xl shadow-xl text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600">
            <Send className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-neutral-900">Onboarding Application Submitted!</h2>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Your application for <span className="font-semibold text-neutral-900">{state.step1.institutionName}</span> has been transmitted to the RSwitch Technical & Compliance team.
          </p>
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-mono text-neutral-700 text-left space-y-1">
            <div><span className="text-neutral-400">STATE TRANSITION:</span> DRAFT → SUBMITTED</div>
            <div><span className="text-neutral-400">APPLICATION REF:</span> ONB-2026-{Math.floor(1000 + Math.random() * 9000)}</div>
            <div><span className="text-neutral-400">ESTIMATED REVIEW:</span> 24 Hours</div>
          </div>
          <div className="pt-4 flex justify-center gap-3">
            <Link to="/participant">
              <Button className="bg-sky-600 hover:bg-sky-700 text-white">
                View Participant Directory
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Wizard Step Progress Bar */}
          <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm">
            <div className="grid grid-cols-5 gap-2">
              {STEPS.map((s) => {
                const Icon = s.icon;
                const isActive = state.currentStep === s.id;
                const isDone = state.currentStep > s.id;

                return (
                  <button
                    key={s.id}
                    onClick={() => setStep(s.id)}
                    className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${
                      isActive
                        ? "border-sky-600 bg-sky-50/70 shadow-sm"
                        : isDone
                        ? "border-emerald-200 bg-emerald-50/50 text-emerald-800"
                        : "border-neutral-200 bg-neutral-50/50 text-neutral-400"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                        isActive
                          ? "bg-sky-600 text-white"
                          : isDone
                          ? "bg-emerald-600 text-white"
                          : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {isDone ? <Check className="h-4 w-4" /> : s.id}
                    </div>
                    <div className="hidden sm:block overflow-hidden">
                      <div className={`text-xs font-bold truncate ${isActive ? "text-sky-900" : isDone ? "text-emerald-900" : "text-neutral-500"}`}>
                        {s.label}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono">Step {s.id} of 5</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Step Body */}
          <SectionCard noPad>
            <div className="p-6">
              {state.currentStep === 1 && (
                <StepInstitutionInfo data={state.step1} onChange={updateStep1} />
              )}
              {state.currentStep === 2 && (
                <StepTechnicalSetup data={state.step2} onChange={updateStep2} />
              )}
              {state.currentStep === 3 && (
                <StepComplianceInfo data={state.step3} onChange={updateStep3} />
              )}
              {state.currentStep === 4 && (
                <StepDataMapping mappings={state.fieldMappings} onChange={updateFieldMapping} />
              )}
              {state.currentStep === 5 && (
                <StepReviewSubmit state={state} onSubmit={handleSubmit} isSubmitting={isSaving} />
              )}

              {/* Wizard Navigation Footer */}
              <div className="flex items-center justify-between border-t border-neutral-200 pt-6 mt-8">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={state.currentStep === 1}
                  className="gap-2 text-xs"
                >
                  <ArrowLeft className="h-4 w-4" /> Previous Step
                </Button>

                {state.currentStep < 5 && (
                  <Button
                    onClick={handleNext}
                    className="bg-sky-600 hover:bg-sky-700 text-white gap-2 text-xs font-semibold"
                  >
                    Next Step <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </AppShell>
  );
}
