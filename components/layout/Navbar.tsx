"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Sun, Moon, CloudCheck, CloudUpload, WifiOff } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useSync } from "@/lib/offline/useSync";

export function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { status, pendingCount } = useSync();

  return (
    // Only displayed on mobile (< lg), desktop uses the full Sidebar
    <header className="lg:hidden sticky top-0 z-30 w-full glass-mid border-b border-white/60 dark:border-white/10 backdrop-blur-2xl px-4 py-2.5 shadow-sm transition-colors">
      <div className="flex items-center justify-between">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl overflow-hidden shadow-sm shrink-0 border border-white/60 dark:border-white/10">
            <Image
              src="/logo.png"
              alt="BudgetFlow Logo"
              width={32}
              height={32}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="font-heading font-semibold text-base tracking-tight text-[var(--text-primary)]">
            Budget<span className="text-emerald-500 dark:text-emerald-400 font-normal">Flow</span>
          </span>
        </Link>

        {/* Right Status & Controls */}
        <div className="flex items-center gap-2">
          {/* Sync Status Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-xs">
            {status === "offline" ? (
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <WifiOff className="w-3 h-3" />
                <span className="text-[11px] font-medium">Offline</span>
              </div>
            ) : status === "syncing" || pendingCount > 0 ? (
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 animate-pulse">
                <CloudUpload className="w-3 h-3" />
                <span className="text-[11px] font-medium">{pendingCount} sync</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CloudCheck className="w-3 h-3" />
                <span className="text-[11px] font-medium">Synced</span>
              </div>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="min-h-[38px] min-w-[38px] rounded-xl glass-light border border-white/60 dark:border-white/10 flex items-center justify-center text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all shadow-xs"
          >
            {theme === "dark" ? (
              <Moon className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
