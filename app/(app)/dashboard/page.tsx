"use client";

import React, { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Download,
  Layers,
  Plus,
  RefreshCw,
  Wallet,
  Receipt,
  Tag,
  CalendarDays,
  PiggyBank,
  ArrowRight,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { ExpenseFormModal } from "@/components/expenses/ExpenseFormModal";
import { db, LocalExpense } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/useSync";
import { useLoading } from "@/context/LoadingContext";
import { useCurrency } from "@/context/CurrencyContext";
import { SpendingActivityChart } from "@/components/dashboard/SpendingActivityChart";
import toast from "react-hot-toast";
import { DateRangeFilter, PeriodPreset } from "@/components/dashboard/DateRangeFilter";
import { TagFilter } from "@/components/dashboard/TagFilter";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { syncNow, isSyncing } = useSync();
  const { startLoading, stopLoading } = useLoading();
  const { formatAmount, currencyInfo } = useCurrency();

  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Read filter state from URL query parameters
  const periodParam = (searchParams.get("period") || "month") as PeriodPreset;
  const customStartParam = searchParams.get("start");
  const customEndParam = searchParams.get("end");
  const selectedTagsParam = searchParams.get("tags")?.split(",").filter(Boolean) || [];

  // Live query from Dexie IndexedDB
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const allSavings = useLiveQuery(() => db.savings.toArray(), []) || [];
  const allTags = useLiveQuery(() => db.tags.toArray(), []) || [];

  const tagMap = useMemo(() => {
    return new Map(allTags.map((t) => [t._id, t]));
  }, [allTags]);

  // Compute date ranges
  const dateRanges = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (periodParam === "custom" && customStartParam) {
      const start = new Date(customStartParam);
      const end = customEndParam ? new Date(customEndParam) : new Date(customStartParam);
      end.setHours(23, 59, 59, 999);
      const daysDiff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(start.getTime() - daysDiff * 24 * 60 * 60 * 1000);
      return { start, end, prevStart, prevEnd };
    }

    if (periodParam === "week") {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + 6, 23, 59, 59, 999);
      const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7, 0, 0, 0, 0);
      const prevEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1, 23, 59, 59, 999);
      return { start, end, prevStart, prevEnd };
    }

    if (periodParam === "last30") {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const prevStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      return { start, end: now, prevStart, prevEnd: start };
    }

    if (periodParam === "ytd") {
      const start = new Date(currentYear, 0, 1);
      const prevStart = new Date(currentYear - 1, 0, 1);
      const prevEnd = new Date(currentYear - 1, currentMonth, now.getDate(), 23, 59, 59);
      return { start, end: now, prevStart, prevEnd };
    }

    // Default: 'month' (Current month vs Previous month)
    const start = new Date(currentYear, currentMonth, 1);
    const prevStart = new Date(currentYear, currentMonth - 1, 1);
    const prevEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);
    return { start, end: now, prevStart, prevEnd };
  }, [periodParam, customStartParam, customEndParam]);

  // Filter current and previous expenses
  const { currentExpenses, prevExpenses } = useMemo(() => {
    const { start, end, prevStart, prevEnd } = dateRanges;

    const current: LocalExpense[] = [];
    const prev: LocalExpense[] = [];

    allExpenses.forEach((exp) => {
      const expDate = new Date(exp.date);

      // Filter by tag if tags are selected
      if (selectedTagsParam.length > 0) {
        const hasTag = exp.tagIds?.some((tId) => selectedTagsParam.includes(tId));
        if (!hasTag) return;
      }

      if (expDate >= start && expDate <= end) {
        current.push(exp);
      } else if (expDate >= prevStart && expDate <= prevEnd) {
        prev.push(exp);
      }
    });

    return { currentExpenses: current, prevExpenses: prev };
  }, [allExpenses, dateRanges, selectedTagsParam]);

  // Calculations
  const totalSpend = useMemo(() => {
    return currentExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [currentExpenses]);

  // Days elapsed in current period (for avg/day)
  const elapsedDays = useMemo(() => {
    const now = new Date();
    const start = dateRanges.start;
    const end = dateRanges.end < now ? dateRanges.end : now;
    const diff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    return diff;
  }, [dateRanges]);

  const avgPerDay = useMemo(() => {
    return elapsedDays > 0 ? totalSpend / elapsedDays : 0;
  }, [totalSpend, elapsedDays]);

  const largestExpense = useMemo(() => {
    if (currentExpenses.length === 0) return 0;
    return Math.max(...currentExpenses.map((e) => e.amount));
  }, [currentExpenses]);

  // Savings balance — all-time, ignores period filter
  // Positive = amount saved; Negative = spent more from savings than saved
  const savingsBalance = useMemo(() => {
    const totalSaved = allSavings
      .filter((e) => e.type === "deposit")
      .reduce((sum, e) => sum + e.amount, 0);
    const totalFromSavings = allSavings
      .filter((e) => e.type === "withdrawal")
      .reduce((sum, e) => sum + e.amount, 0);
    return { totalSaved, totalFromSavings, balance: totalSaved - totalFromSavings };
  }, [allSavings]);

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

  // Filter actions
  const handleSelectPeriod = (preset: PeriodPreset, customStart?: Date, customEnd?: Date) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", preset);
    if (preset === "custom" && customStart && customEnd) {
      params.set("start", customStart.toISOString().split("T")[0]);
      params.set("end", customEnd.toISOString().split("T")[0]);
    } else {
      params.delete("start");
      params.delete("end");
    }
    router.replace(`/dashboard?${params.toString()}`);
  };

  const handleToggleTag = (tagId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    let nextTags: string[];
    if (selectedTagsParam.includes(tagId)) {
      nextTags = selectedTagsParam.filter((id) => id !== tagId);
    } else {
      nextTags = [...selectedTagsParam, tagId];
    }
    if (nextTags.length > 0) {
      params.set("tags", nextTags.join(","));
    } else {
      params.delete("tags");
    }
    router.replace(`/dashboard?${params.toString()}`);
  };

  const handleSelectAllTags = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tags");
    router.replace(`/dashboard?${params.toString()}`);
  };

  // Excel export adhering to strict 2-tab export specification
  const handleExcelExport = async () => {
    setIsExporting(true);
    startLoading();
    try {
      const startStr = dateRanges.start.toISOString().split("T")[0];
      const endStr = dateRanges.end.toISOString().split("T")[0];

      const queryParams = new URLSearchParams();
      queryParams.set("startDate", startStr);
      queryParams.set("endDate", endStr);
      if (selectedTagsParam.length > 0) {
        queryParams.set("tagIds", selectedTagsParam.join(","));
        const names = selectedTagsParam
          .map((id) => tagMap.get(id)?.name)
          .filter(Boolean) as string[];
        if (names.length > 0) {
          queryParams.set("tagNames", names.join(","));
        }
      }

      const response = await fetch(`/api/export/excel?${queryParams.toString()}`);
      if (!response.ok) throw new Error("Excel export failed");

      // Extract filename from Content-Disposition header
      const disposition = response.headers.get("Content-Disposition");
      let downloadFilename = `budget-tracker-export-${startStr}-to-${endStr}.xlsx`;
      if (disposition) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          downloadFilename = match[1];
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error("Failed to download Excel export. Please try again.");
    } finally {
      setIsExporting(false);
      stopLoading();
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Overview &amp; Spend Analytics
          </span>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight">
            Financial <em>Pacing</em>
          </h1>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExcelExport}
            isLoading={isExporting}
            icon={<Download className="w-4 h-4" />}
            className="text-xs sm:text-sm"
          >
            Export Excel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => syncNow()}
            isLoading={isSyncing}
            icon={<RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-emerald-500" : ""}`} />}
            className="text-xs sm:text-sm"
          >
            Sync
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsAddExpenseOpen(true)}
            icon={<Plus className="w-4 h-4 stroke-[2.5]" />}
            className="shadow-emerald-500/20 shadow-lg"
          >
            Add Expense
          </Button>
        </div>
      </div>

      {/* Savings Balance Banner — only shown when savings have been logged */}
      {(savingsBalance.totalSaved > 0 || savingsBalance.totalFromSavings > 0) && (
        <Link
          href="/savings"
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 rounded-2xl border transition-all duration-200 group cursor-pointer ${
            savingsBalance.balance >= 0
              ? "bg-teal-500/[0.07] dark:bg-teal-500/[0.1] border-teal-500/25 hover:border-teal-500/50 hover:bg-teal-500/[0.12]"
              : "bg-rose-500/[0.07] dark:bg-rose-500/[0.1] border-rose-500/25 hover:border-rose-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                savingsBalance.balance >= 0
                  ? "bg-teal-500/15 text-teal-600 dark:text-teal-400 group-hover:scale-105 transition-transform"
                  : "bg-rose-500/15 text-rose-500"
              }`}
            >
              <PiggyBank className="w-4.5 h-4.5" />
            </div>
            <div>
              <p
                className={`text-[10px] font-bold uppercase tracking-widest ${
                  savingsBalance.balance >= 0
                    ? "text-teal-700 dark:text-teal-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                Savings Balance
              </p>
              <p className="text-[var(--text-muted)] text-xs mt-0.5">
                {formatAmount(savingsBalance.totalSaved)} saved &nbsp;·&nbsp;{" "}
                {formatAmount(savingsBalance.totalFromSavings)} withdrawn
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-xl sm:text-2xl font-serif-display font-semibold ${
                savingsBalance.balance >= 0
                  ? "text-teal-700 dark:text-teal-300"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {savingsBalance.balance >= 0 ? "+" : ""}
              {formatAmount(savingsBalance.balance)}
            </span>
            <ArrowRight className="w-4 h-4 text-teal-600 dark:text-teal-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all hidden sm:block" />
          </div>
        </Link>
      )}

      {/* Filter Bar: Date Presets & Multi-Tag Selector */}
      <GlassCard variant="light" className="p-3 sm:p-3.5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <DateRangeFilter
            period={periodParam}
            startDate={dateRanges.start}
            endDate={dateRanges.end}
            onSelectPeriod={handleSelectPeriod}
          />

          <div className="text-xs text-[var(--text-muted)] hidden md:block">
            {currentExpenses.length} transaction{currentExpenses.length === 1 ? "" : "s"} logged
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="pt-2 border-t border-black/[0.04] dark:border-white/[0.06]">
            <TagFilter
              tags={allTags}
              selectedTagIds={selectedTagsParam}
              onToggleTag={handleToggleTag}
              onSelectAll={handleSelectAllTags}
            />
          </div>
        )}
      </GlassCard>


      {/* Hero Section: Summary Stats + Spending Activity Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Summary Stats Card */}
        <GlassCard
          variant="strong"
          className="lg:col-span-5 p-4 sm:p-6 lg:p-7 flex flex-col gap-5"
        >
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              Period Summary
            </span>
            <h2 className="text-lg sm:text-xl font-serif-display font-medium text-[var(--text-primary)] mt-0.5">
              Spend at a Glance
            </h2>
          </div>

          {/* 2×2 stat grid */}
          <div className="grid grid-cols-2 gap-3 flex-1">
            {/* Total Spend */}
            <div className="flex flex-col justify-between p-4 rounded-2xl bg-emerald-500/[0.07] dark:bg-emerald-500/[0.1] border border-emerald-500/20 overflow-hidden">
              <div className="flex items-center justify-between gap-1.5 mb-2.5 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 truncate">
                  Total Spend
                </span>
                <div className="w-7 h-7 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <span
                className="text-base sm:text-xl lg:text-2xl font-heading font-bold text-[var(--text-primary)] tracking-tight leading-tight truncate block"
                title={currentExpenses.length > 0 ? formatAmount(totalSpend) : "—"}
              >
                {currentExpenses.length > 0 ? formatAmount(totalSpend) : "—"}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] mt-1.5 truncate block">this period</span>
            </div>

            {/* Transactions */}
            <div className="flex flex-col justify-between p-4 rounded-2xl bg-teal-500/[0.07] dark:bg-teal-500/[0.1] border border-teal-500/20 overflow-hidden">
              <div className="flex items-center justify-between gap-1.5 mb-2.5 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 truncate">
                  Transactions
                </span>
                <div className="w-7 h-7 rounded-xl bg-teal-500/15 flex items-center justify-center shrink-0">
                  <Receipt className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                </div>
              </div>
              <span className="text-base sm:text-xl lg:text-2xl font-heading font-bold text-[var(--text-primary)] tracking-tight leading-tight truncate block">
                {currentExpenses.length > 0 ? currentExpenses.length : "—"}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] mt-1.5 truncate block">
                {currentExpenses.length === 1 ? "expense logged" : "expenses logged"}
              </span>
            </div>

            {/* Top Category */}
            <div className="flex flex-col justify-between p-4 rounded-2xl bg-indigo-500/[0.07] dark:bg-indigo-500/[0.1] border border-indigo-500/20 overflow-hidden">
              <div className="flex items-center justify-between gap-1.5 mb-2.5 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 truncate">
                  Top Category
                </span>
                <div className="w-7 h-7 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
                  <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
              <span
                className="text-sm sm:text-base font-heading font-semibold text-[var(--text-primary)] leading-snug truncate block capitalize"
                title={categoryBreakdown[0]?.name || "—"}
              >
                {categoryBreakdown[0]?.name || "—"}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] mt-1.5 truncate block">
                {categoryBreakdown[0] ? `${categoryBreakdown[0].percentage}% of spend` : "no data yet"}
              </span>
            </div>

            {/* Avg / Day */}
            <div className="flex flex-col justify-between p-4 rounded-2xl bg-amber-500/[0.07] dark:bg-amber-500/[0.1] border border-amber-500/20 overflow-hidden">
              <div className="flex items-center justify-between gap-1.5 mb-2.5 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 truncate">
                  Avg / Day
                </span>
                <div className="w-7 h-7 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <span
                className="text-base sm:text-xl lg:text-2xl font-heading font-bold text-[var(--text-primary)] tracking-tight leading-tight truncate block"
                title={currentExpenses.length > 0 ? formatAmount(avgPerDay) : "—"}
              >
                {currentExpenses.length > 0 ? formatAmount(avgPerDay) : "—"}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] mt-1.5 truncate block">{elapsedDays}d elapsed</span>
            </div>
          </div>
        </GlassCard>

        {/* Spending Activity Chart Card */}
        <GlassCard variant="mid" className="lg:col-span-7 flex flex-col justify-between p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-serif-display font-medium text-[var(--text-primary)]">
                Spending Activity
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Daily distribution across this period (zero-filled)
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span>{currentExpenses.length} entries</span>
            </div>
          </div>

          <SpendingActivityChart
            expenses={currentExpenses}
            startDate={dateRanges.start}
            endDate={dateRanges.end}
            currencySymbol={currencyInfo.symbol}
            onAddExpense={() => setIsAddExpenseOpen(true)}
            height={240}
          />
        </GlassCard>
      </div>

      {/* Category Breakdown Section */}
      <GlassCard variant="mid" className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg sm:text-xl font-serif-display font-medium text-[var(--text-primary)]">
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
          <div className="overflow-y-auto max-h-[calc(100vh-480px)] pr-2 -mr-2 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pb-4">
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
