"use client";

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Plus, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { fillDailySeries, DailySeriesPoint } from "@/lib/analytics/fillDailySeries";

interface SpendingActivityChartProps {
  expenses: Array<{ date: string | Date; amount: number }>;
  startDate: Date;
  endDate: Date;
  currencySymbol: string;
  onAddExpense?: () => void;
  height?: number;
}

export function SpendingActivityChart({
  expenses,
  startDate,
  endDate,
  currencySymbol,
  onAddExpense,
  height = 260,
}: SpendingActivityChartProps) {
  const data: DailySeriesPoint[] = useMemo(() => {
    return fillDailySeries(expenses, startDate, endDate);
  }, [expenses, startDate, endDate]);

  const hasExpenses = useMemo(() => {
    return expenses.length > 0 && expenses.some((e) => e.amount > 0);
  }, [expenses]);

  const maxAmount = useMemo(() => {
    if (data.length === 0) return 100;
    const max = Math.max(...data.map((d) => d.amount));
    return max > 0 ? max : 100;
  }, [data]);

  // Determine tick interval for XAxis depending on number of days
  const interval = useMemo(() => {
    if (data.length <= 14) return 0;
    if (data.length <= 31) return 3;
    if (data.length <= 90) return 9;
    return Math.floor(data.length / 8);
  }, [data.length]);

  if (!hasExpenses) {
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-black/[0.08] dark:border-white/[0.1] rounded-2xl bg-black/[0.01] dark:bg-white/[0.01]"
      >
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h4 className="text-base font-medium text-[var(--text-primary)]">
          No spending recorded in this period
        </h4>
        <p className="text-xs text-[var(--text-muted)] max-w-sm mt-1 mb-4">
          There are no logged expenses matching the active date range and filter criteria.
        </p>
        {onAddExpense && (
          <Button
            size="sm"
            variant="primary"
            onClick={onAddExpense}
            className="flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -16, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="currentColor"
            className="text-black/[0.05] dark:text-white/[0.06]"
          />
          <XAxis
            dataKey="date"
            interval={interval}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickFormatter={(val) => `${currencySymbol}${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`}
            domain={[0, Math.ceil(maxAmount * 1.15)]}
          />
          <Tooltip
            cursor={{ fill: "currentColor", className: "text-black/[0.03] dark:text-white/[0.04]" }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as DailySeriesPoint;
                return (
                  <div className="bg-[var(--surface-overlay)] backdrop-blur-md border border-[var(--border-subtle)] px-3 py-2 rounded-xl shadow-lg">
                    <p className="text-[11px] font-medium text-[var(--text-muted)]">
                      {item.fullDate}
                    </p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">
                      {currencySymbol}
                      {item.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
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
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            className="transition-all duration-300 hover:opacity-85"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
