import type { ReactNode } from "react";

// Shared frame for the signed-out pages: sign-in, password reset and
// invitation acceptance.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="blueprint-grid flex min-h-screen items-center justify-center p-5 md:p-8"
      style={{ background: "linear-gradient(135deg, rgba(18, 76, 129, 0.08), #ffffff)" }}
    >
      <div className="flex w-full max-w-[1080px] flex-wrap items-center justify-center gap-14">
        <div className="order-2 w-full max-w-[480px] flex-[1_1_360px] rounded-3xl bg-white px-7 py-8 shadow-[0_25px_50px_-12px_rgba(10,37,64,0.28),0_8px_16px_rgba(10,37,64,0.12),0_0_0_1px_rgba(10,37,64,0.06)]">
          {children}
        </div>
        <div className="order-1 flex max-w-[420px] flex-[1_1_300px] flex-col items-start justify-center py-2">
          <div
            className="mb-5 inline-flex h-40 w-40 items-center justify-center rounded-[36px] p-[18px] shadow-[0_24px_48px_-12px_rgba(9,46,61,0.35),0_0_30px_rgba(86,180,211,0.2)]"
            style={{
              background: "linear-gradient(135deg, rgba(86,180,211,0.2), rgba(9,46,61,0.9))",
              border: "1.5px solid rgba(86,180,211,0.4)",
            }}
          >
            <img
              src="/insight-navigator-logo.png"
              alt="RDIP logo"
              className="h-full w-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.25)]"
            />
          </div>
          <div className="text-[32px] font-extrabold leading-tight tracking-tight text-[var(--neutral-900)]">RDIP Platform</div>
          <div className="mt-2 text-sm tracking-wide text-[var(--neutral-500)]">Governed insights · Secure access</div>
          <div className="mt-2.5 max-w-[500px] text-sm leading-relaxed text-[var(--neutral-600)]">
            The RSwitch Data Intelligence Platform: participant integrations, compliance, governance and financial
            inclusion in one secure workspace for RSwitch staff.
          </div>
        </div>
      </div>
    </div>
  );
}

export const authInputClass =
  "h-11 w-full rounded-lg border-[1.5px] border-[var(--neutral-200)] bg-white px-3 text-sm text-[var(--neutral-900)] outline-none transition-colors focus:border-[var(--primary-500)] aria-[invalid=true]:border-rose-400";

export const authLabelClass = "mb-1.5 block text-[13px] font-medium text-[var(--neutral-700)]";

export const authButtonClass =
  "flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary-500)] text-[15px] font-semibold text-white transition-colors hover:bg-[var(--primary-700)] disabled:opacity-60";

export function AuthNotice({ tone, children }: { tone: "error" | "info" | "success"; children: ReactNode }) {
  const styles = {
    error: "bg-[var(--fail-bg)] text-[var(--fail)] border-[rgba(225,29,72,0.18)]",
    info: "bg-sky-50 text-sky-800 border-sky-200",
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mb-4 rounded-md border px-3 py-2.5 text-[13px] font-medium ${styles}`}>
      {children}
    </div>
  );
}
