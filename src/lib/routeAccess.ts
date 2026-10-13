// Which capability (SRS §12.1, mirrored in lib/roles ACTIONS) each page needs.
// The root route guard checks it on every navigation, including a URL typed
// straight into the address bar (REQ-AUTH-008/010); the sidebar uses the same
// map so it only lists pages the role can open. The backend still enforces
// every API call independently.
import type { Action } from "@/lib/roles";

/** Pages reachable without signing in. */
export const PUBLIC_PATHS = ["/login", "/reset-password", "/accept-invite"];

// Longest prefix wins; anything unlisted only needs a signed-in user.
const ROUTE_CAPS: [string, Action][] = [
  ["/integrations", "integrations.view"],
  ["/onboarding", "integrations.manage"],
  ["/mapping", "mapping.view"],
  ["/pipelines", "pipelines.view"],
  ["/participant-360", "participant360.view"],
  ["/participant", "participant360.view"],
  ["/governance", "governance.view"],
  ["/compliance", "compliance.view"],
  ["/ai", "ai.view"],
  ["/inclusion", "inclusion.view"],
  ["/reports", "reports.view"],
  ["/users", "users.manage"],
  ["/settings", "settings.view"],
  ["/audit", "audit.view"],
  ["/notifications", "notifications.view"],
];

export const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function requiredCap(pathname: string): Action {
  const match = ROUTE_CAPS.filter(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return match ? match[1] : "dashboard.view";
}
