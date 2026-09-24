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
  Eye,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { ExpenseFormModal } from "@/components/expenses/ExpenseFormModal";
import { db, LocalExpense } from "@/lib/offline/db";
import { queueExpenseDeletion, queueSavingDeletion } from "@/lib/offline/syncQueue";
import { useCurrency } from "@/context/CurrencyContext";
import { useTrip } from "@/context/TripContext";
import { filterExpensesForTrip, GENERAL_TRIP_ID } from "@/lib/trips";
import { SelectSheet } from "@/components/ui/SelectSheet";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { TripSourceBadge } from "@/components/trips/TripSourceBadge";
import { MirroredExpenseModal } from "@/components/trips/MirroredExpenseModal";

function getAddedTimestamp(exp: LocalExpense): number {
  if (exp.createdAt) {
    const t = new Date(exp.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (exp.clientId?.startsWith("exp_")) {
    const parts = exp.clientId.split("_");
    const ts = parseInt(parts[1], 10);
    if (!isNaN(ts) && ts > 0) return ts;
  }
  if (exp.date) {
    const t = new Date(exp.date).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

export default function ExpensesPage() {
  const { formatAmount, currencyInfo } = useCurrency();
  const { trips, activeTripId } = useTrip();
  const searchParams = useSearchParams();
  const tagParam = searchParams.get("tag");
  const monthParam = searchParams.get("month");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState(tagParam || "all");
  const [selectedMonth, setSelectedMonth] = useState<string>(monthParam || "all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<LocalExpense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [viewingMirroredExpense, setViewingMirroredExpense] = useState<LocalExpense | null>(null);

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
  const rawExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const allSavings = useLiveQuery(() => db.savings.toArray(), []) || [];
  const rawTags = useLiveQuery(() => db.tags.toArray(), []) || [];

  // Scoped to the active trip (own + mirrored-in expenses)
  const allExpenses = useMemo(
    () => filterExpensesForTrip(rawExpenses, activeTripId, trips).all,
    [rawExpenses, activeTripId, trips]
  );

  // Tags belonging to the active trip only
  const allTags = useMemo(
    () => rawTags.filter((t) => (t.tripId || GENERAL_TRIP_ID) === activeTripId),
    [rawTags, activeTripId]
  );

  // Lookup over ALL tags (across trips) so mirrored expenses keep their tag labels/colors
  const tagMap = useMemo(() => {
    return new Map(rawTags.map((t) => [t._id, t]));
  }, [rawTags]);

  // Source trips mirrored into the active trip, for the "From <trip>" filter options
  const tripTagOptions = useMemo(() => {
    const sourceTripIds = new Set<string>();
    allExpenses.forEach((exp) => {
      const tripId = exp.tripId || GENERAL_TRIP_ID;
      if (tripId !== activeTripId) sourceTripIds.add(tripId);
    });
    return Array.from(sourceTripIds).map((tripId) => {
      const trip = trips.find((t) => t.tripId === tripId);
      return {
        value: `trip:${tripId}`,
        label: `From ${trip?.emoji ? `${trip.emoji} ` : "✈ "}${trip?.name || "Trip"}`,
      };
    });
  }, [allExpenses, activeTripId, trips]);

  const linkedWithdrawalIds = useMemo(() => {
    const ids = new Set<string>();
    allSavings.forEach((s) => {
      if (s.linkedExpenseId) ids.add(s.linkedExpenseId);
    });
    return ids;
  }, [allSavings]);

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
          (selectedTag.startsWith("trip:")
            ? (exp.tripId || GENERAL_TRIP_ID) === selectedTag.slice(5)
            : exp.tagIds && exp.tagIds.includes(selectedTag));

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
      .sort((a, b) => {
        const timeA = getAddedTimestamp(a);
        const timeB = getAddedTimestamp(b);
        if (timeB !== timeA) {
          return timeB - timeA;
        }
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (b.clientId || "").localeCompare(a.clientId || "");
      });
  }, [allExpenses, searchTerm, selectedTag, selectedMonth]);

  const filteredTotalAmount = useMemo(() => {
    return filteredAndSortedExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }, [filteredAndSortedExpenses]);

  const isFiltered = Boolean(
    searchTerm.trim() || selectedTag !== "all" || selectedMonth !== "all"
  );

  const handleDelete = (clientId: string) => {
    setExpenseToDelete(clientId);
  };

  const confirmDeleteExpense = async () => {
    if (!expenseToDelete) return;
    const clientId = expenseToDelete;
    await queueExpenseDeletion(clientId);
    const saving = await db.savings.where("linkedExpenseId").equals(clientId).first();
    if (saving) {
      await queueSavingDeletion(saving.clientId);
    }
    setExpenseToDelete(null);
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
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight">
            Expense <em>History</em>
          </h1>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 flex-wrap">
          {/* Dynamic Total Amount Badge */}
          <div className="flex items-center gap-3 px-3.5 sm:px-4 py-2 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/10 backdrop-blur-md shadow-xs">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ReceiptText className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block leading-tight">
                  {isFiltered ? "Filtered Total" : "Total Spent"}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-medium">
                  ({filteredAndSortedExpenses.length})
                </span>
              </div>
              <span className="text-lg sm:text-2xl font-serif-display font-bold text-emerald-600 dark:text-emerald-400 leading-tight block">
                {formatAmount(filteredTotalAmount)}
              </span>
            </div>
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
              className="w-full min-w-0 max-w-full pl-10 pr-4 py-2.5 text-base sm:text-sm bg-white/50 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/40 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Tag filter */}
          <div className="sm:col-span-3">
            <SelectSheet
              value={selectedTag}
              onChange={setSelectedTag}
              options={[
                { value: "all", label: "All Tags" },
                ...allTags.map(tag => ({ value: tag._id, label: tag.name })),
                ...tripTagOptions,
              ]}
              icon={<Filter className="w-4 h-4" />}
              title="Filter by Tag"
            />
          </div>

          {/* Month selector */}
          <div className="sm:col-span-3">
            <SelectSheet
              value={selectedMonth}
              onChange={setSelectedMonth}
              options={[
                { value: "all", label: "All Months" },
                ...availableMonths.map(m => ({ value: m.value, label: m.label }))
              ]}
              icon={<Calendar className="w-4 h-4" />}
              title="Filter by Month"
            />
          </div>
        </div>
      </GlassCard>

      {/* Expenses List */}
      {filteredAndSortedExpenses.length === 0 ? (
        <GlassCard variant="mid" className="p-8 sm:p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <ReceiptText className="w-6 h-6" />
          </div>
          <h3 className="text-base sm:text-lg font-serif-display font-medium text-[var(--text-primary)]">
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
        <div className="overflow-y-auto max-h-[calc(100dvh-280px)] pr-2 -mr-2 custom-scrollbar">
          <div className="space-y-3 pb-4">
            {filteredAndSortedExpenses.map((expense) => {
            const dateFormatted = new Date(expense.date).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });

            const isFromSavings = linkedWithdrawalIds.has(expense.clientId);
            const isMirrored = (expense.tripId || GENERAL_TRIP_ID) !== activeTripId;

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
                  isFromSavings
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-black/5 dark:bg-white/5 text-emerald-600 dark:text-emerald-400 font-serif-display text-base font-semibold"
                }`}>
                  {isFromSavings ? (
                    <ArrowDownLeft className="w-5 h-5" />
                  ) : (
                    currencyInfo.symbol
                  )}
                </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm sm:text-base text-[var(--text-primary)] truncate max-w-full">
                        {expense.note || "No description"}
                      </h4>
                      {isFromSavings && (
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
                                className="px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1 max-w-[120px]"
                                style={{
                                  backgroundColor: `${tag.colorKey}15`,
                                  borderColor: `${tag.colorKey}30`,
                                  color: tag.colorKey,
                                }}
                              >
                                <span className="truncate max-w-[100px]">{tag.name}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {isMirrored && <TripSourceBadge tripId={expense.tripId || GENERAL_TRIP_ID} size="xs" />}
                    </div>
                  </div>
                </div>

                {/* Right amount and actions */}
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5">
                  <span className="text-xl sm:text-2xl font-serif-display font-medium text-[var(--text-primary)]">
                    {formatAmount(expense.amount)}
                  </span>

                  <div className="flex items-center gap-1">
                    {isMirrored ? (
                      <button
                        onClick={() => setViewingMirroredExpense(expense)}
                        aria-label="View expense details"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
          </div>
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

      {/* Confirmation Modal for Deleting Expense */}
      <ConfirmModal
        isOpen={!!expenseToDelete}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={confirmDeleteExpense}
        title="Delete Expense?"
        message="Are you sure you want to delete this expense record? This will also remove any linked savings entry."
        confirmText="Delete Expense"
        variant="danger"
      />

      {/* Read-only view for mirrored (cross-trip) expenses */}
      <MirroredExpenseModal
        isOpen={!!viewingMirroredExpense}
        onClose={() => setViewingMirroredExpense(null)}
        expense={viewingMirroredExpense}
        tagMap={tagMap}
      />
    </div>
  );
}
