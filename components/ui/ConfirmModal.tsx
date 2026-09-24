"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2, X, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/Button";

export type ConfirmVariant = "danger" | "warning" | "default";

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  variant = "danger",
  isLoading = false,
}: ConfirmModalProps) {
  const [internalLoading, setInternalLoading] = useState(false);

  // Lock body scroll when opened
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading && !internalLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isLoading, internalLoading]);

  const handleConfirmClick = async () => {
    try {
      const result = onConfirm();
      if (result instanceof Promise) {
        setInternalLoading(true);
        await result;
      }
    } catch (err) {
      console.error("Confirmation action failed:", err);
    } finally {
      setInternalLoading(false);
      onClose();
    }
  };

  const busy = isLoading || internalLoading;

  // Variant styling helpers
  const iconConfig = {
    danger: {
      icon: <Trash2 className="w-6 h-6 text-rose-600 dark:text-rose-400" />,
      bg: "bg-rose-500/10 dark:bg-rose-500/20 border-rose-500/20 dark:border-rose-500/30",
      glow: "from-rose-500/15 via-rose-500/5 to-transparent",
      confirmBtn: "bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-600 text-white shadow-[0_4px_16px_rgba(225,29,72,0.35)]",
    },
    warning: {
      icon: <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
      bg: "bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/20 dark:border-amber-500/30",
      glow: "from-amber-500/15 via-amber-500/5 to-transparent",
      confirmBtn: "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white shadow-[0_4px_16px_rgba(217,119,6,0.35)]",
    },
    default: {
      icon: <HelpCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
      bg: "bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20 dark:border-emerald-500/30",
      glow: "from-emerald-500/15 via-emerald-500/5 to-transparent",
      confirmBtn: "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white shadow-[0_4px_16px_rgba(16,185,129,0.35)]",
    },
  }[variant];

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 overflow-hidden max-w-full w-full">
          {/* Frosted Transparent Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={busy ? undefined : onClose}
            className="fixed inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-md"
          />

          {/* Dialog Container with Motion Spring Physics */}
          <motion.div
            initial={{ y: "100%", opacity: 0.8, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.3 }}
            onDragEnd={(_, info) => {
              if ((info.offset.y > 100 || info.velocity.y > 400) && !busy) {
                onClose();
              }
            }}
            className="relative z-10 w-full max-w-full min-w-0 sm:max-w-md bg-gradient-to-b from-white/95 via-[#F8FAF8]/92 to-[#EEF5EF]/95 dark:from-[#122018]/95 dark:via-[#0E1A13]/95 dark:to-[#0A140F]/95 backdrop-blur-2xl border border-white/80 dark:border-white/10 rounded-t-[28px] sm:rounded-3xl shadow-[0_25px_60px_-15px_rgba(20,50,30,0.25),0_0_40px_rgba(34,197,94,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.15)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            aria-describedby="confirm-modal-desc"
          >
            {/* Ambient Radial Accent Glow */}
            <div
              className={`absolute -top-16 -left-16 w-44 h-44 rounded-full bg-gradient-to-br ${iconConfig.glow} blur-3xl pointer-events-none`}
            />

            {/* Mobile Drag Handle Bar */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden cursor-grab active:cursor-grabbing relative z-10">
              <div className="w-12 h-1.5 rounded-full bg-neutral-300/80 dark:bg-neutral-600/60" />
            </div>

            {/* Close button (top right) */}
            <button
              onClick={onClose}
              disabled={busy}
              aria-label="Close dialog"
              className="absolute top-4 right-4 p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-20 cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Content Body */}
            <div className="p-5 sm:p-7 relative z-10 min-w-0 max-w-full overflow-hidden">
              <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
                {/* Visual Icon Badge */}
                <div
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 border ${iconConfig.bg} shadow-sm`}
                >
                  {iconConfig.icon}
                </div>

                <div className="space-y-1.5 pt-0.5 min-w-0 flex-1">
                  <h3
                    id="confirm-modal-title"
                    className="text-lg sm:text-xl font-heading font-bold text-[var(--text-primary)] tracking-tight leading-snug break-words"
                  >
                    {title}
                  </h3>
                  <div
                    id="confirm-modal-desc"
                    className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed font-sans break-words"
                  >
                    {message}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-white/60 dark:bg-black/25 backdrop-blur-xl border-t border-black/[0.06] dark:border-white/10 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4 relative z-10 min-w-0 max-w-full">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={onClose}
                disabled={busy}
                className="w-full sm:w-auto"
              >
                {cancelText}
              </Button>
              <button
                type="button"
                onClick={handleConfirmClick}
                disabled={busy}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2 ${iconConfig.confirmBtn}`}
              >
                {busy ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : null}
                <span>{confirmText}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalContent, document.body);
}
