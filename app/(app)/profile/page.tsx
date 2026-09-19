"use client";

import React, { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  User as UserIcon,
  Tag as TagIcon,
  CloudUpload,
  FileSpreadsheet,
  KeyRound,
  Trash2,
  Edit2,
  Plus,
  Check,
  RefreshCw,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Coins,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency, SUPPORTED_CURRENCIES } from "@/context/CurrencyContext";
import { useSync } from "@/lib/offline/useSync";
import { db, LocalTag } from "@/lib/offline/db";
import { queueTagCreation, queueTagDeletion } from "@/lib/offline/syncQueue";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { currency, setCurrency, formatAmount } = useCurrency();
  const { status, pendingCount, lastSyncedAt, syncNow, isSyncing } = useSync();

  // Tags from Dexie
  const tags = useLiveQuery(() => db.tags.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) || [];

  // Count expenses per tag
  const tagUsageCount = useMemo(() => {
    const counts: Record<string, number> = {};
    expenses.forEach((exp) => {
      exp.tagIds?.forEach((tId) => {
        counts[tId] = (counts[tId] || 0) + 1;
      });
    });
    return counts;
  }, [expenses]);

  // Tag creation / editing state
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<LocalTag | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#22C55E");

  // Tag delete confirmation
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);

  // Sheets sync state
  const [isSheetsSyncing, setIsSheetsSyncing] = useState(false);
  const [sheetsMessage, setSheetsMessage] = useState<string | null>(null);

  // Password reset state
  const [isResetRequested, setIsResetRequested] = useState(false);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);

  const colorPalette = [
    "#22C55E",
    "#3B82F6",
    "#F59E0B",
    "#EC4899",
    "#8B5CF6",
    "#14B8A6",
    "#6366F1",
    "#E11D48",
  ];

  const handleOpenTagModal = (tag?: LocalTag) => {
    if (tag) {
      setEditingTag(tag);
      setTagName(tag.name);
      setTagColor(tag.colorKey);
    } else {
      setEditingTag(null);
      setTagName("");
      setTagColor("#22C55E");
    }
    setIsTagModalOpen(true);
  };

  const handleSaveTag = async () => {
    if (!tagName.trim()) return;

    if (editingTag) {
      const updated: LocalTag = { ...editingTag, name: tagName.trim(), colorKey: tagColor };
      await db.tags.put(updated);
    } else {
      const newTag: LocalTag = {
        _id: `tag_${Date.now()}`,
        userId: user?.id || "local_user",
        name: tagName.trim(),
        colorKey: tagColor,
      };
      await queueTagCreation(newTag);
    }

    setIsTagModalOpen(false);
  };

  const handleDeleteTag = async (tagId: string) => {
    await queueTagDeletion(tagId);
    setDeletingTagId(null);
  };

  const handleSyncGoogleSheets = async () => {
    setIsSheetsSyncing(true);
    setSheetsMessage(null);
    try {
      const res = await fetch("/api/export/sheets", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        setSheetsMessage(`Successfully exported! Open spreadsheet: ${data.url}`);
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
    <div className="space-y-6 sm:space-y-8 pb-24 sm:pb-8">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Preferences & Sync Status
        </span>
        <h1 className="text-3xl sm:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight">
          Account <em>Profile</em>
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* User Card */}
        <GlassCard variant="strong" className="lg:col-span-6 p-6 sm:p-7 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-serif-display text-2xl font-bold flex items-center justify-center border border-emerald-500/30 shadow-md">
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
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-emerald-500" />
                <span>Currency & Regional Unit</span>
              </label>
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-serif-display">
                Preview: {formatAmount(14500)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {Object.values(SUPPORTED_CURRENCIES).map((c) => {
                const active = currency === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCurrency(c.code)}
                    className={`min-h-[52px] p-2 rounded-2xl flex flex-col items-center justify-center text-center transition-all cursor-pointer border select-none ${
                      active
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-semibold shadow-sm ring-1 ring-emerald-500/40 scale-[1.02]"
                        : "bg-white/40 dark:bg-black/30 border-black/5 dark:border-white/10 text-[var(--text-secondary)] hover:bg-white/70 dark:hover:bg-white/5 hover:border-emerald-500/30"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-bold font-serif-display">
                      <span className="text-base leading-none">{c.flag}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{c.symbol}</span>
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] font-sans font-medium mt-0.5">
                      {c.code} • {c.name.split(" ")[0]}
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
                  <span>Security & Password</span>
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

        {/* Sync & Integrations Card */}
        <div className="lg:col-span-6 space-y-6">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
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

              <Button
                variant="accent-ghost"
                size="sm"
                onClick={handleSyncGoogleSheets}
                isLoading={isSheetsSyncing}
              >
                Sync Sheets
              </Button>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 text-xs sm:text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Integration:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {user?.sheetsLinked ? "Connected" : "Ready to connect"}
                </span>
              </div>
              {sheetsMessage && (
                <p className="text-xs text-[var(--text-secondary)] bg-white/40 dark:bg-black/40 p-2.5 rounded-xl border border-white/40 dark:border-white/10 break-all">
                  {sheetsMessage}
                </p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Tag Management Section */}
      <GlassCard variant="mid" className="p-6 sm:p-7 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-serif-display font-medium text-[var(--text-primary)]">
              Tag Management
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Organize expense categories and custom colors
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleOpenTagModal()}
            icon={<Plus className="w-4 h-4 stroke-[2.5]" />}
          >
            New Tag
          </Button>
        </div>

        <div className="max-h-72 sm:max-h-80 overflow-y-auto pr-1.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tags.map((tag) => {
            return (
              <div
                key={tag._id}
                className="p-3.5 rounded-2xl glass-light border border-white/50 dark:border-white/10 flex items-center justify-between gap-3 shadow-2xs hover:border-emerald-500/30 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-4 h-4 rounded-full shrink-0 shadow-xs ring-1 ring-black/10 dark:ring-white/20"
                    style={{ backgroundColor: tag.colorKey }}
                  />
                  <p className="font-semibold text-xs sm:text-sm text-[var(--text-primary)] truncate">
                    {tag.name}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleOpenTagModal(tag)}
                    aria-label="Edit tag"
                    title="Edit category"
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingTagId(tag._id)}
                    aria-label="Delete tag"
                    title="Delete category"
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Tag Edit/Create Modal */}
      <Modal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        title={editingTag ? "Edit Category Tag" : "Create New Tag"}
        subtitle="Tags allow you to filter and analyze expenses effortlessly."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsTagModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveTag}>
              Save Tag
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Tag Name
            </label>
            <input
              type="text"
              placeholder="e.g. Subscriptions or Utilities"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              className="w-full px-4 py-3 text-sm font-medium bg-white/80 dark:bg-black/25 border border-black/[0.08] dark:border-white/10 rounded-2xl text-[var(--text-primary)] outline-none focus:ring-3 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white dark:focus:bg-black/40 shadow-xs transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Color Accent
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {colorPalette.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTagColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    tagColor === c ? "scale-125 ring-2 ring-emerald-500" : "opacity-80"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingTagId}
        onClose={() => setDeletingTagId(null)}
        title="Delete Tag?"
        subtitle="This action will remove the tag from associated transactions."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingTagId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deletingTagId && handleDeleteTag(deletingTagId)}
            >
              Confirm Delete
            </Button>
          </>
        }
      >
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs sm:text-sm text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="font-semibold">
              Warning: {tagUsageCount[deletingTagId || ""] || 0} expense(s) currently use this tag.
            </p>
            <p className="mt-1 text-xs opacity-90">
              Deleting this tag will un-tag those expenses, but will not delete the expenses themselves.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
