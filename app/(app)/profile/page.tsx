"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CloudUpload,
  FileSpreadsheet,
  KeyRound,
  RefreshCw,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  ExternalLink,
  Coins,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { useSync } from "@/lib/offline/useSync";

export default function ProfilePage() {
  const { user, logout, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { currency, setCurrency, formatAmount } = useCurrency();
  const { status, pendingCount, lastSyncedAt, syncNow, isSyncing } = useSync();

  // Sheets sync state
  const [isSheetsSyncing, setIsSheetsSyncing] = useState(false);
  const [sheetsMessage, setSheetsMessage] = useState<string | null>(null);
  const [sheetsUrl, setSheetsUrl] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("budget_sheets_url") || null;
    }
    return null;
  });

  const activeSheetsUrl = useMemo(() => {
    if (user?.sheetsSpreadsheetId) {
      return `https://docs.google.com/spreadsheets/d/${user.sheetsSpreadsheetId}`;
    }
    return sheetsUrl;
  }, [user?.sheetsSpreadsheetId, sheetsUrl]);

  // Keep sheetsUrl and AuthUser synced with latest database info
  useEffect(() => {
    let isMounted = true;
    async function loadSheetsInfo() {
      try {
        const res = await fetch("/api/export/sheets");
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.url) {
          setSheetsUrl(data.url);
          if (typeof window !== "undefined") {
            localStorage.setItem("budget_sheets_url", data.url);
          }
          if (updateUser && data.spreadsheetId) {
            updateUser({
              sheetsLinked: Boolean(data.linked),
              sheetsSpreadsheetId: data.spreadsheetId,
              sheetsLastSyncedAt: data.lastSyncedAt,
            });
          }
        }
      } catch {
        // Ignore offline / fetch errors
      }
    }
    loadSheetsInfo();
    return () => {
      isMounted = false;
    };
  }, [updateUser]);

  // Password reset state
  const [isResetRequested, setIsResetRequested] = useState(false);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);

  const handleSyncGoogleSheets = async () => {
    setIsSheetsSyncing(true);
    setSheetsMessage(null);
    try {
      const res = await fetch("/api/export/sheets", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        setSheetsUrl(data.url);
        if (typeof window !== "undefined") {
          localStorage.setItem("budget_sheets_url", data.url);
        }
        if (updateUser && data.spreadsheetId) {
          updateUser({
            sheetsLinked: true,
            sheetsSpreadsheetId: data.spreadsheetId,
            sheetsLastSyncedAt: data.lastSyncedAt,
          });
        }
        setSheetsMessage("Spreadsheet synced successfully!");
      } else {
        setSheetsMessage(data.error || "Please log in with Google to sync to your Drive Sheet.");
      }
    } catch {
      setSheetsMessage("Could not contact server to sync with Google Sheets.");
    } finally {
      setIsSheetsSyncing(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email || "alex.morgan@lifestyle.co" }),
      });
      const data = await res.json();
      setIsResetRequested(true);
      if (data.devResetUrl) {
        setDevResetLink(data.devResetUrl);
      }
    } catch {
      alert("Failed to send reset link");
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Preferences &amp; Sync Status
        </span>
        <h1 className="text-3xl sm:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight">
          Account <em>Profile</em>
        </h1>
      </div>

      {/* Main grid — items-stretch so both columns are equal height */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── Left: User & Preferences ── */}
        <GlassCard variant="strong" className="p-6 sm:p-7 space-y-6 h-full">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-serif-display text-2xl font-bold flex items-center justify-center border border-emerald-500/30 shadow-md shrink-0">
              {user?.name ? user.name[0].toUpperCase() : "A"}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-serif-display font-medium text-[var(--text-primary)] truncate">
                {user?.name || "Alex Morgan"}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-muted)] truncate">
                {user?.email || "alex.morgan@lifestyle.co"}
              </p>
            </div>
          </div>

          {/* Theme selector */}
          <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Appearance Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "light", label: "Light", icon: Sun },
                { id: "dark", label: "Dark", icon: Moon },
                { id: "system", label: "System", icon: Laptop },
              ].map((t) => {
                const Icon = t.icon;
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id as any)}
                    className={`min-h-[44px] flex items-center justify-center gap-2 rounded-2xl text-xs font-medium border transition-all ${
                      active
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold shadow-sm"
                        : "bg-white/40 dark:bg-black/30 border-white/50 dark:border-white/10 text-[var(--text-secondary)] hover:bg-white/60"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Currency & Regional Settings */}
          <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 whitespace-nowrap">
                <Coins className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Currency &amp; Regional Unit</span>
              </label>
              <div className="self-start sm:self-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-serif-display whitespace-nowrap shadow-2xs">
                <span className="text-[10px] uppercase font-sans font-medium text-emerald-600/70 dark:text-emerald-400/70">
                  Preview:
                </span>
                <span className="font-semibold">{formatAmount(14500)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {Object.values(SUPPORTED_CURRENCIES).map((c) => {
                const active = currency === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCurrency(c.code)}
                    className={`min-h-[54px] py-2 px-1 rounded-2xl flex flex-col items-center justify-center text-center transition-all cursor-pointer border select-none ${
                      active
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-semibold shadow-sm ring-1 ring-emerald-500/40 scale-[1.01]"
                        : "bg-white/40 dark:bg-black/30 border-black/5 dark:border-white/10 text-[var(--text-secondary)] hover:bg-white/70 dark:hover:bg-white/5 hover:border-emerald-500/30"
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1.5 text-sm font-bold font-serif-display leading-none">
                      <span className="text-base leading-none">{c.flag}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{c.symbol}</span>
                    </span>
                    <span className="text-[10.5px] sm:text-[11px] text-[var(--text-muted)] font-sans font-medium mt-1 truncate w-full px-1 text-center whitespace-nowrap leading-tight">
                      {c.code} • {c.shortName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Password Reset */}
          <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-emerald-500" />
                  <span>Security &amp; Password</span>
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Dispatch a secure reset token link.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRequestPasswordReset}
              >
                Reset
              </Button>
            </div>

            {isResetRequested && (
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Reset link generated!</span>
                </div>
                {devResetLink && (
                  <div className="text-[11px] text-[var(--text-muted)] break-all pt-1">
                    Dev Link: <a href={devResetLink} className="underline text-emerald-600 dark:text-emerald-400">{devResetLink}</a>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-2">
            <Button
              variant="danger"
              size="sm"
              fullWidth
              onClick={() => logout()}
            >
              Sign Out
            </Button>
          </div>
        </GlassCard>

        {/* ── Right: Sync & Integrations ── */}
        <div className="space-y-6">
          {/* Offline Sync Status */}
          <GlassCard variant="mid" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CloudUpload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm sm:text-base text-[var(--text-primary)]">
                    Offline Sync Status
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    IndexedDB Dexie background reconciliation
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => syncNow()}
                isLoading={isSyncing}
                icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />}
              >
                Sync Now
              </Button>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-[var(--text-secondary)]">Queue Status:</span>
                <span className="font-semibold capitalize text-emerald-600 dark:text-emerald-400">
                  {status === "synced"
                    ? "All Synced"
                    : status === "syncing"
                    ? "Syncing in background…"
                    : `${pendingCount} item(s) pending`}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-[var(--text-secondary)]">Last Synced:</span>
                <span className="text-[var(--text-muted)]">
                  {lastSyncedAt ? lastSyncedAt.toLocaleTimeString() : "Recent"}
                </span>
              </div>
            </div>
          </GlassCard>

          {/* Google Sheets Sync Card */}
          <GlassCard variant="mid" className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm sm:text-base text-[var(--text-primary)]">
                    Google Sheets Sync
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Export your ledger to your Google Drive Sheet
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {activeSheetsUrl && (
                  <a
                    href={activeSheetsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  >
                    <span>Open Sheet</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <Button
                  variant="accent-ghost"
                  size="sm"
                  onClick={handleSyncGoogleSheets}
                  isLoading={isSheetsSyncing}
                >
                  Sync Sheets
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 text-xs sm:text-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Integration:</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {user?.sheetsLinked || activeSheetsUrl ? "Connected" : "Ready to connect"}
                </span>
              </div>

              {user?.sheetsLastSyncedAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Last Synced:</span>
                  <span className="text-[var(--text-muted)]">
                    {new Date(user.sheetsLastSyncedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}

              {activeSheetsUrl ? (
                <div className="pt-2.5 border-t border-black/5 dark:border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] font-medium">Spreadsheet Link:</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wider">
                      Live Google Drive
                    </span>
                  </div>

                  <div className="p-2.5 sm:p-3 rounded-xl bg-white/60 dark:bg-black/40 border border-white/60 dark:border-white/10 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="min-w-0 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <a
                        href={activeSheetsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:underline truncate"
                        title={activeSheetsUrl}
                      >
                        {activeSheetsUrl}
                      </a>
                    </div>

                    <a
                      href={activeSheetsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                      id="open-spreadsheet-btn"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Spreadsheet Link:</span>
                  <span>Not exported yet. Click &ldquo;Sync Sheets&rdquo; to create.</span>
                </div>
              )}

              {sheetsMessage && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-2">
                  <span className="truncate">{sheetsMessage}</span>
                  <button
                    type="button"
                    onClick={() => setSheetsMessage(null)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs font-medium cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
