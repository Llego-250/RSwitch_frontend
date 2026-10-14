// The filters of one report type (REQ-RPT-002 / §14, REQ-RPT-006). Only the
// filters the API lists for the type are shown, with its own status values
// and date meaning; inline errors come from the API's §20.2 response.
import { Field, inputCls } from "@/components/governance/ui";
import type { ReportCatalog, ReportFilters, ReportType } from "@/lib/reports";

export function ReportFilterFields({
  type,
  catalog,
  value,
  onChange,
  errors = {},
}: {
  type: ReportType;
  catalog: ReportCatalog;
  value: ReportFilters;
  onChange: (next: ReportFilters) => void;
  errors?: Record<string, string>;
}) {
  const o = catalog.options;
  const has = (k: keyof ReportFilters) => type.filters.includes(k);
  const set = (patch: ReportFilters) => onChange({ ...value, ...patch });
  const err = (k: string) => errors[`filters.${k}`] ?? errors[k];

  const select = (
    key: keyof ReportFilters,
    label: string,
    options: { value: string; label: string }[],
    numeric = false,
  ) =>
    has(key) && (
      <Field label={label} error={err(key)}>
        <select
          value={value[key] === undefined ? "" : String(value[key])}
          onChange={(e) =>
            set({
              [key]:
                e.target.value === ""
                  ? undefined
                  : numeric
                    ? Number(e.target.value)
                    : e.target.value,
            })
          }
          className={inputCls}
        >
          <option value="">All</option>
          {options.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
      </Field>
    );

  const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {select(
          "participant_id",
          type.key === "governance_action_items" ? "Owning institution" : "Institution",
          o.participants.map((p) => ({ value: String(p.id), label: `${p.name} (${p.code})` })),
          true,
        )}
        {select("institution_type", "Participant type", opts(o.institution_types))}
        {select("region", "Region", opts(o.regions))}
        {select("status", type.status_label, opts(type.status_options))}
        {select("risk_level", "Risk level", opts(o.risk_levels))}
        {select("integration_type", "Integration type", opts(o.integration_types))}
        {select("severity", "Severity", opts(o.severities))}
        {select(
          "committee_id",
          "Committee",
          o.committees.map((c) => ({ value: String(c.id), label: c.name })),
          true,
        )}
        {has("owner") && (
          <Field label="Owner (name contains)" error={err("owner")}>
            <input
              value={value.owner ?? ""}
              onChange={(e) => set({ owner: e.target.value || undefined })}
              className={inputCls}
              maxLength={120}
            />
          </Field>
        )}
      </div>
      {has("date_from") && (
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" error={err("date_from")}>
              <input
                type="date"
                value={value.date_from ?? ""}
                max={value.date_to}
                onChange={(e) => set({ date_from: e.target.value || undefined })}
                className={inputCls}
              />
            </Field>
            <Field label="To" error={err("date_to")}>
              <input
                type="date"
                value={value.date_to ?? ""}
                min={value.date_from}
                onChange={(e) => set({ date_to: e.target.value || undefined })}
                className={inputCls}
              />
            </Field>
          </div>
          {type.date_basis && (
            <p className="text-[11px] text-[#7B8798] mt-1">Date range: {type.date_basis}</p>
          )}
        </div>
      )}
      {type.note && <p className="text-[11px] text-[#7B8798]">{type.note}</p>}
    </div>
  );
}
