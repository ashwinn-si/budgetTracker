"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";

import { SUPPORTED_CURRENCIES, type CurrencyInfo } from "@/lib/currency";
export { SUPPORTED_CURRENCIES, type CurrencyInfo };

interface CurrencyContextType {
  currency: string;
  currencyInfo: CurrencyInfo;
  setCurrency: (code: string) => Promise<void>;
  formatAmount: (amount: number | string | undefined | null, showDecimals?: boolean) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();
  const [currency, setCurrencyState] = useState<string>("INR");

  // Initialize currency from user profile or localStorage on mount
  useEffect(() => {
    if (user?.currency && SUPPORTED_CURRENCIES[user.currency.toUpperCase()]) {
      setCurrencyState(user.currency.toUpperCase());
      localStorage.setItem("budget_currency", user.currency.toUpperCase());
      return;
    }

    const saved = localStorage.getItem("budget_currency");
    if (saved && SUPPORTED_CURRENCIES[saved.toUpperCase()]) {
      setCurrencyState(saved.toUpperCase());
    } else {
      setCurrencyState("INR");
    }
  }, [user?.currency]);

  const currencyInfo = SUPPORTED_CURRENCIES[currency] || SUPPORTED_CURRENCIES.INR;

  const setCurrency = useCallback(
    async (code: string) => {
      const upper = code.toUpperCase();
      if (!SUPPORTED_CURRENCIES[upper]) return;

      setCurrencyState(upper);
      localStorage.setItem("budget_currency", upper);
      updateUser({ currency: upper });

      try {
        await fetch("/api/user/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currency: upper }),
        });
      } catch (err) {
        console.error("Failed to persist currency preference to server:", err);
      }
    },
    [updateUser]
  );

  const formatAmount = useCallback(
    (amount: number | string | undefined | null, showDecimals = true): string => {
      const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
      if (isNaN(num)) return `${currencyInfo.symbol}0.00`;
      const formatted = num.toLocaleString(currencyInfo.locale, {
        minimumFractionDigits: showDecimals ? 2 : 0,
        maximumFractionDigits: showDecimals ? 2 : 0,
      });
      return `${currencyInfo.symbol}${formatted}`;
    },
    [currencyInfo]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        currencyInfo,
        setCurrency,
        formatAmount,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
