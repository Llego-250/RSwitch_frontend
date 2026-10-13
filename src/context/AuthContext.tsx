import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Role } from "@/lib/roles";
import { api, lastActivity, markActivity } from "@/lib/api";
import type { BackendRole, Me } from "@/lib/types";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  roleTitle: string;
  institution: string;
  mfaEnabled: boolean;
  isSenior: boolean;
  /** Password accepted but two-factor must be enrolled before anything else (REQ-AUTH-002). */
  mfaSetupRequired: boolean;
  /** Organisation policy: MFA can't be switched off while true (REQ-SET-003). */
  mfaEnforced: boolean;
  avatarUrl?: string;
  lastLogin?: string;
}

export type LogoutReason = "manual" | "idle" | "expired";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  mfaPending: boolean;
  /** Minutes of inactivity before sign-out (REQ-AUTH-005). */
  sessionTimeoutMinutes: number;
  /** mfaRequired=false means a session is already open (possibly enrolment-only). */
  login: (email: string, pass: string) => Promise<{ mfaRequired: boolean; mfaSetupRequired: boolean }>;
  verifyMfa: (code: string, trustDevice: boolean) => Promise<void>;
  /** Swap the enrolment-only session for the full one returned by /auth/mfa/enable. */
  completeMfaEnrollment: (accessToken: string) => Promise<void>;
  logout: (reason?: LogoutReason, message?: string) => void;
  /** Re-reads /auth/me (after profile or MFA changes). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "rdip_auth_session";
const DEVICES_KEY = "rdip_trusted_devices";
/** Read once by the login page to explain why the user was signed out. */
export const LOGOUT_NOTICE_KEY = "rdip_logout_notice";
const DEFAULT_TIMEOUT = 30;

const ROLE_MAP: Record<BackendRole, Role> = {
  "Technical / Admin": "technical",
  Compliance: "compliance",
  Business: "business",
};

function toProfile(me: Me): UserProfile {
  return {
    id: me.email,
    email: me.email,
    fullName: me.full_name || me.email,
    role: ROLE_MAP[me.role] ?? "business",
    roleTitle: me.role,
    institution: "RSwitch HQ",
    mfaEnabled: me.mfa_enabled,
    isSenior: me.is_senior,
    mfaSetupRequired: me.session_scope === "mfa_setup",
    mfaEnforced: me.mfa_enforced,
    lastLogin: me.last_login_at ?? undefined,
  };
}

type Saved = { user: UserProfile | null; token: string | null; timeout?: number };

function loadSession(): Saved {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to parse saved session", e);
  }
  return { user: null, token: null };
}

