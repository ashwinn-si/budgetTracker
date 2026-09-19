"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ReceiptText,
  User,
  Sun,
  Moon,
  CloudCheck,
  CloudUpload,
  WifiOff,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useSync } from "@/lib/offline/useSync";
import { useAuth } from "@/context/AuthContext";

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { status, pendingCount } = useSync();
  const { user } = useAuth();

  const navItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Expenses",
      href: "/expenses",
      icon: ReceiptText,
    },
    {
      label: "Profile & Settings",
      href: "/profile",
      icon: User,
    },
  ];

  const renderSyncBadge = () => {
    if (status === "offline") {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline</span>
        </div>
      );
    }
    if (status === "syncing" || pendingCount > 0) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 animate-pulse">
          <CloudUpload className="w-3.5 h-3.5" />
          <span>{pendingCount} syncing</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
        <CloudCheck className="w-3.5 h-3.5" />
        <span>Synced</span>
      </div>
    );
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 h-[calc(100vh-2rem)] sticky top-4 my-4 ml-4 glass-strong rounded-3xl p-5 border border-white/60 dark:border-white/10 shadow-xl justify-between shrink-0 z-20">
      {/* Brand & Sync status */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-1">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-md border border-white/60 dark:border-white/10 shrink-0">
              <Image
                src="/logo.png"
                alt="BudgetFlow Logo"
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-serif-display text-xl tracking-tight text-[var(--text-primary)]">
              Budget<em className="text-emerald-500 dark:text-emerald-400 font-normal">Flow</em>
            </span>
          </Link>
          {renderSyncBadge()}
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold shadow-sm border border-emerald-500/25"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-emerald-500 dark:text-emerald-400" : "text-[var(--text-muted)]"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer controls: theme & user profile */}
      <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-3">
        <button
          onClick={toggleTheme}
          className="flex items-center justify-between w-full px-3.5 py-2 rounded-2xl text-xs font-medium text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <span className="flex items-center gap-2">
            {theme === "dark" ? <Moon className="w-3.5 h-3.5 text-emerald-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
            <span>{theme === "dark" ? "Dark Mode" : "Light Mode"}</span>
          </span>
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Toggle</span>
        </button>

        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center justify-center text-xs border border-emerald-500/30">
            {user?.name ? user.name[0].toUpperCase() : "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
              {user?.name || "Local User"}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {user?.email || "Offline mode"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
