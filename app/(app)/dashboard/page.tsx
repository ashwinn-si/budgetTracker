"use client";

import React, { useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Download,
  TrendingDown,
  TrendingUp,
  Filter,
  Calendar,
  Layers,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Ring } from "@/components/ui/Ring";
import { motion } from "motion/react";
import { ExpenseFormModal } from "@/components/expenses/ExpenseFormModal";
import { db, LocalExpense } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/useSync";
import { useLoading } from "@/context/LoadingContext";
import { useCurrency } from "@/context/CurrencyContext";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, syncNow, isSyncing } = useSync();
  const { startLoading, stopLoading } = useLoading();
  const { formatAmount, currencyInfo } = useCurrency();

  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Read filter state from URL query parameters
  const period = searchParams.get("period") || "month";
  const selectedTagParam = searchParams.get("tag") || "all";

  // Live query from Dexie IndexedDB
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const allTags = useLiveQuery(() => db.tags.toArray(), []) || [];

  const tagMap = useMemo(() => {
    return new Map(allTags.map((t) => [t._id, t]));
  }, [allTags]);

  // Compute date ranges
  const dateRanges = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (period === "last30") {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const prevStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      return { start, end: now, prevStart, prevEnd: start };
    }

    if (period === "ytd") {
      const start = new Date(currentYear, 0, 1);
      const prevStart = new Date(currentYear - 1, 0, 1);
      const prevEnd = new Date(currentYear - 1, currentMonth, now.getDate());
      return { start, end: now, prevStart, prevEnd };
    }

    // Default: 'month' (Current month vs Previous month)
    const start = new Date(currentYear, currentMonth, 1);
    const prevStart = new Date(currentYear, currentMonth - 1, 1);
    const prevEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);
    return { start, end: now, prevStart, prevEnd };
  }, [period]);

  // Filter current and previous expenses
  const { currentExpenses, prevExpenses } = useMemo(() => {
    const { start, end, prevStart, prevEnd } = dateRanges;

    const current: LocalExpense[] = [];
    const prev: LocalExpense[] = [];

    allExpenses.forEach((exp) => {
      const expDate = new Date(exp.date);

      // Filter by tag if selected
      if (selectedTagParam !== "all") {
        if (!exp.tagIds || !exp.tagIds.includes(selectedTagParam)) {
          return;
        }
      }

      if (expDate >= start && expDate <= end) {
        current.push(exp);
      } else if (expDate >= prevStart && expDate <= prevEnd) {
        prev.push(exp);
      }
    });

    return { currentExpenses: current, prevExpenses: prev };
  }, [allExpenses, dateRanges, selectedTagParam]);

  // Calculations
  const totalSpend = useMemo(() => {
    return currentExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [currentExpenses]);

  const prevTotalSpend = useMemo(() => {
    return prevExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [prevExpenses]);

  // Percentage comparison
  const spendComparisonPercentage = useMemo(() => {
    if (prevTotalSpend <= 0) return 0;
    return Math.round(((totalSpend - prevTotalSpend) / prevTotalSpend) * 100);
  }, [totalSpend, prevTotalSpend]);

  // Animated ring percentage: pacing against previous month (or 100% baseline)
  const ringPercentage = useMemo(() => {
    if (prevTotalSpend <= 0) return Math.min(100, Math.round((totalSpend / 1500) * 100));
    return Math.round((totalSpend / prevTotalSpend) * 100);
  }, [totalSpend, prevTotalSpend]);

  // Trend data by day for Recharts
  const trendData = useMemo(() => {
    const map: Record<string, number> = {};

    currentExpenses.forEach((exp) => {
      const dayKey = exp.date.split("T")[0];
      map[dayKey] = (map[dayKey] || 0) + exp.amount;
    });

    const sortedDates = Object.keys(map).sort();
    if (sortedDates.length === 0) {
      return [
        { date: "Day 1", amount: 0 },
        { date: "Day 15", amount: 0 },
      ];
    }

    return sortedDates.map((d) => {
      const parsed = new Date(d);
      const label = parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return {
        date: label,
        amount: Math.round(map[d] * 100) / 100,
      };
    });
  }, [currentExpenses]);

  // Tag Breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};

    currentExpenses.forEach((exp) => {
      if (!exp.tagIds || exp.tagIds.length === 0) {
        map["uncategorized"] = {
          total: (map["uncategorized"]?.total || 0) + exp.amount,
          count: (map["uncategorized"]?.count || 0) + 1,
        };
      } else {
        exp.tagIds.forEach((tId) => {
          map[tId] = {
            total: (map[tId]?.total || 0) + exp.amount,
            count: (map[tId]?.count || 0) + 1,
          };
        });
      }
    });

    return Object.entries(map)
      .map(([tagId, data]) => {
        const tag = tagMap.get(tagId);
        const percentage = totalSpend > 0 ? (data.total / totalSpend) * 100 : 0;
        return {
          tagId,
          name: tag?.name || "Uncategorized",
          colorKey: tag?.colorKey || "#7A8C7C",
          total: data.total,
          count: data.count,
          percentage: Math.round(percentage * 10) / 10,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [currentExpenses, tagMap, totalSpend]);

  const updateFilters = (newPeriod: string, newTag: string) => {
    const params = new URLSearchParams();
    if (newPeriod !== "month") params.set("period", newPeriod);
    if (newTag !== "all") params.set("tag", newTag);
    router.replace(`/dashboard?${params.toString()}`);
  };

  const handleExcelExport = async () => {
    setIsExporting(true);
    startLoading();
    try {
      const response = await fetch("/api/export/excel");
      if (!response.ok) throw new Error("Excel export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budget-summary-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      alert("Failed to download Excel file. Please try again.");
    } finally {
      setIsExporting(false);
      stopLoading();
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-20 sm:pb-8">
      {/* Header & Filter Pill Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Overview & Spend Analytics
          </span>
          <h1 className="text-3xl sm:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight">
            Financial <em>Pacing</em>
          </h1>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExcelExport}
            isLoading={isExporting}
            icon={<Download className="w-4 h-4" />}
          >
            Excel
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => syncNow()}
            isLoading={isSyncing}
            icon={<RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-emerald-500" : ""}`} />}
          >
            Sync
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsAddExpenseOpen(true)}
            icon={<Plus className="w-4 h-4 stroke-[2.5]" />}
          >
            Add Expense
          </Button>
        </div>
      </div>

      {/* Interactive Filter Bar */}
      <GlassCard variant="light" className="p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3">
        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.04] dark:border-white/10 relative">
          {[
            { id: "month", label: "This Month" },
            { id: "last30", label: "Last 30 Days" },
            { id: "ytd", label: "Year to Date" },
          ].map((item) => {
            const active = period === item.id;
            return (
              <button
                key={item.id}
                onClick={() => updateFilters(item.id, selectedTagParam)}
                className={`relative min-h-[36px] px-4 py-1.5 rounded-xl text-xs font-medium transition-colors duration-150 cursor-pointer select-none ${
                  active
                    ? "text-white font-semibold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="activeDashboardPeriodTab"
                    className="absolute inset-0 bg-emerald-500 rounded-xl shadow-md shadow-emerald-500/25"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10 font-heading tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tag Dropdown Filter */}
        <div className="relative group">
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-emerald-500 transition-colors" />
          <select
            value={selectedTagParam}
            onChange={(e) => updateFilters(period, e.target.value)}
            className="min-h-[38px] appearance-none pl-8.5 pr-8 py-1.5 rounded-xl text-xs font-medium bg-white/60 dark:bg-black/40 border border-white/60 dark:border-white/10 text-[var(--text-primary)] outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500/30 transition-all shadow-xs hover:bg-white/80 dark:hover:bg-black/60"
          >
            <option value="all">All Categories</option>
            {allTags.map((tag) => (
              <option key={tag._id} value={tag._id}>
                {tag.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-[var(--text-primary)] transition-colors" />
        </div>
      </GlassCard>

      {/* Hero Section: Glass Card with Animated SVG Data Ring */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <GlassCard
          variant="strong"
          className="lg:col-span-5 flex flex-col items-center justify-center text-center p-8 relative overflow-hidden"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">
            Spend Velocity vs Last Period
          </span>

          <div className="my-3">
            <Ring
              percentage={ringPercentage}
              size={190}
              strokeWidth={12}
              label="Pacing"
              sublabel={`vs ${formatAmount(prevTotalSpend)}`}
            />
          </div>

          <div className="mt-4 w-full pt-4 border-t border-black/5 dark:border-white/5 flex items-center justify-around">
            <div>
              <span className="text-xs text-[var(--text-muted)] block">Current Total</span>
              <span className="text-2xl font-serif-display font-semibold text-[var(--text-primary)]">
                {formatAmount(totalSpend)}
              </span>
            </div>

            <div className="h-8 w-px bg-black/10 dark:bg-white/10" />

            <div>
              <span className="text-xs text-[var(--text-muted)] block">Change</span>
              <div
                className={`inline-flex items-center gap-1 text-sm font-semibold mt-0.5 ${
                  spendComparisonPercentage <= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {spendComparisonPercentage <= 0 ? (
                  <TrendingDown className="w-4 h-4" />
                ) : (
                  <TrendingUp className="w-4 h-4" />
                )}
                <span>
                  {spendComparisonPercentage > 0 ? `+${spendComparisonPercentage}%` : `${spendComparisonPercentage}%`}
                </span>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Trend Area Chart Card */}
        <GlassCard variant="mid" className="lg:col-span-7 flex flex-col justify-between p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-serif-display font-medium text-[var(--text-primary)]">
                Spending Activity
              </h2>
              <p className="text-xs text-[var(--text-muted)]">Daily distribution across this period</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Calendar className="w-3.5 h-3.5" />
              <span>{currentExpenses.length} entries</span>
            </div>
          </div>

          {/* Recharts Area */}
          <div className="h-56 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="rgba(122, 140, 124, 0.6)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(122, 140, 124, 0.6)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${currencyInfo.symbol}${val}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.85)",
                    backdropFilter: "blur(12px)",
                    borderRadius: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.6)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                    fontSize: "12px",
                  }}
                  formatter={(value: any) => [formatAmount(Number(value)), "Amount"]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#22C55E"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#emeraldGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      {/* Category Breakdown Section */}
      <GlassCard variant="mid" className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-serif-display font-medium text-[var(--text-primary)]">
              Spend by Category
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Proportional distribution of expenses for this view
            </p>
          </div>
          <Layers className="w-5 h-5 text-[var(--text-muted)]" />
        </div>

        {categoryBreakdown.length === 0 ? (
          <div className="py-12 text-center text-[var(--text-muted)] text-sm">
            No expenses recorded for this timeframe. Click "Add Expense" to get started!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {categoryBreakdown.map((cat) => (
              <div key={cat.tagId} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: cat.colorKey }}
                    />
                    <span className="font-medium text-[var(--text-primary)]">{cat.name}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">({cat.count})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {formatAmount(cat.total)}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] w-10 text-right">
                      {cat.percentage}%
                    </span>
                  </div>
                </div>
                {/* Visual Progress Bar */}
                <div className="w-full h-2 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${cat.percentage}%`,
                      backgroundColor: cat.colorKey,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Expense Modal */}
      <ExpenseFormModal
        isOpen={isAddExpenseOpen}
        onClose={() => setIsAddExpenseOpen(false)}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh] text-sm text-[var(--text-muted)]">
          <div className="animate-pulse">Loading dashboard analytics...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
