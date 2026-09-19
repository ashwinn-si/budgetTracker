"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db, LocalTag } from "@/lib/offline/db";
import { queueTagCreation, queueTagDeletion } from "@/lib/offline/syncQueue";
import { useCurrency } from "@/context/CurrencyContext";
import { useAuth } from "@/context/AuthContext";
import {
  Tags as TagsIcon,
  Plus,
  Trash2,
  ReceiptText,
  Sparkles,
  TrendingUp,
  FolderOpen,
  ArrowRight,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const PRESET_COLORS = [
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

export default function TagsPage() {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();

  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  // Live query from local Dexie database
  const allTags = useLiveQuery(() => db.tags.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];

  // Compute stats per tag
  const tagStats = useMemo(() => {
    const counts: Record<string, number> = {};
    const totals: Record<string, number> = {};

    allExpenses.forEach((exp) => {
      if (Array.isArray(exp.tagIds)) {
        exp.tagIds.forEach((tagId) => {
          counts[tagId] = (counts[tagId] || 0) + 1;
          totals[tagId] = (totals[tagId] || 0) + (Number(exp.amount) || 0);
        });
      }
    });

    return { counts, totals };
  }, [allExpenses]);

  // Overall metrics
  const totalTags = allTags.length;
  const topTag = useMemo(() => {
    if (allTags.length === 0) return null;
    let max = -1;
    let top: LocalTag | null = null;
    allTags.forEach((t) => {
      const count = tagStats.counts[t._id] || 0;
      if (count > max) {
        max = count;
        top = t;
      }
    });
    return max > 0 ? top : null;
  }, [allTags, tagStats]);

  const handleCreateTag = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setError("Please enter a category name.");
      return;
    }

    const exists = allTags.some(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setError("A category with this name already exists.");
      return;
    }

    try {
      const newTag: LocalTag = {
        _id: `tag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: user?.id || "local_user",
        name: trimmed,
        colorKey: selectedColor,
      };

      await queueTagCreation(newTag);
      setNewTagName("");
      setIsCreating(false);
      setError(null);
    } catch (err) {
      console.error("Failed to create tag:", err);
      setError("Could not save category. Please try again.");
    }
  };

  const handleDeleteTag = async (tagId: string, name: string) => {
    if (
      confirm(
        `Are you sure you want to delete "${name}"? This will untag associated expenses.`
      )
    ) {
      try {
        await queueTagDeletion(tagId);
      } catch (err) {
        console.error("Failed to delete tag:", err);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Organize &amp; Classify
          </span>
          <h1 className="text-3xl sm:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight">
            Tags &amp; <em>Categories</em>
          </h1>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            setNewTagName("");
            setError(null);
            setSelectedColor(PRESET_COLORS[0]);
            setIsCreating(true);
          }}
          icon={<Plus className="w-4 h-4 stroke-[2.5]" />}
          className="shadow-emerald-500/20 shadow-lg shrink-0"
        >
          Add Category
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Categories */}
        <div className="p-5 rounded-3xl glass-card bg-white/80 dark:bg-white/[0.04] border border-white/80 dark:border-white/10 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <TagsIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">
              Total Categories
            </p>
            <p className="text-2xl font-bold font-heading text-[var(--text-primary)] mt-0.5">
              {totalTags}
            </p>
          </div>
        </div>

        {/* Most Active Category */}
        <div className="p-5 rounded-3xl glass-card bg-white/80 dark:bg-white/[0.04] border border-white/80 dark:border-white/10 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">
              Most Active
            </p>
            <p className="text-lg font-bold font-heading text-[var(--text-primary)] mt-0.5 truncate">
              {topTag ? (topTag as LocalTag).name : "None yet"}
            </p>
          </div>
        </div>

        {/* Total Expenses Tagged */}
        <div className="p-5 rounded-3xl glass-card bg-white/80 dark:bg-white/[0.04] border border-white/80 dark:border-white/10 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <ReceiptText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">
              Tagged Expenses
            </p>
            <p className="text-2xl font-bold font-heading text-[var(--text-primary)] mt-0.5">
              {allExpenses.length}
            </p>
          </div>
        </div>
      </div>

      {/* Category Tag Create Modal / Drawer */}
      <Modal
        isOpen={isCreating}
        onClose={() => {
          setIsCreating(false);
          setError(null);
        }}
        title="New Category Tag"
        subtitle="Create a category tag to organize and analyze your spending."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setIsCreating(false);
                setError(null);
              }}
              fullWidth
              className="sm:w-auto px-5 bg-white/70 dark:bg-white/10 border-black/10 dark:border-white/10 shadow-xs"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => handleCreateTag()}
              fullWidth
              className="sm:w-auto px-6 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-500/30"
            >
              Save Category
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateTag();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Category Name
            </label>
            <input
              type="text"
              value={newTagName}
              onChange={(e) => {
                setNewTagName(e.target.value);
                setError(null);
              }}
              placeholder="e.g., Subscriptions, Pet Care, Travel..."
              autoFocus
              className="w-full px-4 py-3 rounded-2xl bg-white/80 dark:bg-black/25 border border-black/[0.08] dark:border-white/10 focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/20 outline-none text-sm text-[var(--text-primary)] transition-all shadow-xs"
            />
            {error && <p className="text-xs text-rose-500 mt-1.5">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Pick Accent Color
            </label>
            <div className="flex flex-wrap gap-2.5">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-8 h-8 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                    selectedColor === color
                      ? "ring-3 ring-offset-2 ring-emerald-500 scale-110 shadow-md"
                      : "opacity-80 hover:opacity-100 hover:scale-105"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Live Preview */}
          <div className="pt-2 flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] font-medium">
              Preview Badge:
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-xs"
              style={{
                backgroundColor: `${selectedColor}20`,
                color: selectedColor,
                border: `1px solid ${selectedColor}40`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: selectedColor }}
              />
              {newTagName.trim() || "Category Name"}
            </span>
          </div>
        </form>
      </Modal>

      {/* Grid of Categories */}
      {allTags.length === 0 ? (
        <div className="p-12 text-center rounded-3xl glass-card bg-white/80 dark:bg-white/[0.04] border border-white/80 dark:border-white/10 shadow-xs space-y-3">
          <FolderOpen className="w-12 h-12 text-[var(--text-muted)] mx-auto opacity-50" />
          <h3 className="text-base font-semibold font-heading text-[var(--text-primary)]">
            No categories defined yet
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            Create categories to track where your money goes and filter your expenses.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/25 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Category</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allTags.map((tag) => {
            const count = tagStats.counts[tag._id] || 0;
            const total = tagStats.totals[tag._id] || 0;
            const color = tag.colorKey || "#22C55E";

            return (
              <div
                key={tag._id}
                className="p-5 rounded-3xl glass-card bg-white/80 dark:bg-white/[0.04] border border-white/80 dark:border-white/10 shadow-xs hover:bg-white/95 dark:hover:bg-white/[0.08] hover:border-emerald-500/40 hover:shadow-md transition-all flex flex-col justify-between gap-4 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-xs"
                      style={{
                        backgroundColor: `${color}15`,
                        border: `1px solid ${color}35`,
                      }}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold font-heading text-[var(--text-primary)] truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {tag.name}
                      </h3>
                      <p className="text-xs text-[var(--text-muted)]">
                        {count} {count === 1 ? "expense" : "expenses"}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteTag(tag._id, tag.name)}
                    aria-label={`Delete ${tag.name}`}
                    title="Delete Category"
                    className="p-2 rounded-xl text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer opacity-70 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider block">
                      Total Spent
                    </span>
                    <span className="text-base font-bold font-heading text-[var(--text-primary)]">
                      {formatAmount(total)}
                    </span>
                  </div>

                  <Link
                    href={`/expenses?tag=${encodeURIComponent(tag._id)}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline group-hover:translate-x-0.5 transition-transform"
                  >
                    <span>View</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
