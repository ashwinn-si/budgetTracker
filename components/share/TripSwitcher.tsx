"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plane, ChevronDown, Check } from "lucide-react";
import { CombinedInfo, CombinedTripOption } from "./types";

export function TripSwitcher({
  combined,
  onSelect,
}: {
  combined: CombinedInfo;
  onSelect: (tripId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected =
    combined.trips.find((t) => t.tripId === combined.selectedTripId) || combined.trips[0];

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const renderOption = (t: CombinedTripOption) => {
    const active = t.tripId === selected.tripId;
    return (
      <button
        key={t.tripId}
        type="button"
        onClick={() => {
          onSelect(t.tripId);
          setIsOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
          active
            ? "bg-emerald-500/10 text-[var(--text-primary)]"
            : "hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-secondary)]"
        }`}
      >
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 border"
          style={{
            backgroundColor: `${t.colorKey || "#22C55E"}20`,
            borderColor: `${t.colorKey || "#22C55E"}40`,
            color: t.colorKey || "#22C55E",
          }}
        >
          {t.emoji || <Plane className="w-4 h-4" />}
        </span>
        <span className="flex-1 min-w-0 text-sm font-medium truncate">{t.name}</span>
        {t.status === "completed" && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 text-[var(--text-muted)] shrink-0">
            Done
          </span>
        )}
        {active && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
      </button>
    );
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
      >
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 border"
          style={{
            backgroundColor: `${selected.colorKey || "#22C55E"}20`,
            borderColor: `${selected.colorKey || "#22C55E"}40`,
            color: selected.colorKey || "#22C55E",
          }}
        >
          {selected.emoji || <Plane className="w-3.5 h-3.5" />}
        </span>
        <span className="text-sm font-medium text-[var(--text-primary)] max-w-[140px] truncate">
          {selected.name}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <>
          {/* Mobile: bottom-sheet style list */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 sm:hidden rounded-t-[28px] bg-white dark:bg-neutral-900 border-t border-black/10 dark:border-white/10 max-h-[70vh] overflow-y-auto pb-[env(safe-area-inset-bottom,0px)] shadow-2xl">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
            </div>
            <div className="px-2 pb-2">{combined.trips.map(renderOption)}</div>
          </div>

          {/* Desktop: absolutely-positioned popover */}
          <div className="hidden sm:block absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden z-50 py-1">
            {combined.trips.map(renderOption)}
          </div>
        </>
      )}
    </div>
  );
}
