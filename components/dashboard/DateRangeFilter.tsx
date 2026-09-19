"use client";

import React, { useState, useRef, useEffect } from "react";
import { formatDate } from "@/lib/dateUtils";
import { Calendar as CalendarIcon, ChevronDown, Check } from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";

export type PeriodPreset = "week" | "month" | "last30" | "ytd" | "custom";

interface DateRangeFilterProps {
  period: PeriodPreset;
  startDate: Date;
  endDate: Date;
  onSelectPeriod: (preset: PeriodPreset, customStart?: Date, customEnd?: Date) => void;
}

export function DateRangeFilter({
  period,
  startDate,
  endDate,
  onSelectPeriod,
}: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({
    from: startDate,
    to: endDate,
  });
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const presets: { key: PeriodPreset; label: string }[] = [
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "last30", label: "Last 30 Days" },
    { key: "ytd", label: "Year to Date" },
    { key: "custom", label: "Custom" },
  ];

  const handlePresetClick = (key: PeriodPreset) => {
    if (key === "custom") {
      setIsOpen(true);
    } else {
      setIsOpen(false);
      onSelectPeriod(key);
    }
  };

  const handleApplyCustom = () => {
    if (range?.from) {
      const from = range.from;
      const to = range.to || range.from;
      onSelectPeriod("custom", from, to);
      setIsOpen(false);
    }
  };

  const customRangeLabel =
    period === "custom"
      ? `${formatDate(startDate)} – ${formatDate(endDate)}`
      : "Custom Range";

  return (
    <div className="relative inline-flex flex-wrap items-center gap-1.5 p-1 bg-black/[0.04] dark:bg-white/[0.05] rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
      {presets.map((p) => {
        const isActive = period === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => handlePresetClick(p.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
              isActive
                ? "bg-white dark:bg-[#1E2522] text-emerald-600 dark:text-emerald-400 shadow-sm font-semibold"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
            }`}
          >
            {p.key === "custom" && <CalendarIcon className="w-3.5 h-3.5 opacity-75" />}
            <span>{p.key === "custom" && isActive ? customRangeLabel : p.label}</span>
            {p.key === "custom" && <ChevronDown className="w-3 h-3 opacity-60" />}
          </button>
        );
      })}

      {/* Custom Date Picker Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 mt-2 z-50 p-4 bg-[var(--surface-overlay)] backdrop-blur-xl border border-[var(--border-subtle)] rounded-2xl shadow-2xl animate-fade-in text-[var(--text-primary)]"
        >
          <div className="mb-2 pb-2 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Select Custom Range
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {range?.from ? formatDate(range.from) : "Start"} –{" "}
              {range?.to ? formatDate(range.to) : "End"}
            </span>
          </div>

          <DayPicker
            mode="range"
            selected={range}
            onSelect={setRange}
            numberOfMonths={1}
            styles={{
              root: { margin: 0, fontSize: "13px" },
            }}
          />

          <div className="mt-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!range?.from}
              onClick={handleApplyCustom}
              className="px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Range</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
