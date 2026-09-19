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
  LogOut,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useSync } from "@/lib/offline/useSync";
import { useAuth } from "@/context/AuthContext";

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { status, pendingCount } = useSync();
  const { user, logout } = useAuth();

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

  return (
    <aside className="hidden lg:flex flex-col w-72 h-[calc(100vh-2rem)] sticky top-4 my-4 ml-4 glass-strong rounded-[28px] p-6 border border-white/60 dark:border-white/10 shadow-2xl justify-between shrink-0 z-20 backdrop-blur-2xl">
      {/* Top Section: Brand & Navigation */}
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="space-y-3">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-2xl overflow-hidden shadow-md border border-white/70 dark:border-white/10 shrink-0 group-hover:scale-105 transition-transform duration-200">
              <Image
                src="/logo.png"
                alt="BudgetFlow Logo"
                width={44}
                height={44}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <span className="font-heading font-bold text-xl tracking-tight text-[var(--text-primary)] block">
                Budget<span className="text-emerald-500 font-medium">Flow</span>
              </span>
              <span className="text-[11px] text-[var(--text-muted)] tracking-wide uppercase font-medium">
                Finance Ledger
              </span>
            </div>
          </Link>

          {/* Sync Status Badge (Dedicated Clean Row) */}
          <div className="pt-1">
            {status === "offline" ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Offline Mode (Local Dexie)</span>
              </div>
            ) : status === "syncing" || pendingCount > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 animate-pulse">
                <CloudUpload className="w-3.5 h-3.5 text-emerald-500" />
                <span>Syncing ({pendingCount} pending)</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-xs animate-pulse" />
                <span>Cloud & Local Synced</span>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-black/5 dark:bg-white/5" />

        {/* Navigation Links */}
        <nav className="space-y-2">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-500/25 translate-x-1"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isActive
                      ? "text-white stroke-[2.2]"
                      : "text-[var(--text-muted)]"
                  }`}
                />
                <span className="font-heading">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer: Theme Switcher & User Profile Card */}
      <div className="space-y-3 pt-4 border-t border-black/5 dark:border-white/5">
        {/* Theme Segmented Switcher */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-between w-full px-4 py-2.5 rounded-2xl text-xs font-medium glass-light border border-white/60 dark:border-white/10 hover:bg-white/40 dark:hover:bg-white/5 transition-all text-[var(--text-secondary)] shadow-xs"
        >
          <span className="flex items-center gap-2">
            {theme === "dark" ? (
              <Moon className="w-4 h-4 text-emerald-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            <span className="font-medium">
              {theme === "dark" ? "Dark Theme" : "Light Theme"}
            </span>
          </span>
          <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
            Switch
          </span>
        </button>

        {/* User Profile Glass Card */}
        <div className="p-2.5 rounded-2xl glass-light border border-white/60 dark:border-white/10 flex items-center justify-between gap-2 shadow-xs hover:border-emerald-500/40 transition-all group/profile">
          <Link
            href="/profile"
            className="flex items-center gap-3 min-w-0 flex-1 p-1 -m-1 rounded-xl cursor-pointer"
            title="Open Profile & Settings"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-emerald-400 text-white font-heading font-bold flex items-center justify-center text-sm shadow-sm shrink-0 group-hover/profile:scale-105 transition-transform">
              {user?.name ? user.name[0].toUpperCase() : "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate font-heading group-hover/profile:text-emerald-600 dark:group-hover/profile:text-emerald-400 transition-colors">
                {user?.name || "Account"}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] truncate">
                {user?.email || "Personal Budget"}
              </p>
            </div>
          </Link>

          <button
            onClick={(e) => {
              e.stopPropagation();
              logout();
            }}
            title="Sign Out"
            aria-label="Sign Out"
            className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
