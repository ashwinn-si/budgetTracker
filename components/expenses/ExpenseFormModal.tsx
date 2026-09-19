"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  Check,
  Tag as TagIcon,
  Calendar,
  DollarSign,
  FileText,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { db, LocalExpense, LocalTag } from "@/lib/offline/db";
import { queueExpenseCreation, queueExpenseUpdate, queueTagCreation } from "@/lib/offline/syncQueue";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";

const PRESET_TAG_COLORS = [
  "#22C55E", // Emerald
  "#3B82F6", // Blue
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#8B5CF6", // Purple
  "#14B8A6", // Teal
  "#06B6D4", // Cyan
  "#F43F5E", // Rose
  "#6366F1", // Indigo
  "#F97316", // Orange
];

interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialExpense?: LocalExpense | null;
  onSaved?: () => void;
}

export function ExpenseFormModal({
  isOpen,
  onClose,
  initialExpense,
  onSaved,
}: ExpenseFormModalProps) {
  const { user } = useAuth();
  const { currencyInfo } = useCurrency();
  const userId = user?.id || "local_user";

  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Search or quick-create category query
  const [tagSearchQuery, setTagSearchQuery] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Live tags from Dexie
  const tags = useLiveQuery(() => db.tags.toArray(), []) || [];

  useEffect(() => {
    if (initialExpense) {
      setAmount(initialExpense.amount.toString());
      setNote(initialExpense.note || "");
      setDate(initialExpense.date ? initialExpense.date.split("T")[0] : new Date().toISOString().split("T")[0]);
      setSelectedTagIds(initialExpense.tagIds || []);
    } else {
      setAmount("");
      setNote("");
      setDate(new Date().toISOString().split("T")[0]);
      setSelectedTagIds([]);
    }
    setTagSearchQuery("");
  }, [initialExpense, isOpen]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // Filter tags dynamically as user types
  const filteredTags = useMemo(() => {
    const q = tagSearchQuery.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, tagSearchQuery]);

  // Check if what is typed already exists
  const exactMatchExists = useMemo(() => {
    const q = tagSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return tags.some((t) => t.name.toLowerCase() === q);
  }, [tags, tagSearchQuery]);

  // Quick create category on the fly without confusing color subforms
  const handleQuickCreateTag = async (nameToCreate?: string) => {
    const name = (nameToCreate || tagSearchQuery).trim();
    if (!name) return;

    // Check if tag already exists (case-insensitive)
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selectedTagIds.includes(existing._id)) {
        setSelectedTagIds((prev) => [...prev, existing._id]);
      }
      setTagSearchQuery("");
      return;
    }

    const randomColor = PRESET_TAG_COLORS[Math.floor(Math.random() * PRESET_TAG_COLORS.length)];
    const tagId = `tag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newTag: LocalTag = {
      _id: tagId,
      userId,
      name,
      colorKey: randomColor,
    };

    await queueTagCreation(newTag);
    setSelectedTagIds((prev) => [...prev, tagId]);
    setTagSearchQuery("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Please enter a valid amount greater than 0");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();

      if (initialExpense) {
        const updatedExpense: LocalExpense = {
          ...initialExpense,
          amount: parsedAmount,
          note: note.trim(),
          tagIds: selectedTagIds,
          date,
          updatedAt: now,
          syncStatus: "pending",
        };
        await queueExpenseUpdate(updatedExpense);
      } else {
        const newExpense: LocalExpense = {
          clientId: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          userId,
          amount: parsedAmount,
          note: note.trim(),
          tagIds: selectedTagIds,
          date,
          createdAt: now,
          updatedAt: now,
          syncStatus: "pending",
        };
        await queueExpenseCreation(newExpense);
      }

      onSaved?.();
      onClose();
    } catch (err) {
      console.error("Save expense error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const colorPalette = [
    "#22C55E", // Emerald
    "#3B82F6", // Blue
    "#F59E0B", // Amber
    "#EC4899", // Pink
    "#8B5CF6", // Purple
    "#14B8A6", // Teal
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialExpense ? "Edit Expense" : "Record Expense"}
      subtitle="Track your daily transactions with immediate offline resilience."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
            fullWidth
            className="sm:w-auto px-5 bg-white/70 dark:bg-white/10 border-black/10 dark:border-white/10 shadow-xs"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            fullWidth
            className="sm:w-auto px-6 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-500/30"
          >
            {initialExpense ? "Save Changes" : "Record Expense"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hero Amount Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-black/25 border border-emerald-500/30 dark:border-emerald-500/20 shadow-xs focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/15 focus-within:bg-white dark:focus-within:bg-black/40 transition-all">
          <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Amount</span>
          </label>
          <div className="flex items-center">
            <span className="text-3xl sm:text-4xl font-serif-display font-bold text-emerald-600 dark:text-emerald-400 mr-2 select-none">
              {currencyInfo.symbol}
            </span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
              className="w-full text-3xl sm:text-4xl font-serif-display font-bold text-[var(--text-primary)] bg-transparent outline-none placeholder:text-[var(--text-muted)]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>

        {/* Date and Note Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Date</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 text-sm font-medium bg-white/80 dark:bg-black/25 border border-black/[0.08] dark:border-white/10 rounded-2xl text-[var(--text-primary)] outline-none focus:ring-3 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white dark:focus:bg-black/40 shadow-xs transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Note / Description</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Weekly grocery haul"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-4 py-3 text-sm bg-white/80 dark:bg-black/25 border border-black/[0.08] dark:border-white/10 rounded-2xl text-[var(--text-primary)] outline-none focus:ring-3 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white dark:focus:bg-black/40 placeholder:text-[var(--text-muted)]/50 shadow-xs transition-all"
            />
          </div>
        </div>

        {/* Categories / Tags Section */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                <TagIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Categories</span>
              </label>
              {selectedTagIds.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  {selectedTagIds.length} selected
                </span>
              )}
            </div>

            {selectedTagIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTagIds([])}
                className="text-[11px] font-medium text-[var(--text-muted)] hover:text-rose-500 transition-colors cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Quick Tag Search / Create Combobox Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Find or type a new category..."
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!exactMatchExists) {
                    handleQuickCreateTag();
                  }
                }
              }}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/25 border border-black/[0.08] dark:border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all shadow-xs"
            />
            {tagSearchQuery && (
              <button
                type="button"
                onClick={() => setTagSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 rounded-md cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Tag Pills & Create Action */}
          <div className="flex flex-wrap gap-1.5 pt-0.5 max-h-36 overflow-y-auto pr-1">
            {/* If query has no exact match, show instant creation badge! */}
            {!exactMatchExists && tagSearchQuery.trim() && (
              <button
                type="button"
                onClick={() => handleQuickCreateTag()}
                className="min-h-[34px] px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1.5 shadow-md shadow-emerald-500/25 transition-all cursor-pointer animate-pulse"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Create &quot;{tagSearchQuery.trim()}&quot;</span>
              </button>
            )}

            {filteredTags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag._id);
              const color = tag.colorKey || "#22C55E";

              return (
                <button
                  key={tag._id}
                  type="button"
                  onClick={() => toggleTag(tag._id)}
                  className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition-all cursor-pointer select-none ${
                    isSelected
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-sm shadow-emerald-500/30 border border-transparent scale-[1.02]"
                      : "bg-white/70 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/10 text-[var(--text-secondary)] hover:bg-white dark:hover:bg-white/10 hover:border-emerald-500/40 shadow-2xs"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/20"
                    style={{ backgroundColor: color }}
                  />
                  <span>{tag.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 ml-0.5 stroke-[2.5]" />}
                </button>
              );
            })}

            {filteredTags.length === 0 && exactMatchExists && (
              <p className="text-xs text-[var(--text-muted)] py-2 italic">
                No matching categories found.
              </p>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
