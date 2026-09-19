"use client";

import React from "react";
import { motion } from "motion/react";

interface LoaderProps {
  fullScreen?: boolean;
}

export function Loader({ fullScreen = false }: LoaderProps) {
  const containerClasses = fullScreen 
    ? "fixed inset-0 z-[9999] flex items-center justify-center bg-transparent backdrop-blur-sm pointer-events-none"
    : "flex items-center justify-center p-4 w-full h-full min-h-[100px]";

  return (
    <div className={containerClasses}>
      <motion.div 
        className="relative flex items-center justify-center w-16 h-16"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="absolute inset-0 rounded-full border-4 border-emerald-500/10 dark:border-emerald-500/20" />
        <motion.div 
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        />
        <motion.div 
          className="absolute inset-2 rounded-full border-4 border-transparent border-t-teal-400"
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
        />
        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
      </motion.div>
    </div>
  );
}
