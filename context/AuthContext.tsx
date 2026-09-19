"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { clearLocalUserData, seedDemoExpensesForUser, db } from "@/lib/offline/db";
import { pullFromServer } from "@/lib/offline/syncQueue";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  currency?: string;
  sheetsLinked?: boolean;
  sheetsSpreadsheetId?: string | null;
  sheetsLastSyncedAt?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Helper to handle user session initialization and storage isolation
  const handleUserSession = useCallback(async (newUser: AuthUser) => {
    const previousUserId = localStorage.getItem("budget_active_user_id");
    if (previousUserId && previousUserId !== newUser.id) {
      // Switched account: wipe previous user's cached offline data
      await clearLocalUserData();
    }
    localStorage.setItem("budget_active_user_id", newUser.id);
    localStorage.setItem("budget_local_user", JSON.stringify(newUser));

    // If demo user (user@gmail.com), ensure demo expenses exist in local Dexie
    if (newUser.email.toLowerCase() === "user@gmail.com") {
      const expCount = await db.expenses.count();
      if (expCount === 0) {
        await seedDemoExpensesForUser(newUser.id);
      }
    }

    // Pull real user transactions from server
    await pullFromServer();
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
          await handleUserSession(data.user);
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
      await handleUserSession(data.user);
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
      await handleUserSession(data.user);
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

    // Clear local storage and IndexedDB to avoid leaking data to another user
    localStorage.removeItem("budget_local_user");
    localStorage.removeItem("budget_active_user_id");
    localStorage.removeItem("budget_last_synced");
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
