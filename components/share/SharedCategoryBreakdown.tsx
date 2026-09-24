"use client";

import React from "react";
import { PieChart, ChevronLeft, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CategoryBreakdown } from "./types";
import { FromTripPill } from "./FromTripPill";

export interface SharedCategoryBreakdownProps {
  categories: CategoryBreakdown[];
  isFullMode: boolean;
  month: string;
  year: number;
  currentDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  formatAmount: (val: number) => string;
  className?: string;
}

export function SharedCategoryBreakdown({
  categories,
  isFullMode,
  month,
  year,
  currentDate,
  onPrevMonth,
  onNextMonth,
  formatAmount,
  className,
}: SharedCategoryBreakdownProps) {
  const isCurrentMonth =
    currentDate.getMonth() === new Date().getMonth() &&
    currentDate.getFullYear() === new Date().getFullYear();

  return (
    <GlassCard variant="mid" className={`p-6 sm:p-8 ${className || ""}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <PieChart className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-serif-display font-medium text-[var(--text-primary)]">
              Category Breakdown
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {isFullMode ? "Whole trip" : `For ${month} ${year}`}
            </p>
          </div>
        </div>

        {!isFullMode && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevMonth}
              className="p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-[var(--text-secondary)] cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium w-24 text-center text-[var(--text-primary)]">
              {month} {year}
            </span>
            <button
              type="button"
              onClick={onNextMonth}
              disabled={isCurrentMonth}
              className="p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-[var(--text-secondary)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {categories.length > 0 ? (
        <div className="space-y-4">
          {categories.map((cat) => (
            <div
              key={cat.tagId}
              className="group flex items-center gap-4 p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                style={{ backgroundColor: `${cat.colorKey}20`, color: cat.colorKey }}
              >
                <span className="text-sm font-bold">
                  {cat.tagName.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0).toUpperCase() ||
                    cat.tagName.charAt(0)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-[var(--text-primary)] truncate">
                      {cat.tagName}
                    </span>
                    {cat.isMirrored && (
                      <FromTripPill
                        name={cat.sourceTripName || cat.tagName}
                        colorKey={cat.colorKey}
                      />
                    )}
                  </div>
                  <span className="font-serif-display font-medium text-[var(--text-primary)] shrink-0">
                    {formatAmount(cat.total)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${Math.min(100, Math.max(0, parseFloat(cat.percentage)))}%`,
                        backgroundColor: cat.colorKey,
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-[var(--text-muted)] w-9 text-right shrink-0">
                    {cat.percentage}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
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
