"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Receipt, ChevronLeft, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { RecentExpense } from "./types";
import { ExpenseRow } from "./ExpenseRow";
import { format, parseISO } from "date-fns";

export interface SharedExpensesListProps {
  expenses: RecentExpense[];
  isFullMode: boolean;
  month: string;
  year: number;
  formatAmount: (val: number) => string;
  formatExpenseDate: (val: string) => string;
  className?: string;
  resetKey?: string | number;
}

export function SharedExpensesList({
  expenses,
  isFullMode,
  month,
  year,
  formatAmount,
  formatExpenseDate,
  className,
  resetKey,
}: SharedExpensesListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey]);

  const totalExpenseItems = expenses.length;
  const totalPages = Math.ceil(totalExpenseItems / ITEMS_PER_PAGE) || 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedExpenses = useMemo(() => {
    return expenses.slice(startIndex, endIndex);
  }, [expenses, startIndex, endIndex]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === safeCurrentPage) return;
    setCurrentPage(newPage);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const groupExpensesByDay = (list: RecentExpense[]) => {
    const groups: { dateKey: string; label: string; items: RecentExpense[] }[] = [];
    for (const exp of list) {
      const dateKey = exp.date.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.dateKey === dateKey) {
        last.items.push(exp);
      } else {
        groups.push({ dateKey, label: format(parseISO(exp.date), "EEE, d MMM"), items: [exp] });
      }
    }
    return groups;
  };

  const getPaginationRange = (current: number, total: number): (number | string)[] => {
    if (total <= 5) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 3) {
      return [1, 2, 3, 4, "...", total];
    }
    if (current >= total - 2) {
      return [1, "...", total - 3, total - 2, total - 1, total];
    }
    return [1, "...", current - 1, current, current + 1, "...", total];
  };

  return (
    <GlassCard variant="mid" className={`p-6 sm:p-8 ${className || ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-serif-display font-medium text-[var(--text-primary)] truncate">
              {isFullMode ? "All expenses" : "Recent Expenses"}
            </h2>
            <p className="text-sm text-[var(--text-muted)] truncate">
              {isFullMode ? "Whole trip" : `For ${month} ${year}`}
            </p>
          </div>
        </div>

        {totalExpenseItems > 0 && (
          <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 text-[var(--text-muted)] border border-black/5 dark:border-white/5">
            {totalExpenseItems} {totalExpenseItems === 1 ? "expense" : "expenses"}
          </span>
        )}
      </div>

      {totalExpenseItems > 0 ? (
        <>
          {/* Scrollable Rows */}
          <div
            ref={scrollContainerRef}
            className="max-h-[440px] sm:max-h-[520px] overflow-y-auto custom-scrollbar pr-2 -mr-2"
          >
            {isFullMode ? (
              <div className="space-y-5">
                {groupExpensesByDay(paginatedExpenses).map((group) => (
                  <div key={group.dateKey}>
                    <div className="sticky top-0 z-10 py-1.5 px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] bg-neutral-100/90 dark:bg-neutral-900/90 backdrop-blur-md rounded-lg border border-black/5 dark:border-white/5">
                      {group.label}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((exp, idx) => (
                        <ExpenseRow
                          key={`${group.dateKey}-${idx}-${exp.note}`}
                          exp={exp}
                          formatAmount={formatAmount}
                          showDate={false}
                          formatExpenseDate={formatExpenseDate}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {paginatedExpenses.map((exp, idx) => (
                  <ExpenseRow
                    key={`${exp.date}-${idx}-${exp.note}`}
                    exp={exp}
                    formatAmount={formatAmount}
                    showDate
                    formatExpenseDate={formatExpenseDate}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="pt-4 mt-5 border-t border-black/5 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
              <div>
                Showing{" "}
                <span className="font-semibold text-[var(--text-primary)]">
                  {startIndex + 1}–{Math.min(endIndex, totalExpenseItems)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-[var(--text-primary)]">
                  {totalExpenseItems}
                </span>{" "}
                expenses
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handlePageChange(safeCurrentPage - 1)}
                  disabled={safeCurrentPage === 1}
                  aria-label="Previous page"
                  className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl border border-black/5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1 font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {getPaginationRange(safeCurrentPage, totalPages).map((p, idx) =>
                    p === "..." ? (
                      <span key={`ellipsis-${idx}`} className="px-2 py-1 text-[var(--text-muted)]">
                        ...
                      </span>
                    ) : (
                      <button
                        key={`page-${p}`}
                        type="button"
                        onClick={() => handlePageChange(p as number)}
                        aria-current={safeCurrentPage === p ? "page" : undefined}
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                          safeCurrentPage === p
                            ? "bg-emerald-500 text-white font-semibold shadow-sm shadow-emerald-500/20"
                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handlePageChange(safeCurrentPage + 1)}
                  disabled={safeCurrentPage === totalPages}
                  aria-label="Next page"
                  className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl border border-black/5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1 font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="py-12 text-center text-[var(--text-muted)]">
          {isFullMode
            ? "No expenses recorded for this trip."
            : "No expenses recorded for this month."}
        </div>
      )}
    </GlassCard>
  );
}
