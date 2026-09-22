"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  PieChart,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Plane,
} from "lucide-react";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { useTheme } from "@/context/ThemeContext";
import { Loader } from "@/components/ui/Loader";
import { GENERAL_TRIP_ID } from "@/lib/trips";

interface CategoryBreakdown {
  tagId: string;
  tagName: string;
  colorKey: string;
  total: number;
  percentage: string;
  isMirrored?: boolean;
  sourceTripId?: string;
  sourceTripName?: string;
}

interface RecentExpenseTag {
  name: string;
  colorKey: string;
}

interface RecentExpenseSourceTrip {
  tripId: string;
  name: string;
  emoji: string;
  colorKey: string;
}

interface RecentExpense {
  date: string;
  note: string;
  amount: number;
  tags: RecentExpenseTag[];
  sourceTrip: RecentExpenseSourceTrip | null;
}

interface TripInfo {
  tripId: string;
  name: string;
  emoji: string;
  colorKey: string;
  status: "active" | "completed";
  startDate: string | null;
  endDate: string | null;
}

interface SharedData {
  userName: string;
  currency: string;
  totalSpentThisMonth: number;
  totalSavings: number | null;
  categoryBreakdown: CategoryBreakdown[];
  recentExpenses: RecentExpense[];
  trip: TripInfo;
  month: string;
  year: number;
}

function FromTripPill({
  name,
  emoji,
  colorKey,
}: {
  name: string;
  emoji?: string;
  colorKey?: string;
}) {
  const color = colorKey || "#22C55E";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full font-medium border max-w-[160px] px-2 py-0.5 text-[10px]"
      style={{ backgroundColor: `${color}1F`, borderColor: `${color}40`, color }}
      title={`From ${name}`}
    >
      {emoji ? <span className="shrink-0">{emoji}</span> : <Plane className="w-3 h-3 shrink-0" />}
      <span className="truncate">From {name}</span>
    </span>
  );
}

