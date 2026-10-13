import React, { useEffect, useState } from "react";
import { Shield, Check, X, Lock } from "lucide-react";
import { ROLES, type Role } from "@/lib/roles";
import type { BackendRole } from "@/lib/types";
import { errorMessage } from "@/lib/api";
import { Button } from "./ui/button";

// The three roles of SRS §4.1, as the backend names them.
export const BACKEND_ROLE: Record<Role, BackendRole> = {
  compliance: "Compliance",
  business: "Business",
  technical: "Technical / Admin",
};

interface RoleAssignmentModalProps {
  user: { id: number; name: string; email: string; role: BackendRole } | null;
  isOpen: boolean;
  onClose: () => void;
  /** REQ-AUTH-009 / REQ-USR-004. Rejects with the API error to show. */
  onSave: (userId: number, newRole: BackendRole) => Promise<unknown>;
}

export const RoleAssignmentModal: React.FC<RoleAssignmentModalProps> = ({ user, isOpen, onClose, onSave }) => {
  const [selectedRole, setSelectedRole] = useState<BackendRole>(user?.role ?? "Compliance");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setSelectedRole(user.role);
    setError(null);
  }, [user]);

  if (!isOpen || !user) return null;

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(user.id, selectedRole);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="role-modal-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-neutral-200">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#E7F5F8] text-[#168FA8]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 id="role-modal-title" className="text-base font-bold text-neutral-900">
                Change role
              </h3>
              <p className="text-xs text-neutral-500">
                {user.name} ({user.email})
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 my-4" role="radiogroup" aria-label="Role">
          {ROLES.map((r) => {
            const value = BACKEND_ROLE[r.id];
            const isSelected = selectedRole === value;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                key={r.id}
                onClick={() => setSelectedRole(value)}
                className={`w-full text-left p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between ${
                  isSelected ? "border-[#168FA8] bg-[#E7F5F8]/60 ring-1 ring-[#168FA8]" : "border-neutral-200 hover:border-neutral-300 bg-white"
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-900">{r.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 font-mono text-neutral-600">{r.scope}</span>
                  </div>
                  <p className="text-xs text-neutral-500">{r.description}</p>
                </div>
                {isSelected && (
                  <div className="p-1 bg-[#168FA8] text-white rounded-full mt-0.5">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center gap-2 text-xs text-neutral-600">
          <Lock className="h-4 w-4 text-neutral-400 shrink-0" />
          <span>The change applies at the user's next request, is recorded in the audit log, and the user is notified.</span>
        </div>
        {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy || selectedRole === user.role} className="bg-[#168FA8] hover:bg-[#0F6F83] text-white">
            {busy ? "Saving…" : "Save role"}
          </Button>
        </div>
      </div>
    </div>
  );
};
