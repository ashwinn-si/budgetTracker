"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { Loader } from "@/components/ui/Loader";

interface LoadingContextType {
  isLoading: boolean;
  message?: string | null;
  setLoading: (loading: boolean, message?: string) => void;
  startLoading: (message?: string) => void;
  stopLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [loadingCount, setLoadingCount] = useState<number>(0);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>(undefined);

  const startLoading = useCallback((msg?: string) => {
    if (msg) setLoadingMessage(msg);
    setLoadingCount((prev) => prev + 1);
  }, []);

  const stopLoading = useCallback(() => {
    setLoadingCount((prev) => {
      const next = Math.max(0, prev - 1);
      if (next === 0) setLoadingMessage(undefined);
      return next;
    });
  }, []);

  const setLoading = useCallback((loading: boolean, msg?: string) => {
    if (msg) setLoadingMessage(msg);
    setLoadingCount(loading ? 1 : 0);
    if (!loading) setLoadingMessage(undefined);
  }, []);

  const isLoading = loadingCount > 0;

  return (
    <LoadingContext.Provider value={{ isLoading, message: loadingMessage, setLoading, startLoading, stopLoading }}>
      {/* Top Glass Loading Indicator Bar */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-[10000] h-1 overflow-hidden bg-transparent pointer-events-none">
          <div
            className="h-full w-full bg-emerald-500 animate-pulse origin-left"
            style={{
              background: "linear-gradient(90deg, #22C55E 0%, #34D976 50%, #10B981 100%)",
              boxShadow: "0 0 10px rgba(34, 197, 94, 0.8)",
            }}
          />
        </div>
      )}

      {/* Global Transparent Frosted Loader Overlay */}
      {isLoading && (
        <Loader fullScreen message={loadingMessage || "Processing..."} showBrand />
      )}

      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
}
