"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = "md",
}: ModalProps) {
  // Prevent background scroll when modal is open
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
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const maxWidthClasses = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-xl",
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 overflow-hidden max-w-full w-full">
          {/* Backdrop with Motion Fade & Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container with Spring Physics */}
          <motion.div
            initial={{ y: "100%", opacity: 0.8, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 400) {
                onClose();
              }
            }}
            className={`relative z-10 w-full max-w-full min-w-0 ${maxWidthClasses[maxWidth]} bg-gradient-to-b from-white/95 via-[#F8FAF8]/92 to-[#EEF5EF]/95 dark:from-[#112017]/95 dark:via-[#0E1A13]/95 dark:to-[#0A140F]/95 backdrop-blur-2xl border border-white/80 dark:border-emerald-500/20 rounded-t-[28px] sm:rounded-3xl max-h-[90dvh] sm:max-h-[85vh] flex flex-col shadow-[0_25px_60px_-15px_rgba(20,50,30,0.2),0_0_40px_rgba(34,197,94,0.1)] overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Background Gradient Orbs */}
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-emerald-400/20 dark:bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-teal-400/15 dark:bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Mobile Drag Handle Bar */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden cursor-grab active:cursor-grabbing relative z-10">
              <div className="w-12 h-1.5 rounded-full bg-neutral-300/80 dark:bg-neutral-600/60" />
            </div>

            {/* Modal Header */}
            <div className="flex items-start justify-between px-4 sm:px-6 pt-3 sm:pt-6 pb-3 sm:pb-4 border-b border-black/[0.06] dark:border-white/10 bg-white/40 dark:bg-white/[0.02] backdrop-blur-md relative z-10 min-w-0">
              <div className="min-w-0 flex-1 pr-3">
                <h2 className="text-xl sm:text-2xl font-heading font-bold text-[var(--text-primary)] tracking-tight break-words">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 font-sans leading-relaxed break-words">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close modal"
                className="shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center -mr-1 -mt-1 rounded-2xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/[0.05] dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body with internal scroll */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto overflow-x-hidden flex-1 min-w-0 max-w-full text-[var(--text-secondary)] space-y-4 relative z-10">
              {children}
            </div>

            {/* Modal Sticky Footer (Thumb reachable on mobile) */}
            {footer && (
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-black/[0.06] dark:border-white/10 bg-white/60 dark:bg-black/30 backdrop-blur-xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 relative z-10 min-w-0 max-w-full">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Render into a portal at document.body so no parent overflow/transform
  // context can clip or interfere with the fixed positioning
  if (typeof document === "undefined") return null;
  return createPortal(modalContent, document.body);
}

