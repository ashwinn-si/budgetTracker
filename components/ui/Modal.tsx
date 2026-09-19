"use client";

import React, { useEffect } from "react";
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 overflow-hidden">
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
            className={`relative z-10 w-full ${maxWidthClasses[maxWidth]} glass-strong border border-white/60 dark:border-white/10 rounded-t-[28px] sm:rounded-3xl max-h-[88vh] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Drag Handle Bar */}
            <div className="flex justify-center pt-2.5 pb-1 sm:hidden cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 rounded-full bg-neutral-400/40 dark:bg-neutral-600/50" />
            </div>

            {/* Modal Header */}
            <div className="flex items-start justify-between px-6 pt-3 sm:pt-6 pb-3 border-b border-black/5 dark:border-white/5">
              <div>
                <h2 className="text-xl sm:text-2xl font-heading font-semibold text-[var(--text-primary)]">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5 font-sans">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close modal"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 -mt-1 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body with internal scroll */}
            <div className="px-6 py-4 overflow-y-auto flex-1 text-[var(--text-secondary)] space-y-4">
              {children}
            </div>

            {/* Modal Sticky Footer (Thumb reachable on mobile) */}
            {footer && (
              <div className="px-6 py-3.5 sm:py-4 border-t border-black/5 dark:border-white/5 bg-white/20 dark:bg-black/20 backdrop-blur-md pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] sm:pb-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
