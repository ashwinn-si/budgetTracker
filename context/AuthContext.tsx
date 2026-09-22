"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { clearLocalUserData, db } from "@/lib/offline/db";
import { pullFromServer } from "@/lib/offline/syncQueue";
import { useSync } from "@/lib/offline/useSync";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  currency?: string;
  sheetsLinked?: boolean;
  sheetsSpreadsheetId?: string | null;
  sheetsLastSyncedAt?: string | null;
  isSharingEnabled?: boolean;
  shareId?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
  /** Sync state exposed so consumers (e.g. Profile page) can read status */
  syncStatus: ReturnType<typeof useSync>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// sessionStorage helpers — keeps the access token across same-tab page reloads
// without exposing it to other tabs (unlike localStorage).
// ---------------------------------------------------------------------------
function persistAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      sessionStorage.setItem("budget_access_token", token);
    } else {
      sessionStorage.removeItem("budget_access_token");
    }
  } catch {
    // sessionStorage may be unavailable in private/restricted contexts
  }
}

function readPersistedAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("budget_access_token");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Initialise from sessionStorage so sync has a token immediately on mount,
  // even before the silent-refresh response comes back.
  const [accessToken, setAccessToken] = useState<string | null>(readPersistedAccessToken);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Keep sessionStorage in sync whenever the in-memory token changes
  useEffect(() => {
    persistAccessToken(accessToken);
  }, [accessToken]);

  // Pass the live access token into useSync so every sync/pull request carries
  // the Authorization header — this makes sync work in all browsers regardless
  // of cookie support (Safari ITP, Arc incognito, etc.).
  const syncStatus = useSync({ accessToken });

  // Helper to handle user session initialization and storage isolation
  const handleUserSession = useCallback(async (newUser: AuthUser, token: string | null) => {
    const previousUserId = localStorage.getItem("budget_active_user_id");
    if (previousUserId && previousUserId !== newUser.id) {
      // Switched account: wipe previous user's cached offline data
      await clearLocalUserData();
    }
    localStorage.setItem("budget_active_user_id", newUser.id);
    localStorage.setItem("budget_local_user", JSON.stringify(newUser));

    // Pull real user transactions from server, passing the token so the
    // fetch carries the Authorization header.
    await pullFromServer(token);
  }, []);

  // Silent auto-login via access/refresh tokens on app load
  useEffect(() => {
    const silentRefresh = async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setAccessToken(data.accessToken);
          await handleUserSession(data.user, data.accessToken);
        } else {
          setUser(null);
          setAccessToken(null);
          localStorage.removeItem("budget_local_user");
        }
      } catch {
        setUser(null);
        setAccessToken(null);
        localStorage.removeItem("budget_local_user");
      } finally {
        setIsLoading(false);
      }
    };

    silentRefresh();
  }, [handleUserSession]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Login failed" };
      }
      setUser(data.user);
      setAccessToken(data.accessToken);
      await handleUserSession(data.user, data.accessToken);
      return { success: true };
    } catch {
      return { success: false, error: "Network error during login" };
    }
  }, [handleUserSession]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Registration failed" };
      }
      setUser(data.user);
      setAccessToken(data.accessToken);
      await handleUserSession(data.user, data.accessToken);
      return { success: true };
    } catch {
      return { success: false, error: "Network error during registration" };
    }
  }, [handleUserSession]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    // Clear in-memory state
    setUser(null);
    setAccessToken(null);

    // Clear local storage, sessionStorage and IndexedDB to avoid leaking data to another user
    localStorage.removeItem("budget_local_user");
    localStorage.removeItem("budget_active_user_id");
    localStorage.removeItem("budget_last_synced");
    localStorage.removeItem("budget_active_trip_id");
    persistAccessToken(null);
    await clearLocalUserData();

    try {
      const { signOut } = await import("next-auth/react");
      await signOut({ redirect: false });
    } catch {
      // Ignore next-auth signOut errors
    }
  }, []);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      localStorage.setItem("budget_local_user", JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        login,
        register,
        logout,
        updateUser,
        syncStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
