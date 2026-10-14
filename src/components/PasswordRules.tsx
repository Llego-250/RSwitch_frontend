import { Check, X } from "lucide-react";
import type { PasswordPolicy } from "@/lib/types";

// SRS §11.1 rules as currently configured (REQ-SET-003), checked live as the
// user types. The server enforces the same rules, plus password history.
export function passwordChecks(password: string, policy: PasswordPolicy) {
  const checks = [
    { label: `At least ${policy.min_length} characters`, ok: password.length >= policy.min_length },
  ];
  if (policy.require_uppercase)
    checks.push({ label: "An uppercase letter", ok: /[A-Z]/.test(password) });
  if (policy.require_lowercase)
    checks.push({ label: "A lowercase letter", ok: /[a-z]/.test(password) });
  if (policy.require_digit) checks.push({ label: "A number", ok: /[0-9]/.test(password) });
  if (policy.require_special) {
    checks.push({
      label: `A special character (${policy.special_characters})`,
      ok: [...password].some((c) => policy.special_characters.includes(c)),
    });
  }
  return checks;
}

export function PasswordRules({ password, policy }: { password: string; policy?: PasswordPolicy }) {
  if (!policy) return null;
  return (
    <ul
      className="mt-2 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2"
      aria-label="Password requirements"
    >
      {passwordChecks(password, policy).map((c) => (
        <li
          key={c.label}
          className={`flex items-center gap-1.5 ${c.ok ? "text-emerald-600" : "text-slate-500"}`}
        >
          {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {c.label}
        </li>
      ))}
      {policy.history > 0 && (
        <li className="flex items-center gap-1.5 text-slate-500 sm:col-span-2">
          Can't be one of your last {policy.history} passwords
        </li>
      )}
    </ul>
  );
}
