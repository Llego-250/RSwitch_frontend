import { createContext, useContext, type ReactNode } from "react";
import { ROLES, type Role } from "@/lib/roles";
import { useAuth } from "@/context/AuthContext";

type Ctx = { role: Role; roleLabel: string; scope: string };
const RoleCtx = createContext<Ctx | null>(null);

// The active role is whatever the backend says the signed-in user is.
export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role: Role = user?.role ?? "compliance";
  const meta = ROLES.find((r) => r.id === role) || ROLES[0];
  return <RoleCtx.Provider value={{ role, roleLabel: meta.label, scope: meta.scope }}>{children}</RoleCtx.Provider>;
}

export const useRole = () => {
  const ctx = useContext(RoleCtx);
  if (!ctx) throw new Error("useRole must be inside RoleProvider");
  return ctx;
};
