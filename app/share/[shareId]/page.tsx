"use client";

import React, { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { AlertCircle, Moon, Sun, Plane } from "lucide-react";
import { format, parseISO } from "date-fns";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { useTheme } from "@/context/ThemeContext";
import { Loader } from "@/components/ui/Loader";
import { GENERAL_TRIP_ID } from "@/lib/trips";

import { SharedData } from "@/components/share/types";
import { TripSwitcher } from "@/components/share/TripSwitcher";
import { SharedMetricCards } from "@/components/share/SharedMetricCards";
import { SharedSpendingBreakdown } from "@/components/share/SharedSpendingBreakdown";
import { SharedCategoryBreakdown } from "@/components/share/SharedCategoryBreakdown";
import { SharedExpensesList } from "@/components/share/SharedExpensesList";

function SharedDashboardContent({ shareId }: { shareId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTripId, setSelectedTripId] = useState<string | null>(() =>
    searchParams.get("tripId")
  );

  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const fetchSharedData = async () => {
      if (data) setIsFetching(true);
      try {
        const month = currentDate.getMonth() + 1;
        const year = currentDate.getFullYear();
        const query = new URLSearchParams({ month: String(month), year: String(year) });
        if (selectedTripId) query.set("tripId", selectedTripId);
        const res = await fetch(`/api/share/${shareId}?${query.toString()}`);
        const result = await res.json();

        if (res.ok && result.success) {
          setData(result.data);
          if (result.data.combined && !selectedTripId) {
            setSelectedTripId(result.data.combined.selectedTripId);
          }
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
  }, [shareId, currentDate, selectedTripId]);

  const handleSelectTrip = (tripId: string) => {
    if (tripId === selectedTripId) return;
    setCurrentDate(new Date());
    setSelectedTripId(tripId);
    const query = new URLSearchParams(searchParams.toString());
    query.set("tripId", tripId);
    router.replace(`/share/${shareId}?${query.toString()}`);
  };

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
          <p className="text-[var(--text-secondary)]">
            {error || "This link may be invalid or sharing has been disabled."}
          </p>
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
  const isFullMode = data.mode === "full";

  const formatRange = (range: { from: string | null; to: string | null } | null) => {
    if (!range?.from || !range?.to) return null;
    const from = parseISO(range.from);
    const to = parseISO(range.to);
    const sameYear = from.getFullYear() === to.getFullYear();
    return `${format(from, "d MMM")} – ${format(to, sameYear ? "d MMM yyyy" : "d MMM yyyy")}`;
  };

  const transitionClass = `transition-opacity duration-300 ${
    isFetching ? "opacity-50" : "opacity-100"
  }`;

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
            aria-label="Toggle color theme"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <PageHeader title={<>{data.userName}&apos;s <em>Finances</em></>} />

        {/* Trip Switcher / Banner if applicable */}
        {(!isGeneral || data.combined) && (
          <div className="flex items-center justify-between gap-2 -mt-4">
            <div className="flex items-center gap-2 min-w-0">
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
              <span className="text-lg font-serif-display font-medium text-[var(--text-primary)] truncate">
                {data.trip.name}
              </span>
              {data.trip.status === "completed" && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-[var(--text-muted)] shrink-0">
                  Completed
                </span>
              )}
            </div>
            {data.combined && <TripSwitcher combined={data.combined} onSelect={handleSelectTrip} />}
          </div>
        )}

        {/* Spend & Savings Metric Cards */}
        <SharedMetricCards
          isFullMode={isFullMode}
          totalSpent={data.totalSpent}
          totalSpentThisMonth={data.totalSpentThisMonth}
          totalSavings={data.totalSavings}
          month={data.month}
          expenseCount={data.expenseCount}
          dailyAverage={data.dailyAverage}
          formattedRange={formatRange(data.range)}
          formatAmount={formatAmount}
        />

        {/* Spending Breakdown Section (Day, Week, Month with Graph & Table) */}
        <SharedSpendingBreakdown
          expenses={data.recentExpenses}
          currencySymbol={currencyInfo.symbol}
          formatAmount={formatAmount}
          isFullMode={isFullMode}
          dateRange={data.range}
          currentDate={currentDate}
          tripStartDate={data.trip.startDate}
          tripEndDate={data.trip.endDate}
          className={transitionClass}
        />

        {/* Category Breakdown Card */}
        <SharedCategoryBreakdown
          categories={data.categoryBreakdown}
          isFullMode={isFullMode}
          month={data.month}
          year={data.year}
          currentDate={currentDate}
          onPrevMonth={() =>
            setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
          }
          onNextMonth={() =>
            setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
          }
          formatAmount={formatAmount}
          className={transitionClass}
        />

        {/* Recent / All Expenses Card */}
        <SharedExpensesList
          expenses={data.recentExpenses}
          isFullMode={isFullMode}
          month={data.month}
          year={data.year}
          formatAmount={formatAmount}
          formatExpenseDate={formatExpenseDate}
          className={transitionClass}
          resetKey={`${shareId}-${currentDate.toISOString()}-${selectedTripId}`}
        />
      </main>
    </div>
  );
}

export default function SharedDashboardPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = use(params);

  return (
    <Suspense fallback={<Loader fullScreen message="Loading shared dashboard..." showBrand />}>
      <SharedDashboardContent shareId={shareId} />
    </Suspense>
  );
}
