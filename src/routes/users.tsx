import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRole } from "@/context/RoleContext";
import { Lock, Plus, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "Users & Security · Financial Interop" }] }),
  component: Users,
});

const USERS = [
  { name: "J. Okello",  role: "Fraud Investigator", mfa: true,  status: "healthy" as const, seen: "12:14" },
  { name: "A. Mensah",  role: "Risk Manager",       mfa: true,  status: "healthy" as const, seen: "11:50" },
  { name: "R. Diallo",  role: "Regulator",          mfa: true,  status: "healthy" as const, seen: "09:30" },
  { name: "T. Banda",   role: "Data Architect",     mfa: false, status: "warning" as const, seen: "yesterday" },
  { name: "k.li (pending)", role: "Financial Analyst", mfa: null as any, status: "draft" as const, seen: "—" },
];

function Users() {
  const { role } = useRole();
  if (role !== "admin") {
    return (
      <AppShell title="Users & Security" breadcrumb="ADMINISTER › USERS">
        <div className="max-w-md mx-auto mt-12 rounded-lg border border-border bg-card p-8 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-fail-bg text-fail grid place-items-center mb-3">
            <Lock className="h-5 w-5" />
          </div>
          <h2 className="font-display font-600 text-lg">Permission required</h2>
          <p className="text-sm text-muted-foreground mt-1">
            This module is restricted to Administrators.
          </p>
          <div className="mt-4 font-mono text-[11px] text-muted-foreground">
            SYS-09 · NFR-SEC-04 · capability resolver: role=<span className="text-fail">{role}</span> · required=admin
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Users & Security"
      breadcrumb="ADMINISTER › USERS"
      primaryAction={
        <button className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Invite user
        </button>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper text-[11px] font-mono uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-normal">Name</th>
                <th className="text-left px-4 py-2 font-normal">Role</th>
                <th className="text-left px-4 py-2 font-normal">MFA</th>
                <th className="text-left px-4 py-2 font-normal">Status</th>
                <th className="text-left px-4 py-2 font-normal">Last seen</th>
                <th className="text-right px-4 py-2 font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {USERS.map((u) => (
                <tr key={u.name} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3">{u.role}</td>
                  <td className="px-4 py-3">
                    {u.mfa === null ? <span className="text-muted-foreground font-mono">—</span> :
                     u.mfa ? <StatusBadge status="healthy">on</StatusBadge> :
                     <StatusBadge status="warning">off</StatusBadge>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={u.status}>{u.status === "draft" ? "invited" : "active"}</StatusBadge></td>
                  <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">{u.seen}</td>
                  <td className="px-4 py-3 text-right text-xs text-info">edit ›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-mono text-[11px] text-muted-foreground">EDIT ACCESS</div>
            <h3 className="font-display font-600 text-[15px]">A. Mensah</h3>
            <div className="mt-3 space-y-2 text-sm">
              <SelectRow label="Role" value="Risk Manager" />
              <SelectRow label="Scope" value="My portfolio" />
              <SelectRow label="MFA" value="required" badge="on" />
            </div>
            <div className="mt-4 rounded-md bg-warn-bg text-warn text-xs font-mono px-3 py-2 flex gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Changing role alters data scope. Requires confirmation + step-up auth (NFR-SEC-02 · BR-08).</span>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="h-9 px-4 rounded-md border border-border text-sm">Cancel</button>
              <button className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium">Save changes</button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-display font-600 text-[15px] mb-3">Access audit log</h3>
            <ol className="relative border-l border-border pl-4 space-y-3">
              <Log w="2026-05-02" who="admin" what="role granted: Risk Manager" />
              <Log w="2026-06-01" who="admin" what="MFA reset" />
              <Log w="2026-06-10" who="admin" what="scope widened: All → Region" />
            </ol>
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">SYS-10 · append-only</p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function SelectRow({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
      <span className="text-[11px] font-mono uppercase text-muted-foreground">{label}</span>
      <div className="rounded-md border border-border bg-paper px-3 py-2 flex items-center justify-between">
        <span>{value}</span>
        {badge && <StatusBadge status="healthy">{badge}</StatusBadge>}
      </div>
    </div>
  );
}

function Log({ w, who, what }: { w: string; who: string; what: string }) {
  return (
    <li className="relative">
      <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-info" />
      <div className="text-sm">{what}</div>
      <div className="font-mono text-[11px] text-muted-foreground">{who} · {w}</div>
    </li>
  );
}
