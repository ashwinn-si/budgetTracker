"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ReceiptText, Tags, User, Plus } from "lucide-react";

interface BottomNavProps {
  onOpenAddExpense?: () => void;
}

export function BottomNav({ onOpenAddExpense }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-3 left-3 right-3 z-40 lg:hidden pointer-events-none pb-[env(safe-area-inset-bottom,0px)]">
      <div className="glass-strong border border-white/60 dark:border-white/10 rounded-full px-2 py-2 shadow-2xl grid grid-cols-5 items-center pointer-events-auto backdrop-blur-2xl">
        {/* 1. Dashboard (Home) */}
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center min-h-[44px] transition-colors ${
            pathname === "/dashboard"
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Home</span>
        </Link>

        {/* 2. Expenses */}
        <Link
          href="/expenses"
          className={`flex flex-col items-center justify-center min-h-[44px] transition-colors ${
            pathname.startsWith("/expenses")
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <ReceiptText className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Expenses</span>
        </Link>

        {/* 3. Center Add Action Button */}
        <div className="flex justify-center items-center">
          <button
            onClick={onOpenAddExpense}
            aria-label="Add Expense"
            className="w-12 h-12 -mt-6 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40 border-2 border-white/80 dark:border-zinc-800 active:scale-95 transition-transform cursor-pointer"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        {/* 4. Tags */}
        <Link
          href="/tags"
          className={`flex flex-col items-center justify-center min-h-[44px] transition-colors ${
            pathname.startsWith("/tags")
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Tags className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Tags</span>
        </Link>

        {/* 5. Profile */}
        <Link
          href="/profile"
          className={`flex flex-col items-center justify-center min-h-[44px] transition-colors ${
            pathname.startsWith("/profile")
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Profile</span>
        </Link>
      </div>
    </div>
  );
}