// REQ-AUTH-006: per-email device tokens from "Trust this device for 30 days".
function trustedDevices(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DEVICES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveTrustedDevice(email: string, token: string) {
  try {
    localStorage.setItem(DEVICES_KEY, JSON.stringify({ ...trustedDevices(), [email.toLowerCase()]: token }));
  } catch {
    /* storage unavailable: the device just won't be remembered */
  }
}

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll"] as const;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initial] = useState(loadSession);
  const [user, setUser] = useState<UserProfile | null>(initial.user);
  const [token, setToken] = useState<string | null>(initial.token);
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(initial.timeout ?? DEFAULT_TIMEOUT);
  const [mfaPending, setMfaPending] = useState(false);
  // MFA-scoped token from step 1, exchanged for a session token in step 2.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaEmail, setMfaEmail] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (user && token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token, timeout: timeoutMinutes }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user, token, timeoutMinutes]);

  const clearState = useCallback(() => {
    setUser(null);
    setToken(null);
    setMfaToken(null);
    setMfaPending(false);
    localStorage.removeItem(STORAGE_KEY);
    // Nothing fetched for this user may be shown to the next one.
    queryClient.clear();
  }, [queryClient]);

  const logout = useCallback(
    (reason: LogoutReason = "manual", message?: string) => {
      const current = tokenRef.current;
      if (reason !== "manual" && current) {
        const fallback =
          reason === "idle"
            ? `You were signed out after ${timeoutMinutes} minutes of inactivity. Please sign in again.`
            : "Your session has ended. Please sign in again.";
        try {
          sessionStorage.setItem(LOGOUT_NOTICE_KEY, message ?? fallback);
        } catch {
          /* ignore */
        }
      }
      void api.logout(current);
      clearState();
    },
    [clearState, timeoutMinutes],
  );

  // Expired / revoked / idle session anywhere in the app → back to login.
  useEffect(() => {
    const onUnauthorized = (e: Event) => {
      const detail = (e as CustomEvent<{ code?: string; message?: string }>).detail ?? {};
      logout(detail.code === "session_idle" ? "idle" : "expired", detail.message);
    };
    const onSetupRequired = () => setUser((u) => (u ? { ...u, mfaSetupRequired: true } : u));
    // Signed out in another tab.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && !e.newValue) clearState();
    };
    window.addEventListener("rdip:unauthorized", onUnauthorized);
    window.addEventListener("rdip:mfa-setup-required", onSetupRequired);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("rdip:unauthorized", onUnauthorized);
      window.removeEventListener("rdip:mfa-setup-required", onSetupRequired);
      window.removeEventListener("storage", onStorage);
    };
  }, [logout, clearState]);

  const isAuthenticated = !!user && !!token;

  // REQ-AUTH-005: only real interaction counts as activity. Polling requests
  // carry the idle time, so the server doesn't count them either.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onActivity = () => markActivity();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true, capture: true }));
    let lastPing = Date.now();
    const check = () => {
      const now = Date.now();
      if (now - lastActivity() >= timeoutMinutes * 60_000) {
        logout("idle");
        return;
      }
      // Keep the server's inactivity clock in step while the user works
      // without otherwise calling the API.
      if (lastActivity() > lastPing && now - lastPing >= 60_000) {
        lastPing = now;
        api.post("/auth/session/ping").catch(() => undefined);
      }
    };
    check();
    const timer = window.setInterval(check, 10_000);
    return () => {
      window.clearInterval(timer);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity, { capture: true }));
    };
  }, [isAuthenticated, timeoutMinutes, logout]);

  const applyMe = useCallback((me: Me) => {
    setUser(toProfile(me));
    setTimeoutMinutes(me.session_timeout_minutes || DEFAULT_TIMEOUT);
  }, []);

  // Validate a stored session on load and pick up role changes.
  useEffect(() => {
    if (!initial.token) return;
    api
      .get<Me>("/auth/me", initial.token)
      .then(applyMe)
      .catch(() => undefined); // a 401 already triggered logout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSession = async (accessToken: string) => {
    const me = await api.get<Me>("/auth/me", accessToken);
    markActivity();
    applyMe(me);
    setToken(accessToken);
    setMfaToken(null);
    setMfaPending(false);
    try {
      sessionStorage.removeItem(LOGOUT_NOTICE_KEY);
    } catch {
      /* ignore */
    }
  };

  const login = async (email: string, password: string) => {
    const device = trustedDevices()[email.trim().toLowerCase()];
    const result = await api.login(email, password, device);
    if (result.mfa_required) {
      setMfaToken(result.mfa_token);
      setMfaEmail(email.trim().toLowerCase());
      setMfaPending(true);
      return { mfaRequired: true, mfaSetupRequired: false };
    }
    await startSession(result.access_token);
    return { mfaRequired: false, mfaSetupRequired: result.mfa_setup_required };
  };

  const verifyMfa = async (code: string, trustDevice: boolean) => {
    if (!mfaToken) throw new Error("Your sign-in expired. Enter your password again.");
    const result = await api.verifyMfa(mfaToken, code, trustDevice);
    if (result.device_token && mfaEmail) saveTrustedDevice(mfaEmail, result.device_token);
    await startSession(result.access_token);
  };

  const completeMfaEnrollment = async (accessToken: string) => {
    await startSession(accessToken);
  };

  const refreshUser = async () => {
    if (!token) return;
    applyMe(await api.get<Me>("/auth/me", token));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        mfaPending,
        sessionTimeoutMinutes: timeoutMinutes,
        login,
        verifyMfa,
        completeMfaEnrollment,
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
