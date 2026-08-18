import React from "react";
import { Building2, ShieldCheck, Mail, Phone, Hash, Award } from "lucide-react";
import { Step1Data } from "@/lib/schemas/onboardingSchema";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Step1Props {
  data: Partial<Step1Data>;
  onChange: (updates: Partial<Step1Data>) => void;
}

export const StepInstitutionInfo: React.FC<Step1Props> = ({ data, onChange }) => {
  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 pb-4">
        <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-sky-600" />
          Step 1: Institution Details & Identity
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Provide official institution registration details as authorized by the National Bank of Rwanda (BNR).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="space-y-1.5">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-neutral-400" /> Institution Name *
          </label>
          <Input
            type="text"
            placeholder="e.g. Bank of Kigali PLC"
            value={data.institutionName || ""}
            onChange={(e) => onChange({ institutionName: e.target.value })}
            className="h-10 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5 text-neutral-400" /> BNR License Number *
          </label>
          <Input
            type="text"
            placeholder="e.g. BNR-LIC-2024-001"
            value={data.licenseNumber || ""}
            onChange={(e) => onChange({ licenseNumber: e.target.value })}
            className="h-10 font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            Institution Classification *
          </label>
          <select
            value={data.institutionType || "Commercial Bank"}
            onChange={(e) => onChange({ institutionType: e.target.value as any })}
            className="w-full h-10 px-3 bg-white border border-neutral-200 rounded-lg text-xs font-medium text-neutral-900 outline-none focus:border-sky-500"
          >
            <option value="Commercial Bank">Commercial Bank</option>
            <option value="Microfinance Institution">Microfinance Institution (MFI)</option>
            <option value="E-Money Issuer">E-Money Issuer / Mobile Money</option>
            <option value="SACCO">Savings & Credit Co-operative (SACCO)</option>
            <option value="Payment Service Provider">Payment Service Provider (PSP)</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 text-neutral-400" /> SWIFT / BIC Code *
          </label>
          <Input
            type="text"
            placeholder="e.g. BKIGRW22"
            value={data.swiftBic || ""}
            onChange={(e) => onChange({ swiftBic: e.target.value.toUpperCase() })}
            className="h-10 font-mono text-xs uppercase"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            Primary Contact Person *
          </label>
          <Input
            type="text"
            placeholder="e.g. Jean De Dieu"
            value={data.primaryContactName || ""}
            onChange={(e) => onChange({ primaryContactName: e.target.value })}
            className="h-10 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-neutral-400" /> Work Email Address *
          </label>
          <Input
            type="email"
            placeholder="contact@institution.rw"
            value={data.primaryContactEmail || ""}
            onChange={(e) => onChange({ primaryContactEmail: e.target.value })}
            className="h-10 text-xs"
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-neutral-400" /> Official Phone Number *
          </label>
          <Input
            type="tel"
            placeholder="+250 788 000 000"
            value={data.primaryContactPhone || ""}
            onChange={(e) => onChange({ primaryContactPhone: e.target.value })}
            className="h-10 text-xs font-mono"
          />
        </div>
      </div>
    </div>
  );
};
