import { createFileRoute } from "@tanstack/react-router";
import { Stub } from "./customer-360";

export const Route = createFileRoute("/inclusion")({
  head: () => ({ meta: [{ title: "Financial Inclusion · Financial Interop" }] }),
  component: () => (
    <Stub
      title="Financial Inclusion"
      breadcrumb="DECIDE › INCLUSION"
      summary="Reach and coverage analytics — segment-level access metrics across regions and product lines."
      reqs="FR-INCL-01"
    />
  ),
});
