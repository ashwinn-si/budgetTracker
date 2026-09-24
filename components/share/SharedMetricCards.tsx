import React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

export interface SharedMetricCardsProps {
  isFullMode: boolean;
  totalSpent: number;
  totalSpentThisMonth: number;
  totalSavings: number | null;
  month: string;
  expenseCount: number;
  dailyAverage: number | null;
  formattedRange: string | null;
  formatAmount: (val: number) => string;
}

export function SharedMetricCards({
  isFullMode,
  totalSpent,
  totalSpentThisMonth,
  totalSavings,
  month,
  expenseCount,
  dailyAverage,
  formattedRange,
  formatAmount,
}: SharedMetricCardsProps) {
  return (
    <div className={`grid grid-cols-1 ${totalSavings !== null ? "md:grid-cols-2" : ""} gap-6`}>
      {/* Spend Card */}
      <GlassCard variant="strong" className="p-6 sm:p-8 flex flex-col justify-center">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <TrendingDown className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {isFullMode ? "Total trip spend" : `Spent in ${month}`}
          </h2>
        </div>
        <div className="text-4xl sm:text-5xl font-serif-display font-bold text-[var(--text-primary)] tracking-tight">
          {formatAmount(isFullMode ? totalSpent : totalSpentThisMonth)}
        </div>
        {isFullMode && (
          <div className="mt-3 space-y-0.5">
            {formattedRange && (
              <p className="text-sm text-[var(--text-secondary)]">{formattedRange}</p>
            )}
            <p className="text-xs text-[var(--text-muted)]">
              {expenseCount} expense{expenseCount === 1 ? "" : "s"}
              {dailyAverage != null && ` · ${formatAmount(dailyAverage)}/day`}
            </p>
          </div>
        )}
      </GlassCard>

      {/* Savings Card */}
      {totalSavings !== null && (
        <GlassCard variant="strong" className="p-6 sm:p-8 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Current Savings Balance
            </h2>
          </div>
          <div className="text-4xl sm:text-5xl font-serif-display font-bold text-[var(--text-primary)] tracking-tight">
            {formatAmount(totalSavings)}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
