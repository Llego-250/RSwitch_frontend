import React from "react";
import { ShieldCheck, FileCheck, User, Calendar, Upload, CheckCircle2 } from "lucide-react";
import { Step3Data } from "@/lib/schemas/onboardingSchema";
import { Input } from "@/components/ui/input";

interface Step3Props {
  data: Partial<Step3Data>;
  onChange: (updates: Partial<Step3Data>) => void;
}

export const StepComplianceInfo: React.FC<Step3Props> = ({ data, onChange }) => {
  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 pb-4">
        <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-600" />
          Step 3: Regulatory Compliance & Data Privacy Sign-Off
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Verify anti-money laundering (AML/CFT) regulatory compliance and designate Data Privacy Officer (DPO).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="space-y-1.5">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-neutral-400" /> Data Privacy Officer (DPO) Name *
          </label>
          <Input
            type="text"
            placeholder="e.g. Divine Mutesi"
            value={data.dataPrivacyOfficerName || ""}
            onChange={(e) => onChange({ dataPrivacyOfficerName: e.target.value })}
            className="h-10 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            DPO Work Email *
          </label>
          <Input
            type="email"
            placeholder="dpo@institution.rw"
            value={data.dataPrivacyOfficerEmail || ""}
            onChange={(e) => onChange({ dataPrivacyOfficerEmail: e.target.value })}
            className="h-10 text-xs"
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-neutral-400" /> Latest KYC / AML Audit Sign-Off Date *
          </label>
          <Input
            type="date"
            value={data.kycAuditSignedDate || ""}
            onChange={(e) => onChange({ kycAuditSignedDate: e.target.value })}
            className="h-10 text-xs font-mono"
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5 text-neutral-400" /> Upload BNR Operating License (PDF) *
          </label>
          <div className="p-4 border-2 border-dashed border-neutral-300 hover:border-sky-500 rounded-xl bg-neutral-50/50 flex flex-col items-center justify-center text-center cursor-pointer transition-colors">
            <FileCheck className="h-8 w-8 text-sky-600 mb-2" />
            <span className="text-xs font-semibold text-neutral-800">
              {data.licenseDocumentName ? data.licenseDocumentName : "Click to select BNR_License_Document.pdf"}
            </span>
            <span className="text-[11px] text-neutral-500 mt-1">PDF up to 25 MB</span>
          </div>
        </div>

        <div className="md:col-span-2 p-4 bg-sky-50/70 border border-sky-200 rounded-xl flex items-start gap-3 mt-2">
          <input
            type="checkbox"
            id="aml-check"
            checked={data.amlComplianceApproved ?? true}
            onChange={(e) => onChange({ amlComplianceApproved: e.target.checked })}
            className="mt-1 h-4 w-4 accent-sky-600 rounded"
          />
          <label htmlFor="aml-check" className="text-xs text-neutral-800 leading-relaxed cursor-pointer">
            <span className="font-bold text-sky-900 block mb-0.5">Regulatory Compliance Declaration (§10.1 & §12)</span>
            We confirm that our institution fully complies with BNR Regulation N° 03/2021 on Prevention of Money Laundering and Financing of Terrorism, and that all data provided strictly adheres to National Data Protection law.
          </label>
        </div>
      </div>
    </div>
  );
};
