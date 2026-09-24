"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  parseISO,
  isSameDay,
} from "date-fns";
import {
  BarChart3,
  Calendar,
  Flame,
  Coins,
  TrendingUp,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

export interface SharedExpenseItem {
  date: string;
  amount: number;
  note?: string;
  tags?: Array<{ name: string; colorKey: string }>;
}

export interface SharedSpendingBreakdownProps {
  expenses: SharedExpenseItem[];
  currencySymbol: string;
  formatAmount: (val: number) => string;
  isFullMode: boolean;
  dateRange?: { from: string | null; to: string | null } | null;
  currentDate: Date;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  className?: string;
}

type PeriodType = "day" | "week" | "month";

interface BreakdownItem {
  id: string;
  label: string;
  shortLabel: string;
  subLabel: string;
  fullLabel: string;
  amount: number;
  count: number;
  percentage: number;
  rawDate: Date;
}

export function SharedSpendingBreakdown({
  expenses,
  currencySymbol,
  formatAmount,
  isFullMode,
  dateRange,
  currentDate,
  tripStartDate,
  tripEndDate,
  className,
}: SharedSpendingBreakdownProps) {
  const [period, setPeriod] = useState<PeriodType>("day");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Compute overall start and end dates for the active dataset
  const { effectiveStart, effectiveEnd } = useMemo(() => {
    let s: Date;
    let e: Date;

    if (isFullMode) {
      if (dateRange?.from && dateRange?.to) {
        s = parseISO(dateRange.from);
        e = parseISO(dateRange.to);
      } else if (tripStartDate && tripEndDate) {
        s = parseISO(tripStartDate);
        e = parseISO(tripEndDate);
      } else if (expenses.length > 0) {
        const timestamps = expenses
          .map((item) => new Date(item.date).getTime())
          .filter((t) => !isNaN(t));
        s = new Date(Math.min(...timestamps));
        e = new Date(Math.max(...timestamps));
      } else {
        s = new Date();
        e = new Date();
      }
    } else {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      s = new Date(year, month, 1);
      e = new Date(year, month + 1, 0, 23, 59, 59, 999);
    }

    // Expand boundary if any logged expense falls outside the expected range
    for (const item of expenses) {
      const d = new Date(item.date);
      if (!isNaN(d.getTime())) {
        if (d < s) s = d;
        if (d > e) e = d;
      }
    }

    const start = s <= e ? s : e;
    const end = s <= e ? e : s;
    return { effectiveStart: start, effectiveEnd: end };
  }, [isFullMode, dateRange, tripStartDate, tripEndDate, expenses, currentDate]);

  const totalSpend = useMemo(() => {
    return expenses.reduce((acc, curr) => acc + curr.amount, 0);
  }, [expenses]);

  // Daily breakdown series
  const dailySeries = useMemo<BreakdownItem[]>(() => {
    let days: Date[] = [];
    try {
      days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
    } catch {
      days = [effectiveStart];
    }

    // Aggregate expenses by day
    const amountMap = new Map<string, { amount: number; count: number }>();
    for (const exp of expenses) {
      const d = new Date(exp.date);
      if (isNaN(d.getTime())) continue;
      const key = format(d, "yyyy-MM-dd");
      const current = amountMap.get(key) || { amount: 0, count: 0 };
      amountMap.set(key, {
        amount: current.amount + exp.amount,
        count: current.count + 1,
      });
    }

    return days.map((day) => {
      const key = format(day, "yyyy-MM-dd");
      const data = amountMap.get(key) || { amount: 0, count: 0 };
      const percentage = totalSpend > 0 ? (data.amount / totalSpend) * 100 : 0;

      return {
        id: key,
        label: format(day, "d MMM"),
        shortLabel: format(day, "d"),
        subLabel: format(day, "EEE"),
        fullLabel: format(day, "EEEE, d MMM yyyy"),
        amount: Math.round(data.amount * 100) / 100,
        count: data.count,
        percentage,
        rawDate: day,
      };
    });
  }, [effectiveStart, effectiveEnd, expenses, totalSpend]);

  // Weekly breakdown series
  const weeklySeries = useMemo<BreakdownItem[]>(() => {
    let weekStarts: Date[] = [];
    try {
      weekStarts = eachWeekOfInterval(
        { start: effectiveStart, end: effectiveEnd },
        { weekStartsOn: 1 }
      );
    } catch {
      weekStarts = [startOfWeek(effectiveStart, { weekStartsOn: 1 })];
    }

    return weekStarts.map((wStart) => {
      const wEnd = endOfWeek(wStart, { weekStartsOn: 1 });
      const wStartMs = wStart.getTime();
      const wEndMs = wEnd.getTime();

      let amount = 0;
      let count = 0;
      for (const exp of expenses) {
        const d = new Date(exp.date).getTime();
        if (d >= wStartMs && d <= wEndMs) {
          amount += exp.amount;
          count += 1;
        }
      }

      const percentage = totalSpend > 0 ? (amount / totalSpend) * 100 : 0;
      const weekNumber = format(wStart, "w");
      const label = `${format(wStart, "d MMM")} – ${format(wEnd, "d MMM")}`;

      return {
        id: `week-${format(wStart, "yyyy-MM-dd")}`,
        label,
        shortLabel: `W${weekNumber}`,
        subLabel: label,
        fullLabel: `Week ${weekNumber}: ${format(wStart, "d MMM")} – ${format(wEnd, "d MMM yyyy")}`,
        amount: Math.round(amount * 100) / 100,
        count,
        percentage,
        rawDate: wStart,
      };
    });
  }, [effectiveStart, effectiveEnd, expenses, totalSpend]);

  // Monthly breakdown series
  const monthlySeries = useMemo<BreakdownItem[]>(() => {
    let monthStarts: Date[] = [];
    try {
      monthStarts = eachMonthOfInterval({ start: effectiveStart, end: effectiveEnd });
    } catch {
      monthStarts = [startOfMonth(effectiveStart)];
    }

    return monthStarts.map((mStart) => {
      const mEnd = endOfMonth(mStart);
      const mStartMs = mStart.getTime();
      const mEndMs = mEnd.getTime();

      let amount = 0;
      let count = 0;
      for (const exp of expenses) {
        const d = new Date(exp.date).getTime();
        if (d >= mStartMs && d <= mEndMs) {
          amount += exp.amount;
          count += 1;
        }
      }

      const percentage = totalSpend > 0 ? (amount / totalSpend) * 100 : 0;

      return {
        id: `month-${format(mStart, "yyyy-MM")}`,
        label: format(mStart, "MMM yyyy"),
        shortLabel: format(mStart, "MMM"),
        subLabel: format(mStart, "yyyy"),
        fullLabel: format(mStart, "MMMM yyyy"),
        amount: Math.round(amount * 100) / 100,
        count,
        percentage,
        rawDate: mStart,
      };
    });
  }, [effectiveStart, effectiveEnd, expenses, totalSpend]);

  // Active series based on selected period
  const activeSeries = useMemo(() => {
    switch (period) {
      case "week":
        return weeklySeries;
      case "month":
        return monthlySeries;
      case "day":
      default:
        return dailySeries;
    }
  }, [period, dailySeries, weeklySeries, monthlySeries]);

  const maxAmount = useMemo(() => {
    if (activeSeries.length === 0) return 100;
    const max = Math.max(...activeSeries.map((d) => d.amount));
    return max > 0 ? max : 100;
  }, [activeSeries]);

  // Table rows: filter to periods with spend, or all if short dataset
  const tableRows = useMemo(() => {
    const withSpend = activeSeries.filter((d) => d.amount > 0);
    // If fewer than 7 total items, display all items for completeness
    if (activeSeries.length <= 7) {
      return activeSeries;
    }
    return withSpend;
  }, [activeSeries]);

  // Micro statistics
  const stats = useMemo(() => {
    const activeCount = activeSeries.filter((d) => d.amount > 0).length;
    const periodLabel = period === "day" ? "days" : period === "week" ? "weeks" : "months";
    const average = activeCount > 0 ? totalSpend / activeCount : 0;
    const peak = [...activeSeries].sort((a, b) => b.amount - a.amount)[0];

    return {
      activeCount,
      periodLabel,
      average,
      peak: peak && peak.amount > 0 ? peak : null,
    };
  }, [activeSeries, period, totalSpend]);

  // Tick interval for chart XAxis
  const chartInterval = useMemo(() => {
    if (period === "month") return 0;
    if (period === "week") return activeSeries.length > 8 ? 1 : 0;
    if (activeSeries.length <= 10) return 0;
    if (activeSeries.length <= 20) return 1;
    if (activeSeries.length <= 31) return 3;
    return Math.floor(activeSeries.length / 7);
  }, [period, activeSeries.length]);

  if (expenses.length === 0) {
    return null;
  }

  return (
    <GlassCard variant="mid" className={`p-6 sm:p-8 space-y-6 ${className || ""}`}>
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-serif-display font-medium text-[var(--text-primary)]">
              Spending Breakdown
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {period === "day" && "Day-by-day expenditure pattern"}
              {period === "week" && "Weekly spending aggregate"}
              {period === "month" && "Monthly distribution of expenses"}
            </p>
          </div>
        </div>

        {/* Controls: Period Switcher (Day / Week / Month) */}
        <div className="flex items-center">
          <div className="flex items-center p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
            <button
              type="button"
              onClick={() => setPeriod("day")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                period === "day"
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 font-semibold"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setPeriod("week")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                period === "week"
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 font-semibold"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setPeriod("month")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                period === "month"
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 font-semibold"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {/* KPI Highlight Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <Coins className="w-3.5 h-3.5 text-emerald-500" />
            <span>Total Spend</span>
          </div>
          <div className="text-base sm:text-lg font-serif-display font-bold text-[var(--text-primary)]">
            {formatAmount(totalSpend)}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <Calendar className="w-3.5 h-3.5 text-emerald-500" />
            <span>Active Periods</span>
          </div>
          <div className="text-base sm:text-lg font-serif-display font-bold text-[var(--text-primary)]">
            {stats.activeCount}{" "}
            <span className="text-xs font-sans font-normal text-[var(--text-muted)]">
              {stats.periodLabel}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span>Average / {period === "day" ? "Day" : period === "week" ? "Wk" : "Mo"}</span>
          </div>
          <div className="text-base sm:text-lg font-serif-display font-bold text-[var(--text-primary)]">
            {formatAmount(stats.average)}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>Peak Spending</span>
          </div>
          <div className="text-base sm:text-lg font-serif-display font-bold text-[var(--text-primary)] truncate">
            {stats.peak ? formatAmount(stats.peak.amount) : "—"}
            {stats.peak && (
              <span className="ml-1 text-[10px] font-sans font-normal text-[var(--text-muted)]">
                ({stats.peak.label})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop: Visual Bar Chart Only ── */}
      {isMounted && (
        <div className="hidden sm:block space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Activity Graph
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {activeSeries.length} points
            </span>
          </div>
          <div className="w-full h-[260px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activeSeries}
                margin={{ top: 10, right: 10, left: -16, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  className="text-black/[0.05] dark:text-white/[0.06]"
                />
                <XAxis
                  dataKey="label"
                  interval={chartInterval}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                  tickFormatter={(val) =>
                    `${currencySymbol}${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`
                  }
                  domain={[0, Math.ceil(maxAmount * 1.15)]}
                />
                <Tooltip
                  cursor={{
                    fill: "currentColor",
                    className: "text-black/[0.03] dark:text-white/[0.04]",
                  }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as BreakdownItem;
                      return (
                        <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-black/10 dark:border-white/10 px-3.5 py-2.5 rounded-2xl shadow-xl space-y-1">
                          <p className="text-xs font-medium text-[var(--text-muted)]">
                            {item.fullLabel}
                          </p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-serif-display font-bold text-emerald-600 dark:text-emerald-400">
                              {formatAmount(item.amount)}
                            </span>
                            <span className="text-[11px] font-medium text-[var(--text-muted)]">
                              ({item.percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            {item.count} {item.count === 1 ? "expense" : "expenses"}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="amount"
                  fill="#22C55E"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={36}
                  className="transition-all duration-300 hover:opacity-80"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Mobile: Scrollable Breakdown Table Only ── */}
      <div className="sm:hidden space-y-2">
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Breakdown Table
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {tableRows.length} active period{tableRows.length === 1 ? "" : "s"}
          </span>
        </div>

        {tableRows.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            No expenses recorded for this period.
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden border border-black/[0.06] dark:border-white/[0.08] shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-12 px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.03] border-b border-black/[0.05] dark:border-white/[0.05] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <span className="col-span-5">Period</span>
              <span className="col-span-3 text-center">Entries</span>
              <span className="col-span-4 text-right">Amount</span>
            </div>

            {/* Scrollable Rows */}
            <div
              tabIndex={0}
              role="region"
              aria-label="Scrollable Breakdown Table Rows"
              className="divide-y divide-black/[0.04] dark:divide-white/[0.04] max-h-[300px] overflow-y-auto overscroll-contain custom-scrollbar touch-pan-y"
            >
              {tableRows.map((item, idx) => {
                const pct = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0;
                return (
                  <div
                    key={item.id}
                    className={`relative grid grid-cols-12 items-center px-4 py-3 overflow-hidden transition-colors ${
                      idx % 2 === 0 ? "bg-white/40 dark:bg-white/[0.01]" : "bg-transparent"
                    }`}
                  >
                    {/* Proportional background bar */}
                    <span
                      className="absolute inset-y-0 left-0 bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12] rounded-r-full pointer-events-none transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />

                    {/* Period Label */}
                    <div className="relative col-span-5 min-w-0 pr-2">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {item.label}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                        {item.subLabel}
                      </div>
                    </div>

                    {/* Entries Count */}
                    <div className="relative col-span-3 text-center">
                      <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-[var(--text-secondary)]">
                        {item.count} {item.count === 1 ? "entry" : "entries"}
                      </span>
                    </div>

                    {/* Amount */}
                    <div className="relative col-span-4 text-right">
                      <span className="text-xs font-serif-display font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatAmount(item.amount)}
                      </span>
                      <div className="text-[9px] text-[var(--text-muted)]">
                        {item.percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Summary */}
            <div className="grid grid-cols-12 items-center px-4 py-3 bg-black/[0.03] dark:bg-white/[0.03] border-t border-black/[0.06] dark:border-white/[0.06]">
              <div className="col-span-5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Total ({stats.activeCount} active {stats.periodLabel})
              </div>
              <div className="col-span-3 text-center text-[10px] font-semibold text-[var(--text-muted)]">
                {expenses.length} entries
              </div>
              <div className="col-span-4 text-right text-xs font-bold font-serif-display text-[var(--text-primary)]">
                {formatAmount(totalSpend)}
              </div>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
