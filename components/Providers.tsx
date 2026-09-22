"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/context/ThemeContext";
import { LoadingProvider } from "@/context/LoadingContext";
import { AuthProvider } from "@/context/AuthContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { TripProvider } from "@/context/TripContext";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <LoadingProvider>
        <AuthProvider>
          <CurrencyProvider>
            <TripProvider>
              <QueryClientProvider client={queryClient}>
                {children}
              </QueryClientProvider>
            </TripProvider>
          </CurrencyProvider>
        </AuthProvider>
      </LoadingProvider>
    </ThemeProvider>
  );
}
