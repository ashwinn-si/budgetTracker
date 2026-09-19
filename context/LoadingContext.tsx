"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface LoadingContextType {
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  startLoading: () => void;
  stopLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [loadingCount, setLoadingCount] = useState<number>(0);

  const startLoading = useCallback(() => {
    setLoadingCount((prev) => prev + 1);
  }, []);

  const stopLoading = useCallback(() => {
    setLoadingCount((prev) => Math.max(0, prev - 1));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setLoadingCount(loading ? 1 : 0);
  }, []);

  const isLoading = loadingCount > 0;

  return (
    <LoadingContext.Provider value={{ isLoading, setLoading, startLoading, stopLoading }}>
      {/* Top Glass Loading Indicator Bar */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 overflow-hidden bg-transparent pointer-events-none">
          <div className="h-full w-full bg-emerald-500 animate-pulse origin-left" style={{
            background: "linear-gradient(90deg, #22C55E 0%, #34D976 50%, #10B981 100%)",
            boxShadow: "0 0 10px rgba(34, 197, 94, 0.8)"
          }} />
        </div>
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
