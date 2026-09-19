"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ReceiptText, User, Plus } from "lucide-react";

interface BottomNavProps {
  onOpenAddExpense?: () => void;
}

export function BottomNav({ onOpenAddExpense }: BottomNavProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Expenses", href: "/expenses", icon: ReceiptText },
    { label: "Profile", href: "/profile", icon: User },
  ];

  return (
    <div className="fixed bottom-3 left-4 right-4 z-40 lg:hidden pointer-events-none pb-[env(safe-area-inset-bottom,0px)]">
      <div className="glass-strong border border-white/60 dark:border-white/10 rounded-full px-4 py-2.5 shadow-2xl flex items-center justify-around pointer-events-auto backdrop-blur-2xl">
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center min-w-[48px] min-h-[44px] transition-colors ${
            pathname === "/dashboard"
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Home</span>
        </Link>

        {/* Center Add Action Button */}
        <button
          onClick={onOpenAddExpense}
          aria-label="Add Expense"
          className="min-h-[48px] min-w-[48px] -mt-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40 border-2 border-white/80 dark:border-zinc-800 active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>

        {/* Expenses */}
        <Link
          href="/expenses"
          className={`flex flex-col items-center justify-center min-w-[48px] min-h-[44px] transition-colors ${
            pathname === "/expenses"
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <ReceiptText className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Expenses</span>
        </Link>

        {/* Profile */}
        <Link
          href="/profile"
          className={`flex flex-col items-center justify-center min-w-[48px] min-h-[44px] transition-colors ${
            pathname === "/profile"
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
