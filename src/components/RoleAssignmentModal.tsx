import React, { useState } from "react";
import { Shield, Check, X, Lock } from "lucide-react";
import { Role, ROLES } from "@/lib/roles";
import { Button } from "./ui/button";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  institution: string;
  status: "Active" | "Inactive" | "Pending";
}

interface RoleAssignmentModalProps {
  user: UserItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (userId: string, newRole: Role) => void;
}

export const RoleAssignmentModal: React.FC<RoleAssignmentModalProps> = ({
  user,
  isOpen,
  onClose,
  onSave,
}) => {
  const [selectedRole, setSelectedRole] = useState<Role>(user?.role || "compliance");

  if (!isOpen || !user) return null;

  const handleSave = () => {
    onSave(user.id, selectedRole);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-neutral-200">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#E7F5F8] text-[#168FA8]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">Manage User Role & RBAC</h3>
              <p className="text-xs text-neutral-500">{user.name} ({user.email})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 my-4">
          <label className="text-xs font-semibold text-neutral-700">Assign Platform Role</label>
          <div className="space-y-2">
            {ROLES.map((r) => {
              const isSelected = selectedRole === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRole(r.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between ${
                    isSelected
                      ? "border-[#168FA8] bg-[#E7F5F8]/60 ring-1 ring-[#168FA8]"
                      : "border-neutral-200 hover:border-neutral-300 bg-white"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-900">{r.label}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 font-mono text-neutral-600">
                        {r.scope}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">{r.description}</p>
                  </div>
                  {isSelected && (
                    <div className="p-1 bg-[#168FA8] text-white rounded-full mt-0.5">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center gap-2 text-xs text-neutral-600">
          <Lock className="h-4 w-4 text-neutral-400 shrink-0" />
          <span>Role updates take effect immediately and are recorded in the security audit log.</span>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-[#168FA8] hover:bg-[#0F6F83] text-white">
            Save Permissions
          </Button>
        </div>
      </div>
    </div>
  );
};
