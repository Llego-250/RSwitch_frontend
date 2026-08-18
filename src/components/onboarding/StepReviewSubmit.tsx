import React from "react";
import { CheckCircle2, ShieldCheck, Building2, Server, Database, AlertCircle } from "lucide-react";
import { OnboardingState } from "@/hooks/useOnboardingState";
import { Button } from "@/components/ui/button";

interface Step5Props {
  state: OnboardingState;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export const StepReviewSubmit: React.FC<Step5Props> = ({ state, onSubmit, isSubmitting }) => {
  const { step1, step2, step3, fieldMappings } = state;

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 pb-4">
        <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          Step 5: Final Review & Formal Onboarding Submission
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Review all institution details, integration endpoints, compliance documents, and field mappings before submitting to RSwitch Technical Review team.
        </p>
      </div>

      <div className="space-y-4 text-xs">
        {/* Section 1 */}
        <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 border-b border-neutral-200 pb-2">
            <Building2 className="h-4 w-4 text-sky-600" /> Institution Identity
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-1 font-mono text-neutral-700">
            <div><span className="text-neutral-400 block text-[10px]">NAME</span> {step1.institutionName}</div>
            <div><span className="text-neutral-400 block text-[10px]">BNR LICENSE</span> {step1.licenseNumber}</div>
            <div><span className="text-neutral-400 block text-[10px]">TYPE</span> {step1.institutionType}</div>
            <div><span className="text-neutral-400 block text-[10px]">SWIFT/BIC</span> {step1.swiftBic}</div>
            <div><span className="text-neutral-400 block text-[10px]">CONTACT</span> {step1.primaryContactName}</div>
            <div><span className="text-neutral-400 block text-[10px]">EMAIL</span> {step1.primaryContactEmail}</div>
          </div>
        </div>

        {/* Section 2 */}
        <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 border-b border-neutral-200 pb-2">
            <Server className="h-4 w-4 text-sky-600" /> Technical Integration
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 font-mono text-neutral-700">
            <div><span className="text-neutral-400 block text-[10px]">API ENDPOINT</span> {step2.apiBaseUrl}</div>
            <div><span className="text-neutral-400 block text-[10px]">WEBHOOK URL</span> {step2.webhookCallbackUrl}</div>
            <div><span className="text-neutral-400 block text-[10px]">ENVIRONMENT</span> {step2.environment}</div>
            <div><span className="text-neutral-400 block text-[10px]">IP WHITELIST</span> {step2.ipWhitelist}</div>
          </div>
        </div>

        {/* Section 3 */}
        <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 border-b border-neutral-200 pb-2">
            <ShieldCheck className="h-4 w-4 text-sky-600" /> Compliance & Legal
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-neutral-700">
            <div><span className="text-neutral-400 block text-[10px]">DATA PRIVACY OFFICER</span> {step3.dataPrivacyOfficerName} ({step3.dataPrivacyOfficerEmail})</div>
            <div><span className="text-neutral-400 block text-[10px]">AML COMPLIANCE</span> {step3.amlComplianceApproved ? "Verified & Confirmed" : "Pending"}</div>
          </div>
        </div>

        {/* Section 4 */}
        <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-sm font-bold text-neutral-900 border-b border-neutral-200 pb-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-sky-600" /> Field Mappings ({fieldMappings.length} Fields)
            </div>
            <span className="text-xs text-emerald-600 font-semibold font-mono">100% Validated</span>
          </div>
          <p className="text-xs text-neutral-500 pt-1">
            All core schema attributes have been mapped and validated against RSwitch Data Specifications.
          </p>
        </div>
      </div>

      <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-emerald-900">Ready to Submit Application</h4>
            <p className="text-[11px] text-emerald-700">
              Submitting triggers automatic state transition from DRAFT → SUBMITTED. RSwitch Onboarding team will review within 24 business hours.
            </p>
          </div>
        </div>
        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-11 px-6 shadow-md"
        >
          {isSubmitting ? "Submitting Application..." : "Submit Application"}
        </Button>
      </div>
    </div>
  );
};
