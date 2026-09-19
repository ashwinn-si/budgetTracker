"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Search,
  Plus,
  Edit2,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  Calendar,
  Filter,
  ReceiptText,
  ChevronDown,
  PiggyBank,
  ArrowDownLeft,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { ExpenseFormModal } from "@/components/expenses/ExpenseFormModal";
import { db, LocalExpense } from "@/lib/offline/db";
import { queueExpenseDeletion } from "@/lib/offline/syncQueue";
import { useCurrency } from "@/context/CurrencyContext";

export default function ExpensesPage() {
  const { formatAmount, currencyInfo } = useCurrency();
  const searchParams = useSearchParams();
  const tagParam = searchParams.get("tag");
  const monthParam = searchParams.get("month");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState(tagParam || "all");
  const [selectedMonth, setSelectedMonth] = useState<string>(monthParam || "all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<LocalExpense | null>(null);

  useEffect(() => {
    if (tagParam) {
      setSelectedTag(tagParam);
    }
  }, [tagParam]);

  useEffect(() => {
    if (monthParam) {
      setSelectedMonth(monthParam);
    }
  }, [monthParam]);

  // Live query from Dexie
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const allTags = useLiveQuery(() => db.tags.toArray(), []) || [];

  const tagMap = useMemo(() => {
    return new Map(allTags.map((t) => [t._id, t]));
  }, [allTags]);

  // Compute available months dynamically from expenses and recent months
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();

    // Include current month and previous 5 months by default
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthsSet.add(key);
    }

    // Include any months from user expenses
    allExpenses.forEach((exp) => {
      if (!exp.date) return;
      const expDate = new Date(exp.date);
      if (!isNaN(expDate.getTime())) {
        const key = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, "0")}`;
        monthsSet.add(key);
      }
    });

    // Sort descending (newest month first)
    const sorted = Array.from(monthsSet).sort().reverse();

    return sorted.map((key) => {
      const [year, month] = key.split("-").map(Number);
      const date = new Date(year, month - 1, 1);
      const label = date.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
      return { value: key, label };
    });
  }, [allExpenses]);

  const filteredAndSortedExpenses = useMemo(() => {
    return allExpenses
      .filter((exp) => {
        const matchesSearch =
          !searchTerm ||
          exp.note.toLowerCase().includes(searchTerm.toLowerCase()) ||
          exp.amount.toString().includes(searchTerm);

        const matchesTag =
          selectedTag === "all" ||
          (exp.tagIds && exp.tagIds.includes(selectedTag));

        const matchesMonth =
          selectedMonth === "all" ||
          (() => {
            const expDate = new Date(exp.date);
            if (isNaN(expDate.getTime())) return false;
            const key = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, "0")}`;
            return key === selectedMonth;
          })();

        return matchesSearch && matchesTag && matchesMonth;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allExpenses, searchTerm, selectedTag, selectedMonth]);

  const handleDelete = async (clientId: string) => {
    if (confirm("Are you sure you want to delete this expense?")) {
      await queueExpenseDeletion(clientId);
    }
  };

  const handleEdit = (expense: LocalExpense) => {
    setEditingExpense(expense);
    setIsModalOpen(true);
  };

  const handleNew = () => {
    setEditingExpense(null);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Transaction Ledger
          </span>
          <h1 className="text-3xl sm:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight">
            Expense <em>History</em>
          </h1>
        </div>

        <Button
          variant="primary"
          onClick={handleNew}
          icon={<Plus className="w-4 h-4 stroke-[2.5]" />}
          className="hidden sm:inline-flex shadow-emerald-500/20 shadow-lg"
        >
          Add Expense
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <GlassCard variant="light" className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search box */}
          <div className="sm:col-span-6 relative flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search expenses by note or amount..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-white/50 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/40 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Tag filter */}
          <div className="sm:col-span-3 relative group">
            <Filter className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-emerald-500 transition-colors" />
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="w-full appearance-none pl-10 pr-9 py-2.5 text-xs sm:text-sm font-medium bg-white/60 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 text-[var(--text-primary)] cursor-pointer hover:bg-white/80 dark:hover:bg-black/60 transition-all shadow-xs"
            >
              <option value="all">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag._id} value={tag._id}>
                  {tag.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-[var(--text-primary)] transition-colors" />
          </div>

          {/* Month selector */}
          <div className="sm:col-span-3 relative group">
            <Calendar className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-emerald-500 transition-colors" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full appearance-none pl-10 pr-9 py-2.5 text-xs sm:text-sm font-medium bg-white/60 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 text-[var(--text-primary)] cursor-pointer hover:bg-white/80 dark:hover:bg-black/60 transition-all shadow-xs"
            >
              <option value="all">All Months</option>
              {availableMonths.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-[var(--text-primary)] transition-colors" />
          </div>
        </div>
      </GlassCard>

      {/* Expenses List */}
      {filteredAndSortedExpenses.length === 0 ? (
        <GlassCard variant="mid" className="p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <ReceiptText className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-serif-display font-medium text-[var(--text-primary)]">
            No expenses found
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            {searchTerm || selectedTag !== "all" || selectedMonth !== "all"
              ? "Try adjusting your search terms, category, or month filters."
              : "Start tracking your spending by adding your first transaction."}
          </p>
          <Button variant="accent-ghost" size="sm" onClick={handleNew}>
            Add Expense Now
          </Button>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {filteredAndSortedExpenses.map((expense) => {
            const dateFormatted = new Date(expense.date).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });

            return (
              <GlassCard
                key={expense.clientId}
                variant="mid"
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-emerald-500/30 transition-all duration-200"
              >
                {/* Left details */}
                <div className="flex items-start gap-3.5 min-w-0">
                {/* Icon — savings-aware */}
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  expense.isSaving
                    ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                    : expense.fromSavings
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-black/5 dark:bg-white/5 text-emerald-600 dark:text-emerald-400 font-serif-display text-base font-semibold"
                }`}>
                  {expense.isSaving ? (
                    <PiggyBank className="w-5 h-5" />
                  ) : expense.fromSavings ? (
                    <ArrowDownLeft className="w-5 h-5" />
                  ) : (
                    currencyInfo.symbol
                  )}
                </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm sm:text-base text-[var(--text-primary)] truncate">
                        {expense.note || "No description"}
                      </h4>
                      {/* Savings badge */}
                      {expense.isSaving && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                          <PiggyBank className="w-2.5 h-2.5" /> Saving
                        </span>
                      )}
                      {expense.fromSavings && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          <ArrowDownLeft className="w-2.5 h-2.5" /> From Savings
                        </span>
                      )}
                      {/* Sync Status Badge */}
                      {expense.syncStatus === "synced" ? (
                        <span
                          title="Synced to cloud"
                          className="inline-flex items-center text-emerald-600 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span
                          title="Pending offline sync"
                          className="inline-flex items-center text-amber-500 animate-pulse"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--text-muted)]">
                      <span>{dateFormatted}</span>
                      {/* Tags */}
                      {expense.tagIds && expense.tagIds.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {expense.tagIds.map((tId) => {
                            const tag = tagMap.get(tId);
                            if (!tag) return null;
                            return (
                              <span
                                key={tId}
                                className="px-2 py-0.5 rounded-full text-[10px] font-medium border"
                                style={{
                                  backgroundColor: `${tag.colorKey}15`,
                                  borderColor: `${tag.colorKey}30`,
                                  color: tag.colorKey,
                                }}
                              >
                                {tag.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right amount and actions */}
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5">
                  <span className="text-xl sm:text-2xl font-serif-display font-medium text-[var(--text-primary)]">
                    {formatAmount(expense.amount)}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(expense)}
                      aria-label="Edit expense"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(expense.clientId)}
                      aria-label="Delete expense"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Edit/Create Modal */}
      <ExpenseFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingExpense(null);
        }}
        initialExpense={editingExpense}
      />
    </div>
  );
}
