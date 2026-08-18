import React, { createContext, useContext, useState, useEffect } from "react";
import { Role } from "@/lib/roles";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  roleTitle: string;
  institution: string;
  mfaEnabled: boolean;
  avatarUrl?: string;
  lastLogin?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  mfaPending: boolean;
  login: (email: string, pass: string) => Promise<{ mfaRequired: boolean }>;
  verifyMfa: (code: string, trustDevice?: boolean) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  enableMfa: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "rdip_auth_session";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.user;
      } catch (e) {
        console.error("Failed to parse saved session", e);
      }
    }
    // Default demo user
    return {
      id: "usr-001",
      email: "admin@rswitch.rw",
      fullName: "Clarisse Keza",
      role: "technical",
      roleTitle: "Technical Admin",
      institution: "RSwitch HQ",
      mfaEnabled: true,
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
      lastLogin: new Date().toISOString(),
    };
  });

  const [token, setToken] = useState<string | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved).token;
      } catch (e) {
        return null;
      }
    }
    return "mock-jwt-access-token-jwt-secret-xyz123";
  });

  const [mfaPending, setMfaPending] = useState(false);

  useEffect(() => {
    if (user && token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user, token]);

  const [pendingEmail, setPendingEmail] = useState<string>("clarisse.keza@rswitch.rw");

  const login = async (emailStr: string, _pass: string) => {
    // Simulated API JWT Request
    await new Promise((res) => setTimeout(res, 600));
    setPendingEmail(emailStr);
    setMfaPending(true);
    return { mfaRequired: true };
  };

  const verifyMfa = async (code: string, _trustDevice = false) => {
    await new Promise((res) => setTimeout(res, 500));
    if (code.length === 6) {
      const emailVal = pendingEmail || "clarisse.keza@rswitch.rw";
      const authenticatedUser: UserProfile = {
        id: "usr-" + Math.floor(Math.random() * 1000),
        email: emailVal,
        fullName: emailVal.split("@")[0].replace(".", " "),
        role: emailVal.includes("admin") ? "technical" : emailVal.includes("compliance") ? "compliance" : "business",
        roleTitle: emailVal.includes("admin") ? "Technical Admin" : "Compliance Officer",
        institution: "RSwitch Network",
        mfaEnabled: true,
        lastLogin: new Date().toISOString(),
      };
      setUser(authenticatedUser);
      setToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkNsYXJpc3NlIEtlemEiLCJpYXQiOjE1MTYyMzkwMjJ9.mockToken");
      setMfaPending(false);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setMfaPending(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const enableMfa = () => {
    setUser((prev) => (prev ? { ...prev, mfaEnabled: true } : null));
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
        updateProfile,
        enableMfa,
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
