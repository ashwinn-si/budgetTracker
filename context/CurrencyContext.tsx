"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";

import { SUPPORTED_CURRENCIES, type CurrencyInfo } from "@/lib/currency";
export { SUPPORTED_CURRENCIES, type CurrencyInfo };

interface CurrencyContextType {
  currency: string;
  currencyInfo: CurrencyInfo;
  setCurrency: (code: string) => Promise<void>;
  isDecimal: boolean;
  setIsDecimal: (show: boolean) => void;
  formatAmount: (amount: number | string | undefined | null, showDecimals?: boolean) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();
  const [currency, setCurrencyState] = useState<string>("INR");
  const [isDecimal, setIsDecimalState] = useState<boolean>(false);

  // Initialize currency & decimal preference from user profile or localStorage on mount
  useEffect(() => {
    if (user?.currency && SUPPORTED_CURRENCIES[user.currency.toUpperCase()]) {
      setCurrencyState(user.currency.toUpperCase());
      localStorage.setItem("budget_currency", user.currency.toUpperCase());
    } else {
      const saved = localStorage.getItem("budget_currency");
      if (saved && SUPPORTED_CURRENCIES[saved.toUpperCase()]) {
        setCurrencyState(saved.toUpperCase());
      } else {
        setCurrencyState("INR");
      }
    }

    // Decimal preference — default to false (rounded off, no decimal places)
    const savedDecimals = localStorage.getItem("budget_show_decimals");
    if (savedDecimals !== null) {
      setIsDecimalState(savedDecimals === "true");
    } else {
      setIsDecimalState(false);
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

  const setIsDecimal = useCallback((val: boolean) => {
    setIsDecimalState(val);
    localStorage.setItem("budget_show_decimals", String(val));
  }, []);

  const formatAmount = useCallback(
    (amount: number | string | undefined | null, overrideShowDecimals?: boolean): string => {
      const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
      const shouldShow = overrideShowDecimals !== undefined ? overrideShowDecimals : isDecimal;
      if (isNaN(num)) return `${currencyInfo.symbol}${shouldShow ? "0.00" : "0"}`;

      const displayNum = shouldShow ? num : Math.round(num);

      const formatted = displayNum.toLocaleString(currencyInfo.locale, {
        minimumFractionDigits: shouldShow ? 2 : 0,
        maximumFractionDigits: shouldShow ? 2 : 0,
      });
      return `${currencyInfo.symbol}${formatted}`;
    },
    [currencyInfo, isDecimal]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        currencyInfo,
        setCurrency,
        isDecimal,
        setIsDecimal,
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
