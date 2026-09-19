"use client";

import React, { useEffect, useState } from "react";

interface RingProps {
  percentage: number; // 0 to 100+
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  centerContent?: React.ReactNode;
  color?: string;
}

export function Ring({
  percentage,
  size = 180,
  strokeWidth = 10,
  label,
  sublabel,
  centerContent,
  color = "var(--accent)",
}: RingProps) {
  const [offset, setOffset] = useState<number>(0);
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  // Clamp visual percentage for the ring arc to max 100% (or let it cap)
  const normalizedPct = Math.min(Math.max(percentage, 0), 100);
  const targetOffset = circumference * (1 - normalizedPct / 100);

  useEffect(() => {
    // Initial draw animation after mount
    setOffset(circumference);
    const timer = setTimeout(() => {
      setOffset(targetOffset);
    }, 150);
    return () => clearTimeout(timer);
  }, [targetOffset, circumference]);

  return (
    <div className="relative inline-flex flex-col items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="ring-svg"
      >
        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-black/[0.07] dark:text-white/[0.08]"
          strokeWidth={strokeWidth}
        />
        {/* Fill arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="ring-fill transition-all duration-1000 ease-out"
        />
      </svg>

      {/* Center Display */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
        {centerContent ? (
          centerContent
        ) : (
          <>
            <span className="text-3xl sm:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight">
              {Math.round(percentage)}%
            </span>
            {label && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
                {label}
              </span>
            )}
            {sublabel && (
              <span className="text-xs text-[var(--text-secondary)] font-medium">
                {sublabel}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
