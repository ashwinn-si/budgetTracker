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
  Download,
  Trash2,
  Share2,
  Copy,
  FileDown,
  Code,
  RotateCcw,
  Archive,
  Receipt,
  PiggyBank,
  Tag as TagIcon,
  History,
  Sparkles
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { db, LocalDeleteLog } from "@/lib/offline/db";
import {
  clearAllLocalExpenses,
  recoverDeletedItem,
  permanentDeleteLog,
  clearAllDeleteLogs
} from "@/lib/offline/syncQueue";

export default function ProfilePage() {
  const { user, logout, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { currency, setCurrency, isDecimal, setIsDecimal, formatAmount } = useCurrency();
  const { status, pendingCount, lastSyncedAt, syncNow, isSyncing } = useAuth().syncStatus;

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
      } else {
        toast.error("Failed to send reset link");
      }
    } catch {
      toast.error("Failed to send reset link");
    }
  };

  const [isClearingDb, setIsClearingDb] = useState(false);
  const [isClearDbModalOpen, setIsClearDbModalOpen] = useState(false);

  const confirmClearDatabase = async () => {

    setIsClearingDb(true);
    try {
      // Pass the Bearer token so this works in all browsers regardless of
      // cookie availability (Safari ITP, Arc, etc.)
      const headers: HeadersInit = { "Content-Type": "application/json" };
      const storedToken =
        typeof window !== "undefined"
          ? sessionStorage.getItem("budget_access_token")
          : null;
      if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;

      const res = await fetch("/api/expenses/clear", { method: "POST", headers });
      if (res.ok) {
        // Clear both Dexie (expenses, savings) AND the sync queue so stale
        // pending items don't re-sync deleted data after the reset.
        await clearAllLocalExpenses();
        // Also clear the last-synced timestamp so the sync indicator resets
        localStorage.removeItem("budget_last_synced");
        toast.success("Database cleared! All expenses and savings have been reset.");
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to clear database.");
      }
    } catch (err) {
      console.error("Failed to clear database:", err);
      toast.error("An error occurred while clearing the database.");
    } finally {
      setIsClearingDb(false);
    }
  };

  // Excel export (same logic as dashboard)
  const [isExporting, setIsExporting] = useState(false);
  const handleExcelExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/export/excel");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budget-export-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // Public Sharing
  const [isSharingLoading, setIsSharingLoading] = useState(false);
  
  const handleToggleSharing = async () => {
    setIsSharingLoading(true);
    try {
      const res = await fetch("/api/user/share", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSharingEnabled: !user?.isSharingEnabled }),
      });
      const data = await res.json();
      if (res.ok) {
        updateUser({ isSharingEnabled: data.isSharingEnabled, shareId: data.shareId });
        toast.success(data.isSharingEnabled ? "Sharing enabled" : "Sharing disabled");
      } else {
        toast.error("Failed to update sharing preferences.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Network error.");
    } finally {
      setIsSharingLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (user?.shareId) {
      navigator.clipboard.writeText(`${window.location.origin}/share/${user.shareId}`);
      toast.success("Link copied!");
    }
  };

  // ── Delete Logs & Recovery State ──
  const rawDeleteLogs = useLiveQuery(() => db.deleteLogs.toArray(), []) || [];
  const [deleteLogFilter, setDeleteLogFilter] = useState<"all" | "expense" | "saving" | "tag">("all");
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [logToDeletePermanently, setLogToDeletePermanently] = useState<LocalDeleteLog | null>(null);
  const [isEmptyBinModalOpen, setIsEmptyBinModalOpen] = useState(false);
  const [isClearingBin, setIsClearingBin] = useState(false);

  // Sync server delete logs on mount
  useEffect(() => {
    let isMounted = true;
    async function syncDeleteLogs() {
      try {
        const storedToken =
          typeof window !== "undefined" ? sessionStorage.getItem("budget_access_token") : null;
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
        const res = await fetch("/api/delete-logs", { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.deleteLogs)) {
            for (const sLog of data.deleteLogs) {
              const logId = sLog._id || sLog.entityId || `del_${sLog.deletedAt}`;
              await db.deleteLogs.put({
                id: logId,
                _id: sLog._id,
                userId: sLog.userId,
                entityType: sLog.entityType,
                entityId: sLog.entityId,
                title: sLog.title,
                details: sLog.details || "",
                data: sLog.data || {},
                deletedAt: typeof sLog.deletedAt === "string" ? sLog.deletedAt : new Date(sLog.deletedAt).toISOString(),
                syncStatus: "synced",
              });
            }
          }
        }
      } catch {
        // Offline fallback
      }
    }
    syncDeleteLogs();
    return () => {
      isMounted = false;
    };
  }, []);

  const sortedDeleteLogs = useMemo(() => {
    const list = [...rawDeleteLogs].sort(
      (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
    );
    if (deleteLogFilter === "all") return list;
    return list.filter((item) => item.entityType === deleteLogFilter);
  }, [rawDeleteLogs, deleteLogFilter]);

  const logCounts = useMemo(() => {
    return {
      all: rawDeleteLogs.length,
      expense: rawDeleteLogs.filter((l) => l.entityType === "expense").length,
      saving: rawDeleteLogs.filter((l) => l.entityType === "saving").length,
      tag: rawDeleteLogs.filter((l) => l.entityType === "tag").length,
    };
  }, [rawDeleteLogs]);

  const formatTimeAgo = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "Just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "Recently";
    }
  };

  const handleRecover = async (log: LocalDeleteLog) => {
    setRecoveringId(log.id);
    try {
      const res = await recoverDeletedItem(log.id);
      if (res.success) {
        const typeLabel =
          log.entityType === "expense"
            ? "Expense"
            : log.entityType === "saving"
            ? "Saving"
            : "Category";
        toast.success(`${typeLabel} restored successfully!`);
      } else {
        toast.error(res.error || "Failed to recover item");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to restore item");
    } finally {
      setRecoveringId(null);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!logToDeletePermanently) return;
    try {
      await permanentDeleteLog(logToDeletePermanently.id);
      toast.success("Record deleted permanently");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete record");
    } finally {
      setLogToDeletePermanently(null);
    }
  };

  const confirmEmptyBin = async () => {
    setIsClearingBin(true);
    try {
      await clearAllDeleteLogs();
      toast.success("Recycle bin emptied");
    } catch (err) {
      console.error(err);
      toast.error("Failed to empty recycle bin");
    } finally {
      setIsClearingBin(false);
      setIsEmptyBinModalOpen(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Preferences &amp; Sync Status
        </span>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight">
          Account <em>Profile</em>
        </h1>
      </div>

      {/* Main grid — items-stretch so both columns are equal height */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── Left: User & Preferences ── */}
        <div className="flex flex-col gap-4">
          {/* Avatar + name */}
          <GlassCard variant="strong" className="p-4 sm:p-6 lg:p-7">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-serif-display text-xl sm:text-2xl font-bold flex items-center justify-center border border-emerald-500/30 shadow-md shrink-0">
                {user?.name ? user.name[0].toUpperCase() : "A"}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-serif-display font-medium text-[var(--text-primary)] truncate">
                  {user?.name || "Alex Morgan"}
                </h2>
                <p className="text-xs sm:text-sm text-[var(--text-muted)] truncate">
                  {user?.email || "alex.morgan@lifestyle.co"}
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Theme selector */}
          <GlassCard variant="strong" className="p-4 sm:p-6 lg:p-7 space-y-4">
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
          </GlassCard>

          {/* Currency & Regional Settings */}
          <GlassCard variant="strong" className="p-4 sm:p-6 lg:p-7 space-y-4">
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
          </GlassCard>

          {/* Decimal Places Setting */}
          <GlassCard variant="strong" className="p-4 sm:p-6 lg:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                  Decimal Places
                </label>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {isDecimal
                    ? "Showing 2 decimal places (e.g. ₹20,000.00)"
                    : "Rounded off without decimal points (e.g. ₹20,000)"}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isDecimal}
                onClick={() => setIsDecimal(!isDecimal)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer focus:outline-none ${
                  isDecimal ? "bg-emerald-500" : "bg-black/20 dark:bg-white/20"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
                    isDecimal ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </GlassCard>

          {/* Password Reset */}
          <GlassCard variant="strong" className="p-4 sm:p-6 lg:p-7 space-y-4">
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

            <div className="pt-4 mt-4 border-t border-black/5 dark:border-white/5">
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
        </div>

        {/* ── Right: Sync & Integrations ── */}
        <div className="space-y-6">
          {/* Export Data Card */}
          <GlassCard variant="mid" className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <FileDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm sm:text-base text-[var(--text-primary)]">
                    Export Data
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Download your full expense ledger as Excel
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExcelExport}
                isLoading={isExporting}
                icon={<Download className="w-3.5 h-3.5" />}
              >
                Export Excel
              </Button>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 text-xs text-[var(--text-muted)] space-y-1">
              <p>Exports all expenses for the current period as an <span className="font-semibold text-amber-600 dark:text-amber-400">.xlsx</span> file.</p>
              <p className="opacity-70">Use this for offline analysis, accountants, or personal archiving.</p>
            </div>
          </GlassCard>
          {/* Offline Sync Status */}
          <GlassCard variant="mid" className="p-4 sm:p-6 space-y-4">
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
          <GlassCard variant="mid" className="p-4 sm:p-6 space-y-4">
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

          {/* Public Dashboard Sharing */}
          <GlassCard variant="mid" className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm sm:text-base text-[var(--text-primary)]">
                    Public Dashboard
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Share a read-only view of your finances
                  </p>
                </div>
              </div>
              <Button
                variant={user?.isSharingEnabled ? "ghost" : "primary"}
                size="sm"
                onClick={handleToggleSharing}
                isLoading={isSharingLoading}
                className={user?.isSharingEnabled ? "text-rose-600 border-rose-500/30 hover:bg-rose-500/10" : "bg-indigo-600 hover:bg-indigo-700 text-white"}
              >
                {user?.isSharingEnabled ? "Disable" : "Enable"}
              </Button>
            </div>

            {user?.isSharingEnabled && user.shareId && (
              <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-3">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Anyone with this link can view your current month's total spending, savings, and category breakdown. They cannot edit your data.
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2.5 rounded-xl bg-white/60 dark:bg-black/40 border border-black/10 dark:border-white/10 text-xs font-mono text-[var(--text-primary)] truncate select-all">
                    {typeof window !== "undefined" ? `${window.location.origin}/share/${user.shareId}` : `/share/${user.shareId}`}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyLink}
                    icon={<Copy className="w-4 h-4" />}
                    className="shrink-0"
                  >
                    Copy
                  </Button>
                </div>
              </div>
            )}
          </GlassCard>

          {/* Database & Data Management */}
          <GlassCard className="p-4 sm:p-6 space-y-4 border-rose-500/20 dark:border-rose-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">Data Reset</h2>
                  <p className="text-xs text-[var(--text-secondary)]">Wipe expenses and savings data</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              If you want to start fresh or remove corrupted/legacy records, this will clear all expenses and savings from both the server database and this device&apos;s local storage. Categories and user accounts are preserved.
            </p>

            <div className="pt-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() => setIsClearDbModalOpen(true)}
                isLoading={isClearingDb}
                className="w-full sm:w-auto"
              >
                Clear Expenses &amp; Savings Database
              </Button>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* ── Full Width: Delete Logs & Data Recovery (Recycle Bin) ── */}
      <GlassCard variant="strong" className="p-4 sm:p-6 lg:p-7 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm border border-emerald-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-serif-display font-medium text-[var(--text-primary)]">
                  Delete Logs &amp; <em>Recovery</em>
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  Recycle Bin
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Accidentally deleted an item? Restore expenses, savings, and categories back to your account anytime.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {rawDeleteLogs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEmptyBinModalOpen(true)}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/20"
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Empty Bin
              </Button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-black/5 dark:border-white/5">
          {[
            { id: "all", label: "All Items", count: logCounts.all },
            { id: "expense", label: "Expenses", count: logCounts.expense },
            { id: "saving", label: "Savings", count: logCounts.saving },
            { id: "tag", label: "Categories", count: logCounts.tag },
          ].map((tab) => {
            const active = deleteLogFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDeleteLogFilter(tab.id as any)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer select-none ${
                  active
                    ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-500/40 font-semibold shadow-xs"
                    : "bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] hover:bg-black/10 dark:hover:bg-white/10 border border-transparent"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    active
                      ? "bg-emerald-600 text-white dark:bg-emerald-500"
                      : "bg-black/10 dark:bg-white/10 text-[var(--text-muted)]"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* List of Archived Items */}
        {sortedDeleteLogs.length === 0 ? (
          <div className="p-8 sm:p-12 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600/70 dark:text-emerald-400/70 flex items-center justify-center">
              <Archive className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Recycle Bin is Empty
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {deleteLogFilter === "all"
                  ? "When you delete transactions or categories, snapshots are saved here so you can recover them at any time."
                  : `No deleted ${deleteLogFilter} records found.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
            {sortedDeleteLogs.map((log) => {
              const isExpense = log.entityType === "expense";
              const isSaving = log.entityType === "saving";
              const isTag = log.entityType === "tag";
              const amountNum = Number(log.data?.amount);
              const hasAmount = !isNaN(amountNum) && (isExpense || isSaving);
              const isRecovering = recoveringId === log.id;

              return (
                <div
                  key={log.id}
                  className="p-3.5 sm:p-4 rounded-2xl bg-white/50 dark:bg-black/30 border border-white/60 dark:border-white/10 hover:border-emerald-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  {/* Item Details */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                        isExpense
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20"
                          : isSaving
                          ? "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/20"
                          : "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20"
                      }`}
                    >
                      {isExpense && <Receipt className="w-5 h-5" />}
                      {isSaving && <PiggyBank className="w-5 h-5" />}
                      {isTag && <TagIcon className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                            isExpense
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                              : isSaving
                              ? "bg-teal-500/15 text-teal-700 dark:text-teal-300"
                              : "bg-purple-500/15 text-purple-700 dark:text-purple-300"
                          }`}
                        >
                          {log.entityType}
                        </span>
                        <h4 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate">
                          {log.title}
                        </h4>
                        {hasAmount && (
                          <span className="text-xs sm:text-sm font-bold font-heading text-[var(--text-primary)]">
                            {formatAmount(amountNum)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] mt-1 flex-wrap">
                        {isSaving && Boolean(log.data?.type) && (
                          <span className="capitalize text-teal-600 dark:text-teal-400 font-medium">
                            {String(log.data?.type)}
                          </span>
                        )}
                        {isTag && typeof log.data?.colorKey === "string" && (
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{ backgroundColor: log.data.colorKey }}
                            />
                            <span>{log.data.colorKey}</span>
                          </span>
                        )}
                        {log.details && (
                          <span className="truncate max-w-[200px]">{log.details}</span>
                        )}
                        <span>•</span>
                        <span className="text-[var(--text-secondary)]">
                          Deleted {formatTimeAgo(log.deletedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button
                      variant="accent-ghost"
                      size="sm"
                      onClick={() => handleRecover(log)}
                      isLoading={isRecovering}
                      icon={<RotateCcw className={`w-3.5 h-3.5 ${isRecovering ? "animate-spin" : ""}`} />}
                      className="text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15"
                    >
                      Recover
                    </Button>
                    <button
                      type="button"
                      onClick={() => setLogToDeletePermanently(log)}
                      title="Permanently Delete"
                      className="p-2 rounded-xl text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
      
      {/* Footer Credit */}
      <div className="pt-8 pb-4 flex justify-center">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/5 dark:bg-white/5 text-xs">
          <span className="font-medium text-[var(--text-secondary)]">Designed & Built by</span>
          <a 
            href="https://github.com/ashwinn-si" 
            target="_blank" 
            rel="noreferrer" 
            className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors group"
          >
            <Code className="w-4 h-4 group-hover:scale-110 transition-transform" />
            ashwinn-si
          </a>
        </div>
      </div>

      {/* Confirmation Modal for Clearing Database */}
      <ConfirmModal
        isOpen={isClearDbModalOpen}
        onClose={() => setIsClearDbModalOpen(false)}
        onConfirm={confirmClearDatabase}
        isLoading={isClearingDb}
        title="Reset All Transactions?"
        message="Are you sure you want to clear all expenses and savings records from both the database and this device? Categories and your account will be preserved."
        confirmText="Clear Everything"
        variant="danger"
      />

      {/* Confirmation Modal for Permanent Delete Single Item */}
      <ConfirmModal
        isOpen={!!logToDeletePermanently}
        onClose={() => setLogToDeletePermanently(null)}
        onConfirm={confirmPermanentDelete}
        title="Delete Record Permanently?"
        message={`Are you sure you want to permanently delete "${logToDeletePermanently?.title}" from the recycle bin? This action cannot be undone.`}
        confirmText="Delete Forever"
        variant="danger"
      />

      {/* Confirmation Modal for Emptying Entire Recycle Bin */}
      <ConfirmModal
        isOpen={isEmptyBinModalOpen}
        onClose={() => setIsEmptyBinModalOpen(false)}
        onConfirm={confirmEmptyBin}
        isLoading={isClearingBin}
        title="Empty Entire Recycle Bin?"
        message="Are you sure you want to permanently delete all archived records in the recycle bin? None of these items will be recoverable."
        confirmText="Empty Recycle Bin"
        variant="danger"
      />
    </div>
  );
}
