"use client";

import React, { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Check, Tag as TagIcon, Calendar, DollarSign, FileText } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { db, LocalExpense, LocalTag } from "@/lib/offline/db";
import { queueExpenseCreation, queueExpenseUpdate, queueTagCreation } from "@/lib/offline/syncQueue";
import { useAuth } from "@/context/AuthContext";

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
  const userId = user?.id || "local_user";

  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Inline new tag creation state
  const [isCreatingTag, setIsCreatingTag] = useState<boolean>(false);
  const [newTagName, setNewTagName] = useState<string>("");
  const [newTagColor, setNewTagColor] = useState<string>("#22C55E");
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
    setIsCreatingTag(false);
    setNewTagName("");
  }, [initialExpense, isOpen]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    const tagId = `tag_${Date.now()}`;
    const newTag: LocalTag = {
      _id: tagId,
      userId,
      name: newTagName.trim(),
      colorKey: newTagColor,
      createdAt: new Date().toISOString(),
    };

    await queueTagCreation(newTag);
    setSelectedTagIds((prev) => [...prev, tagId]);
    setNewTagName("");
    setIsCreatingTag(false);
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
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting} fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            fullWidth
            className="sm:w-auto"
          >
            {initialExpense ? "Save Changes" : "Record Expense"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Big hero Amount Input */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            Amount
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-2xl sm:text-3xl font-serif-display text-[var(--text-muted)] pointer-events-none">
              $
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
              className="w-full pl-10 pr-4 py-3.5 text-2xl sm:text-3xl font-serif-display text-[var(--text-primary)] bg-white/40 dark:bg-black/30 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder:text-[var(--text-muted)]/40"
            />
          </div>
        </div>

        {/* Date and Note Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>Date</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 text-sm bg-white/40 dark:bg-black/30 border border-white/60 dark:border-white/10 rounded-xl text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>Note / Description</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Weekly grocery haul"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white/40 dark:bg-black/30 border border-white/60 dark:border-white/10 rounded-xl text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder:text-[var(--text-muted)]/60"
            />
          </div>
        </div>

        {/* Categories / Tags Multi-select */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <TagIcon className="w-3.5 h-3.5" />
              <span>Tags (Multi-select)</span>
            </label>
            {!isCreatingTag && (
              <button
                type="button"
                onClick={() => setIsCreatingTag(true)}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 min-h-[32px] px-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Tag</span>
              </button>
            )}
          </div>

          {/* Inline Create Tag form */}
          {isCreatingTag && (
            <div className="p-3 mb-2.5 rounded-2xl glass-light border border-emerald-500/30 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="New tag name (e.g. Subscriptions)"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-white/60 dark:bg-black/40 border border-white/60 dark:border-white/10 outline-none text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  onClick={handleCreateTag}
                  className="px-3 py-1.5 text-xs font-medium bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 active:scale-95 transition-all"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingTag(false)}
                  className="px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)]">Color:</span>
                <div className="flex items-center gap-1.5">
                  {colorPalette.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewTagColor(c)}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        newTagColor === c ? "scale-125 ring-2 ring-emerald-500/60" : "opacity-80"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tag Chips */}
          <div className="flex flex-wrap gap-2 pt-1 max-h-36 overflow-y-auto">
            {tags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag._id);
              return (
                <button
                  key={tag._id}
                  type="button"
                  onClick={() => toggleTag(tag._id)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition-all border ${
                    isSelected
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold shadow-sm"
                      : "bg-white/30 dark:bg-white/5 border-white/50 dark:border-white/10 text-[var(--text-secondary)] hover:bg-white/50 dark:hover:bg-white/10"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: tag.colorKey }}
                  />
                  <span>{tag.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 ml-0.5 stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
