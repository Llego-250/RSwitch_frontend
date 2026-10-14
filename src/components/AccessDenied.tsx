import { Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";

// REQ-AUTH-010: one view for "your role can't open this" and "this page
// doesn't exist", so a direct URL never reveals whether a module is there.
// It deliberately names nothing about the page that was asked for.
function Message() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800">
          <ShieldOff className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          You don't have access to this page
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          If you think you should, contact your RDIP administrator.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#168FA8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F6F83]"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AccessDenied() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F4F7F9] dark:bg-slate-950">
        <Message />
      </div>
    );
  }
  return (
    <AppShell title="Unavailable">
      <Message />
    </AppShell>
  );
}
