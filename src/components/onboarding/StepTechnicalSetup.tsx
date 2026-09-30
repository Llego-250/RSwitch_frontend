import React from "react";
import { Server, Globe, Key, Shield, Network, Lock } from "lucide-react";
import { Step2Data } from "@/lib/schemas/onboardingSchema";
import { Input } from "@/components/ui/input";

interface Step2Props {
  data: Partial<Step2Data>;
  onChange: (updates: Partial<Step2Data>) => void;
}

export const StepTechnicalSetup: React.FC<Step2Props> = ({ data, onChange }) => {
  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 pb-4">
        <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
          <Server className="h-5 w-5 text-[#168FA8]" />
          Step 2: Technical Integration & Security Endpoints
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Configure API endpoints, webhook callback handlers, public key TLS certificates, and IP whitelisting.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="space-y-1.5 md:col-span-2">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-neutral-400" /> Base API Endpoint (HTTPS) *
          </label>
          <Input
            type="url"
            placeholder="https://api.institution.rw/v1/rdip"
            value={data.apiBaseUrl || ""}
            onChange={(e) => onChange({ apiBaseUrl: e.target.value })}
            className="h-10 font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5 text-neutral-400" /> Webhook Callback URL *
          </label>
          <Input
            type="url"
            placeholder="https://api.institution.rw/v1/webhooks/rswitch"
            value={data.webhookCallbackUrl || ""}
            onChange={(e) => onChange({ webhookCallbackUrl: e.target.value })}
            className="h-10 font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-neutral-700">Target Environment *</label>
          <select
            value={data.environment || "Staging"}
            onChange={(e) => onChange({ environment: e.target.value as any })}
            className="w-full h-10 px-3 bg-white border border-neutral-200 rounded-lg text-xs font-medium text-neutral-900 outline-none"
          >
            <option value="Staging">Staging (Testing & UAT Sandbox)</option>
            <option value="Production">Production (Live Switch Traffic)</option>
            <option value="Sandbox">Sandbox (Mock Environment)</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-neutral-700">Authentication Protocol *</label>
          <select
            value={data.authType || "OAuth2 Client Credentials"}
            onChange={(e) => onChange({ authType: e.target.value as any })}
            className="w-full h-10 px-3 bg-white border border-neutral-200 rounded-lg text-xs font-medium text-neutral-900 outline-none"
          >
            <option value="OAuth2 Client Credentials">OAuth2 Client Credentials</option>
            <option value="mTLS Certificate">Mutual TLS (mTLS) Certificate</option>
            <option value="API Key Header">API Key Header Signature</option>
          </select>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-neutral-400" /> Ingress IP Whitelist (CIDR Notation) *
          </label>
          <Input
            type="text"
            placeholder="197.243.12.0/24, 41.186.22.10"
            value={data.ipWhitelist || ""}
            onChange={(e) => onChange({ ipWhitelist: e.target.value })}
            className="h-10 font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="font-semibold text-neutral-700 flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5 text-neutral-400" /> RSA Public Certificate (PEM format) *
          </label>
          <textarea
            rows={4}
            placeholder="-----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----"
            value={data.publicKeyPem || ""}
            onChange={(e) => onChange({ publicKeyPem: e.target.value })}
            className="w-full p-3 font-mono text-[11px] bg-neutral-900 text-sky-400 rounded-lg border border-neutral-700 outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );
};
