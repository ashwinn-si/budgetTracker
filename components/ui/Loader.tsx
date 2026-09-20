"use client";

import React from "react";
import { motion } from "motion/react";

export interface LoaderProps {
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
  message?: React.ReactNode;
  showBrand?: boolean;
  className?: string;
  transparentCard?: boolean;
}

export function Loader({
  fullScreen = false,
  size = "md",
  message,
  showBrand = false,
  className = "",
  transparentCard = false,
}: LoaderProps) {
  // Dimensions per size
  const ringSizes = {
    sm: { box: "w-10 h-10", rOuter: 17, rInner: 12, strokeOuter: 2.5, strokeInner: 2, centerSize: "w-2 h-2" },
    md: { box: "w-16 h-16", rOuter: 28, rInner: 20, strokeOuter: 3, strokeInner: 2.2, centerSize: "w-3 h-3" },
    lg: { box: "w-20 h-20", rOuter: 36, rInner: 26, strokeOuter: 3.5, strokeInner: 2.5, centerSize: "w-4 h-4" },
  }[size];

  const content = (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`relative flex flex-col items-center justify-center ${
        transparentCard
          ? "p-4"
          : "px-7 py-6 sm:px-9 sm:py-7 rounded-[26px] sm:rounded-3xl bg-white/65 dark:bg-[#112017]/75 backdrop-blur-2xl border border-white/80 dark:border-emerald-500/20 shadow-[0_20px_50px_rgba(20,50,30,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.15)]"
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Ambient Pulsing Emerald Aura */}
      <motion.div
        animate={{
          scale: [0.85, 1.2, 0.85],
          opacity: [0.25, 0.55, 0.25],
        }}
        transition={{
          repeat: Infinity,
          duration: 2.8,
          ease: "easeInOut",
        }}
        className="absolute -inset-2 bg-radial from-emerald-500/30 via-emerald-500/10 to-transparent rounded-full blur-2xl pointer-events-none"
      />

      {/* Main Ring Assembly */}
      <div className={`relative flex items-center justify-center ${ringSizes.box}`}>
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 80 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Emerald to mint sweep gradient */}
            <linearGradient id="orbit-grad-outer" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22C55E" stopOpacity="1" />
              <stop offset="60%" stopColor="#34D976" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </linearGradient>

            {/* Inner mint telemetry gradient */}
            <linearGradient id="orbit-grad-inner" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#34D976" stopOpacity="0.9" />
              <stop offset="70%" stopColor="#2DD4BF" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#14B8A6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Outer Track */}
          <circle
            cx="40"
            cy="40"
            r={ringSizes.rOuter}
            stroke="currentColor"
            strokeWidth={ringSizes.strokeOuter}
            className="text-emerald-500/15 dark:text-emerald-400/20"
          />

          {/* Inner Track */}
          <circle
            cx="40"
            cy="40"
            r={ringSizes.rInner}
            stroke="currentColor"
            strokeWidth={ringSizes.strokeInner}
            className="text-emerald-500/10 dark:text-emerald-400/10"
          />
        </svg>

        {/* Outer Rotating Sweep Arc */}
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
        >
          <svg className="w-full h-full" viewBox="0 0 80 80" fill="none">
            <circle
              cx="40"
              cy="40"
              r={ringSizes.rOuter}
              stroke="url(#orbit-grad-outer)"
              strokeWidth={ringSizes.strokeOuter}
              strokeLinecap="round"
              strokeDasharray={`${ringSizes.rOuter * 3.5} ${ringSizes.rOuter * 2.8}`}
            />
          </svg>
        </motion.div>

        {/* Inner Counter-Rotating Dash Arc */}
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
        >
          <svg className="w-full h-full" viewBox="0 0 80 80" fill="none">
            <circle
              cx="40"
              cy="40"
              r={ringSizes.rInner}
              stroke="url(#orbit-grad-inner)"
              strokeWidth={ringSizes.strokeInner}
              strokeLinecap="round"
              strokeDasharray="6 8"
            />
          </svg>
        </motion.div>

        {/* Center Breathing Gem Core */}
        <motion.div
          animate={{
            scale: [0.88, 1.15, 0.88],
            opacity: [0.85, 1, 0.85],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.8,
            ease: "easeInOut",
          }}
          className={`relative rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(34,197,94,0.7)] ${ringSizes.centerSize}`}
        />
      </div>

      {/* Brand Title (Optional) */}
      {showBrand && (
        <div className="mt-4 text-center">
          <span className="font-heading font-bold text-base sm:text-lg text-[var(--text-primary)] tracking-tight">
            Budget<span className="text-emerald-500 italic font-semibold">Flow</span>
          </span>
        </div>
      )}

      {/* Status Message (Optional) */}
      {message && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium text-[var(--text-secondary)] font-sans">
          <span>{message}</span>
          <span className="inline-flex gap-0.5 ml-0.5">
            <motion.span
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
              className="w-1 h-1 rounded-full bg-emerald-500"
            />
            <motion.span
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
              className="w-1 h-1 rounded-full bg-emerald-500"
            />
            <motion.span
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
              className="w-1 h-1 rounded-full bg-emerald-500"
            />
          </span>
        </div>
      )}
    </motion.div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/15 dark:bg-black/45 backdrop-blur-md transition-all duration-300">
        {content}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-4 w-full h-full min-h-[120px]">
      {content}
    </div>
  );
}
