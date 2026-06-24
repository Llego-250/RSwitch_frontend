import { createFileRoute } from "@tanstack/react-router";
import { Stub } from "./customer-360";

export const Route = createFileRoute("/governance")({
  head: () => ({ meta: [{ title: "Governance · Financial Interop" }] }),
  component: () => (
    <Stub
      title="Governance & Data Quality"
      breadcrumb="UNIFY › GOVERNANCE"
      summary="Stewardship workspace — quality rules, issue queue, ownership, and remediation tied to pipeline failures."
      reqs="FR-GOV-01 · SYS-07 · BR-05"
    />
  ),
});
