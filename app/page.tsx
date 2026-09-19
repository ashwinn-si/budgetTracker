"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck, Zap, CloudOff, FileSpreadsheet, Lock, LayoutDashboard, Github } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

export default function HomePage() {
  const { user, isLoading } = useAuth();

  return (
    <div className="min-h-screen flex flex-col justify-between py-8 sm:py-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      {/* Top Brand Bar */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-md border border-white/60 dark:border-white/10 shrink-0">
            <Image src="/logo.png" alt="BudgetFlow Logo" width={40} height={40} className="w-full h-full object-cover" />
          </div>
          <span className="font-heading font-bold text-xl text-[var(--text-primary)]">
            Budget<span className="text-emerald-500 font-medium">Flow</span>
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <Link href="/dashboard">
              <Button variant="primary" size="sm" icon={<LayoutDashboard className="w-4 h-4" />}>
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="py-12 sm:py-16 text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 shadow-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Offline-First Personal Budget & Ledger</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-heading font-extrabold text-[var(--text-primary)] tracking-tight max-w-3xl mx-auto leading-tight sm:leading-none">
          Your money, <span className="text-emerald-500 italic font-semibold">in full view.</span>
        </h1>

        <p className="text-sm sm:text-lg text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
          Track daily expenses with instant offline resilience, analyze spend velocity with interactive charts, and export directly to your personal Google Sheet.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link href={user ? "/dashboard" : "/login"} className="w-full sm:w-auto">
            <Button variant="primary" size="lg" fullWidth icon={<ArrowRight className="w-4 h-4" />}>
              {user ? "Open Dashboard" : "Open BudgetFlow"}
            </Button>
          </Link>
          {!user && (
            <Link href="/register" className="w-full sm:w-auto">
              <Button variant="ghost" size="lg" fullWidth>
                Create Free Account
              </Button>
            </Link>
          )}
        </div>

        {/* 3 Core Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-8 sm:pt-12 text-left">
          <GlassCard variant="mid" className="p-6 space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CloudOff className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-semibold text-base text-[var(--text-primary)]">
              Offline-First Engine
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Record expenses instantly without an internet connection. Dexie IndexedDB syncs your queue seamlessly when you return online.
            </p>
          </GlassCard>

          <GlassCard variant="mid" className="p-6 space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-semibold text-base text-[var(--text-primary)]">
              Spend Velocity Ring
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Real-time animated pacing ring and Recharts activity trends help you monitor category limits and monthly burn rates.
            </p>
          </GlassCard>

          <GlassCard variant="mid" className="p-6 space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-semibold text-base text-[var(--text-primary)]">
              Google Sheets Sync
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              One-click secure sync to your own Google Drive spreadsheet with zero third-party brokers. Full data ownership guaranteed.
            </p>
          </GlassCard>
        </div>
      </main>

      {/* Footer with Legal Links */}
      <footer className="pt-8 mt-12 border-t border-black/5 dark:border-white/5 flex flex-col items-center justify-center gap-6 text-xs text-[var(--text-muted)] pb-6">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/5 dark:bg-white/5">
          <span className="font-medium text-[var(--text-secondary)]">Designed & Built by</span>
          <a 
            href="https://github.com/ashwinn-si" 
            target="_blank" 
            rel="noreferrer" 
            className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors group"
          >
            <Github className="w-4 h-4 group-hover:scale-110 transition-transform" />
            ashwinn-si
          </a>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
          <span>© 2026 BudgetFlow. All rights reserved.</span>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)] transition-colors">Terms</Link>
            <Link href="/login" className="hover:text-[var(--text-primary)] transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
