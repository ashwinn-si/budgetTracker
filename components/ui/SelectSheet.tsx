"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Check } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface SelectSheetProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  icon?: React.ReactNode;
  title: string;
}

export function SelectSheet({ value, onChange, options, placeholder, icon, title }: SelectSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs sm:text-sm font-medium bg-white/60 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 text-[var(--text-primary)] cursor-pointer hover:bg-white/80 dark:hover:bg-black/60 transition-all shadow-xs"
      >
        <div className="flex items-center gap-2 truncate">
          {icon && <span className="text-[var(--text-muted)] shrink-0">{icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </div>
        <div className="flex flex-col gap-0.5 ml-2 shrink-0">
          <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[4px] border-b-[var(--text-muted)]" />
          <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[4px] border-t-[var(--text-muted)]" />
        </div>
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={title} maxWidth="sm">
        <div className="max-h-[50vh] overflow-y-auto overflow-x-hidden custom-scrollbar space-y-1 min-w-0 max-w-full">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl text-left text-sm transition-colors min-w-0 gap-2 ${
                value === opt.value
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold"
                  : "hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-primary)]"
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {value === opt.value && <Check className="w-4 h-4 shrink-0" />}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
