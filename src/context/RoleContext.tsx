import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ROLES, type Role } from "@/lib/roles";

type Ctx = { role: Role; setRole: (r: Role) => void; roleLabel: string; scope: string };
const RoleCtx = createContext<Ctx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("risk");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("fdi.role") : null;
    if (saved && ROLES.find((r) => r.id === saved)) setRoleState(saved as Role);
  }, []);

  const setRole = (r: Role) => {
    setRoleState(r);
    if (typeof window !== "undefined") localStorage.setItem("fdi.role", r);
  };

  const meta = ROLES.find((r) => r.id === role)!;
  return (
    <RoleCtx.Provider value={{ role, setRole, roleLabel: meta.label, scope: meta.scope }}>
      {children}
    </RoleCtx.Provider>
  );
}

export const useRole = () => {
  const ctx = useContext(RoleCtx);
  if (!ctx) throw new Error("useRole must be inside RoleProvider");
  return ctx;
};
