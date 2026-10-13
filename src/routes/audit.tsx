import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AuditLogTable } from "@/components/AuditLogTable";
import { useRole } from "@/context/RoleContext";
import { hasCap } from "@/lib/roles";

// SRS §12.1 "Audit Log — View" (Compliance, Technical/Admin). Export for a
// date range is Technical/Admin only (REQ-SET-005).
export const Route = createFileRoute("/audit")({
  component: AuditLogPage,
});

function AuditLogPage() {
  const { role } = useRole();
  return (
    <AppShell
      title="Audit Log"
      subtitle="Every data-changing action and sign-in attempt, with user, time, IP address and user agent"
      breadcrumb="ADMIN › AUDIT LOG"
    >
      <AuditLogTable canExport={hasCap(role, "settings.manage")} />
    </AppShell>
  );
}
