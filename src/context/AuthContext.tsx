import React, { createContext, useContext, useState, useEffect } from "react";
import { Role } from "@/lib/roles";
import { api } from "@/lib/api";
import type { BackendRole, Me } from "@/lib/types";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  roleTitle: string;
  institution: string;
  mfaEnabled: boolean;
  participantId: number | null;
  avatarUrl?: string;
  lastLogin?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  mfaPending: boolean;
  /** mfaRequired=false means the session is already open. */
  login: (email: string, pass: string) => Promise<{ mfaRequired: boolean; isParticipant: boolean; mfaSetupRequired: boolean }>;
  verifyMfa: (code: string) => Promise<{ isParticipant: boolean }>;
  logout: () => void;
  /** Re-reads /auth/me (after profile or MFA changes). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "rdip_auth_session";

// The backend has five roles; the UI permission matrix (lib/roles) has three.
const ROLE_MAP: Record<BackendRole, Role> = {
  "Technical / Admin": "technical",
  Compliance: "compliance",
  Business: "business",
  Board: "business",
  Participant: "business",
};

function toProfile(me: Me): UserProfile {
  return {
    id: me.email,
    email: me.email,
    fullName: me.full_name || me.email,
    role: ROLE_MAP[me.role] ?? "business",
    roleTitle: me.role,
    institution: me.participant_id ? `Participant #${me.participant_id}` : "RSwitch HQ",
    mfaEnabled: me.mfa_enabled,
    participantId: me.participant_id,
    lastLogin: me.last_login_at ?? undefined,
  };
}

function loadSession(): { user: UserProfile | null; token: string | null } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to parse saved session", e);
  }
  return { user: null, token: null };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => loadSession().user);
  const [token, setToken] = useState<string | null>(() => loadSession().token);
  const [mfaPending, setMfaPending] = useState(false);
  // MFA-scoped token from step 1, exchanged for a session token in step 2.
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  useEffect(() => {
    if (user && token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user, token]);

  const logout = () => {
    setUser(null);
    setToken(null);
    setMfaToken(null);
    setMfaPending(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Expired/invalid token anywhere in the app → back to login.
  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener("rdip:unauthorized", onUnauthorized);
    return () => window.removeEventListener("rdip:unauthorized", onUnauthorized);
  }, []);

  const startSession = async (accessToken: string) => {
    const me = await api.get<Me>("/auth/me", accessToken);
    const profile = toProfile(me);
    setUser(profile);
    setToken(accessToken);
    setMfaToken(null);
    setMfaPending(false);
    return profile;
  };

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    if (result.mfa_required) {
      setMfaToken(result.mfa_token);
      setMfaPending(true);
      return { mfaRequired: true, isParticipant: false, mfaSetupRequired: false };
    }
    const profile = await startSession(result.access_token);
    return { mfaRequired: false, isParticipant: profile.participantId != null, mfaSetupRequired: result.mfa_setup_required };
  };

  const verifyMfa = async (code: string) => {
    if (!mfaToken) throw new Error("Your sign-in expired. Enter your password again.");
    const profile = await startSession(await api.verifyMfa(mfaToken, code));
    return { isParticipant: profile.participantId != null };
  };

  const refreshUser = async () => {
    if (!token) return;
    const me = await api.get<Me>("/auth/me", token);
    setUser(toProfile(me));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        mfaPending,
        login,
        verifyMfa,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
