"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { PieChart, TrendingDown, TrendingUp, AlertCircle, Share2, Moon, Sun, ChevronLeft, ChevronRight } from "lucide-react";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { useTheme } from "@/context/ThemeContext";
import { Loader } from "@/components/ui/Loader";

interface CategoryBreakdown {
  tagId: string;
  tagName: string;
  colorKey: string;
  total: number;
  percentage: string;
}

interface SharedData {
  userName: string;
  currency: string;
  totalSpentThisMonth: number;
  totalSavings: number;
  categoryBreakdown: CategoryBreakdown[];
  month: string;
  year: number;
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <span className="text-sm font-bold">{cat.tagName.charAt(0).toUpperCase()}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-[var(--text-primary)] truncate pr-4">
                        {cat.tagName}
                      </span>
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

      </main>
    </div>
  );
}
