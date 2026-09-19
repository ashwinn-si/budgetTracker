"use client";

import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { TrendingDown, Receipt, ArrowUpRight, Award } from "lucide-react";

interface QuickStatChipsProps {
  totalSpend: number;
  transactionCount: number;
  largestExpense: number;
  topCategoryName: string;
  elapsedDays: number;
  currencySymbol: string;
}

export function QuickStatChips({
  totalSpend,
  transactionCount,
  largestExpense,
  topCategoryName,
  elapsedDays,
  currencySymbol,
}: QuickStatChipsProps) {
  const avgPerDay = elapsedDays > 0 ? totalSpend / elapsedDays : totalSpend;

  const stats = [
    {
      label: "Avg / Day",
      value:
        transactionCount > 0
          ? `${currencySymbol}${avgPerDay.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : "—",
      subtext: `${elapsedDays}d elapsed`,
      icon: TrendingDown,
      color: "text-emerald-500",
    },
    {
      label: "Transactions",
      value: transactionCount > 0 ? transactionCount.toString() : "—",
      subtext: transactionCount === 1 ? "1 expense" : `${transactionCount} expenses`,
      icon: Receipt,
      color: "text-teal-500",
    },
    {
      label: "Largest",
      value:
        largestExpense > 0
          ? `${currencySymbol}${largestExpense.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : "—",
      subtext: "Single expense",
      icon: ArrowUpRight,
      color: "text-amber-500",
    },
    {
      label: "Top Category",
      value: transactionCount > 0 && topCategoryName ? topCategoryName : "—",
      subtext: "By total spend",
      icon: Award,
      color: "text-indigo-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <GlassCard
            key={i}
            className="p-3.5 sm:p-4 flex flex-col justify-between hover:border-black/[0.12] dark:hover:border-white/[0.15] transition-all"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] truncate">
                {stat.label}
              </span>
              <div className={`p-1.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] ${stat.color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>

            <div>
              <div className="text-lg sm:text-xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight truncate">
                {stat.value}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                {stat.subtext}
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
