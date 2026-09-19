"use client";

import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion, HTMLMotionProps } from "motion/react";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  variant?: "strong" | "mid" | "light";
  interactive?: boolean;
  children: React.ReactNode;
}

export function GlassCard({
  variant = "mid",
  interactive = false,
  className,
  children,
  ...props
}: GlassCardProps) {
  const variantClass =
    variant === "strong"
      ? "glass-strong rounded-3xl"
      : variant === "light"
      ? "glass-light rounded-2xl"
      : "glass-mid rounded-3xl";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      whileHover={interactive ? { y: -2, transition: { duration: 0.15 } } : undefined}
      whileTap={interactive ? { scale: 0.99 } : undefined}
      className={twMerge(
        clsx(
          variantClass,
          interactive && "cursor-pointer",
          "p-5 sm:p-6 transition-colors duration-200",
          className
        )
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
