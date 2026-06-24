import { createFileRoute } from "@tanstack/react-router";
import { Stub } from "./customer-360";

export const Route = createFileRoute("/compliance")({
  head: () => ({ meta: [{ title: "Compliance · Financial Interop" }] }),
  component: () => (
    <Stub
      title="Regulatory Compliance"
      breadcrumb="UNIFY › COMPLIANCE"
      summary="Compliance home — obligations calendar, submission history, and audit-ready evidence packs."
      reqs="FR-COMP-01 · SYS-12 · BR-07"
    />
  ),
});
