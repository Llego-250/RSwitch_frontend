import { createFileRoute } from "@tanstack/react-router";
import { Stub } from "./customer-360";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Financial Interop" }] }),
  component: () => (
    <Stub
      title="Settings"
      breadcrumb="ADMINISTER › SETTINGS"
      summary="Organisation, preferences and system configuration."
      reqs="—"
    />
  ),
});
