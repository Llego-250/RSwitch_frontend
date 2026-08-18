import React from "react";
import { Database, ArrowRight, CheckCircle, RefreshCw } from "lucide-react";
import { FieldMappingRule } from "@/lib/schemas/onboardingSchema";
import { Input } from "@/components/ui/input";

interface Step4Props {
  mappings: FieldMappingRule[];
  onChange: (index: number, updated: FieldMappingRule) => void;
}

export const StepDataMapping: React.FC<Step4Props> = ({ mappings, onChange }) => {
  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 pb-4">
        <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
          <Database className="h-5 w-5 text-sky-600" />
          Step 4: Field-Level Data Schema Mapping
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Map your internal Core Banking / Payment System database fields to the standard RSwitch Data Requirements (§10.1).
        </p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-neutral-100/70 border-b border-neutral-200 text-neutral-600 font-mono uppercase text-[10px]">
            <tr>
              <th className="px-4 py-3 text-left">RSwitch Target Field</th>
              <th className="px-4 py-3 text-center">Data Type</th>
              <th className="px-4 py-3 text-center">Mapping</th>
              <th className="px-4 py-3 text-left">Your Source Field</th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {mappings.map((m, idx) => (
              <tr key={idx} className="hover:bg-neutral-50/60 transition-colors">
                <td className="px-4 py-3 font-mono font-bold text-sky-700">
                  {m.targetField}
                  {m.isRequired && <span className="text-rose-500 ml-1">*</span>}
                </td>
                <td className="px-4 py-3 text-center font-mono text-[11px] text-neutral-500">
                  {m.dataType}
                </td>
                <td className="px-4 py-3 text-center text-neutral-400">
                  <ArrowRight className="h-4 w-4 inline text-sky-500" />
                </td>
                <td className="px-4 py-3">
                  <Input
                    type="text"
                    value={m.sourceField}
                    onChange={(e) => onChange(idx, { ...m, sourceField: e.target.value })}
                    className="h-8 text-xs font-mono bg-neutral-50"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle className="h-3 w-3" /> Mapped
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center justify-between text-xs">
        <span className="text-neutral-600">
          Flexibility Note (§10.1): Schema accommodate optional fields without requiring architectural changes.
        </span>
        <button
          type="button"
          onClick={() => {
            mappings.forEach((m, i) => onChange(i, { ...m }));
          }}
          className="text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Auto-Detect Fields
        </button>
      </div>
    </div>
  );
};
