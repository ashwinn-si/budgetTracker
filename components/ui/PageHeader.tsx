"use client";

import React from "react";

interface PageHeaderProps {
  /** Small uppercase eyebrow label above the title */
  eyebrow: string;
  /** Main title — can include <em> for the italic accent word */
  title: React.ReactNode;
  /** Optional right-side action buttons */
  actions?: React.ReactNode;
  /** Optional icon element shown in the left accent badge */
  icon?: React.ReactNode;
}

/**
 * PageHeader — premium glassmorphism page header used across all app pages.
 *
 * Renders a full-width frosted-glass card with:
 * - Decorative ambient gradient orbs
 * - Emerald accent left-border stripe
 * - Eyebrow label + large serif-display h1
 * - Optional icon badge
 * - Optional right-side actions slot
 */
export function PageHeader({ eyebrow, title, actions, icon }: PageHeaderProps) {
  return (
    <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-white/70 dark:border-white/[0.08] shadow-sm">
      {/* Glass background */}
      <div className="absolute inset-0 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl" />

      {/* Ambient gradient orbs */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-400/20 dark:bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-teal-400/15 dark:bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Left accent stripe */}
      <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-500 opacity-80" />

      {/* Content */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 sm:px-8 py-5 sm:py-6 pl-8 sm:pl-10">
        <div className="flex items-center gap-4 min-w-0">
          {/* Optional icon badge */}
          {icon && (
            <div className="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400/25 to-teal-500/20 dark:from-emerald-500/20 dark:to-teal-400/15 border border-emerald-500/20 dark:border-emerald-400/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm">
              {icon}
            </div>
          )}

          <div className="min-w-0">
            {/* Eyebrow */}
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15 px-2.5 py-1 rounded-full border border-emerald-500/20 dark:border-emerald-400/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                {eyebrow}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight leading-tight truncate">
              {title}
            </h1>
          </div>
        </div>

        {/* Right: action buttons */}
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