export default function SharedDashboardPage({ params }: { params: Promise<{ shareId: string }> }) {
  // Unwrap params according to Next.js 15+ conventions
  const { shareId } = use(params);

  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const fetchSharedData = async () => {
      if (data) setIsFetching(true);
      try {
        const month = currentDate.getMonth() + 1;
        const year = currentDate.getFullYear();
        const res = await fetch(`/api/share/${shareId}?month=${month}&year=${year}`);
        const result = await res.json();

        if (res.ok && result.success) {
          setData(result.data);
        } else {
          setError(result.error || "Failed to load shared dashboard.");
        }
      } catch {
        setError("Network error. Please try again later.");
      } finally {
        setLoading(false);
        setIsFetching(false);
      }
    };

    fetchSharedData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId, currentDate]);

  if (loading) {
    return <Loader fullScreen message="Loading shared dashboard..." showBrand />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 p-4">
        <GlassCard className="max-w-md w-full p-8 text-center space-y-4 border-rose-500/20">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-2">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Dashboard Unavailable</h1>
          <p className="text-[var(--text-secondary)]">{error || "This link may be invalid or sharing has been disabled."}</p>
        </GlassCard>
      </div>
    );
  }

  const currencyInfo = SUPPORTED_CURRENCIES[data.currency] || SUPPORTED_CURRENCIES["INR"];
  const formatAmount = (val: number) => {
    return new Intl.NumberFormat(currencyInfo.locale, {
      style: "currency",
      currency: data.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };
  const formatExpenseDate = (val: string) =>
    new Date(val).toLocaleDateString("en-US", { day: "numeric", month: "short" });

  const isGeneral = data.trip.tripId === GENERAL_TRIP_ID;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 font-sans selection:bg-emerald-500/30">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-teal-500/10 blur-[120px]" />
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-24 space-y-8">

        {/* Top Navbar */}
        <div className="flex items-center justify-between mb-2">
          <Link href="/" className="flex items-center gap-2 group">
            <Image
              src="/logo.png"
              alt="BudgetFlow Logo"
              width={40}
              height={40}
              className="rounded-xl shadow-md group-hover:shadow-lg transition-all"
            />
            <span className="font-serif-display font-bold text-lg tracking-tight text-[var(--text-primary)]">
              BudgetFlow
            </span>
          </Link>

          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <PageHeader
          title={<>{data.userName}&apos;s <em>Finances</em></>}
        />

        {!isGeneral && (
          <div className="flex items-center gap-2 -mt-4">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 border"
              style={{
                backgroundColor: `${data.trip.colorKey || "#22C55E"}20`,
                borderColor: `${data.trip.colorKey || "#22C55E"}40`,
                color: data.trip.colorKey || "#22C55E",
              }}
            >
              {data.trip.emoji || <Plane className="w-4 h-4" />}
            </span>
            <span className="text-lg font-serif-display font-medium text-[var(--text-primary)]">
              {data.trip.name}
            </span>
            {data.trip.status === "completed" && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-[var(--text-muted)]">
                Completed
              </span>
            )}
          </div>
        )}

        <div className={`grid grid-cols-1 ${data.totalSavings !== null ? "md:grid-cols-2" : ""} gap-6`}>
          {/* Spend Card */}
          <GlassCard variant="strong" className="p-6 sm:p-8 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <TrendingDown className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Spent in {data.month}
              </h2>
            </div>
            <div className="text-4xl sm:text-5xl font-serif-display font-bold text-[var(--text-primary)] tracking-tight">
              {formatAmount(data.totalSpentThisMonth)}
            </div>
          </GlassCard>

          {/* Savings Card */}
          {data.totalSavings !== null && (
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
                {formatAmount(data.totalSavings)}
              </div>
            </GlassCard>
          )}
        </div>

        {/* Category Breakdown */}
        <GlassCard variant="mid" className={`p-6 sm:p-8 transition-opacity duration-300 ${isFetching ? 'opacity-50' : 'opacity-100'}`}>
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
                  For {data.month} {data.year}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className="p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-[var(--text-secondary)] cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium w-24 text-center text-[var(--text-primary)]">
                {data.month} {data.year}
              </span>
              <button
                onClick={() => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className="p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-[var(--text-secondary)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={currentDate.getMonth() === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear()}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {data.categoryBreakdown.length > 0 ? (
            <div className="space-y-4">
              {data.categoryBreakdown.map((cat) => (
                <div key={cat.tagId} className="group flex items-center gap-4 p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                    style={{ backgroundColor: `${cat.colorKey}20`, color: cat.colorKey }}
                  >
                    <span className="text-sm font-bold">{cat.tagName.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0).toUpperCase() || cat.tagName.charAt(0)}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          {cat.tagName}
                        </span>
                        {cat.isMirrored && (
                          <FromTripPill name={cat.sourceTripName || cat.tagName} colorKey={cat.colorKey} />
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
                            backgroundColor: cat.colorKey
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
              No expenses recorded for this month.
            </div>
          )}
        </GlassCard>

        {/* Recent Expenses */}
        <GlassCard variant="mid" className={`p-6 sm:p-8 transition-opacity duration-300 ${isFetching ? 'opacity-50' : 'opacity-100'}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-serif-display font-medium text-[var(--text-primary)]">
                Recent Expenses
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                For {data.month} {data.year}
              </p>
            </div>
          </div>

          {data.recentExpenses.length > 0 ? (
            <div className="space-y-2">
              {data.recentExpenses.map((exp, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="w-14 shrink-0 text-xs font-medium text-[var(--text-muted)]">
                    {formatExpenseDate(exp.date)}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-[var(--text-primary)] truncate">
                      {exp.note || "Expense"}
                    </span>
                    {exp.tags.map((tag) => (
                      <span
                        key={tag.name}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0"
                        style={{
                          backgroundColor: `${tag.colorKey}1F`,
                          borderColor: `${tag.colorKey}40`,
                          color: tag.colorKey,
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {exp.sourceTrip && (
                      <FromTripPill
                        name={exp.sourceTrip.name}
                        emoji={exp.sourceTrip.emoji}
                        colorKey={exp.sourceTrip.colorKey}
                      />
                    )}
                  </div>
                  <div className="shrink-0 font-serif-display font-medium text-[var(--text-primary)]">
                    {formatAmount(exp.amount)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-[var(--text-muted)]">
              No expenses recorded for this month.
            </div>
          )}
        </GlassCard>

      </main>
    </div>
  );
}
