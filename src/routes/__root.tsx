import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Outlet, createRootRouteWithContext, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RoleProvider } from "../context/RoleContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { AccessDenied } from "@/components/AccessDenied";
import { MfaSetupModal } from "@/components/MfaSetupModal";
import { hasCap } from "@/lib/roles";
import { isPublicPath, requiredCap } from "@/lib/routeAccess";

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#F4F7F9] px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. The technical team has been notified.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-xl bg-[#168FA8] hover:bg-[#0F6F83] px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  // Same view as a forbidden module, so a URL can't be probed (REQ-AUTH-010).
  notFoundComponent: AccessDenied,
  errorComponent: ErrorComponent,
});

/** REQ-AUTH-002: an account without MFA can do nothing until it enrols. */
function MfaEnrollment() {
  const { completeMfaEnrollment, logout, user } = useAuth();
  return (
    <div className="min-h-dvh bg-[#F4F7F9]">
      <MfaSetupModal
        isOpen
        mandatory
        onClose={() => undefined}
        onSuccess={(result) => {
          if (result.access_token) void completeMfaEnrollment(result.access_token);
        }}
      />
      <div className="fixed bottom-6 left-0 right-0 z-[60] text-center text-xs text-white/90">
        Signed in as {user?.email}.{" "}
        <button onClick={() => logout()} className="font-semibold underline">
          Sign out
        </button>
      </div>
    </div>
  );
}

/** REQ-AUTH-008: every page checks its capability for the signed-in role,
 *  whether reached from the sidebar or typed into the address bar. */
function RouteGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (isPublicPath(pathname)) return <>{children}</>;
  if (!isAuthenticated || !user) return <Navigate to="/login" />;
  if (user.mfaSetupRequired) return <MfaEnrollment />;
  if (!hasCap(user.role, requiredCap(pathname))) return <AccessDenied />;
  return <>{children}</>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RoleProvider>
          <RouteGuard>
            <Outlet />
          </RouteGuard>
        </RoleProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
