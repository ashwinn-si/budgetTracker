export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  shortName: string;
  locale: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyInfo> = {
  INR: {
    code: "INR",
    symbol: "₹",
    name: "Indian Rupee",
    shortName: "Rupee",
    locale: "en-IN",
    flag: "🇮🇳",
  },
  USD: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    shortName: "Dollar",
    locale: "en-US",
    flag: "🇺🇸",
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    name: "Euro",
    shortName: "Euro",
    locale: "de-DE",
    flag: "🇪🇺",
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    name: "British Pound",
    shortName: "Pound",
    locale: "en-GB",
    flag: "🇬🇧",
  },
  AED: {
    code: "AED",
    symbol: "د.إ",
    name: "UAE Dirham",
    shortName: "Dirham",
    locale: "ar-AE",
    flag: "🇦🇪",
  },
  CAD: {
    code: "CAD",
    symbol: "CA$",
    name: "Canadian Dollar",
    shortName: "Dollar",
    locale: "en-CA",
    flag: "🇨🇦",
  },
  AUD: {
    code: "AUD",
    symbol: "A$",
    name: "Australian Dollar",
    shortName: "Dollar",
    locale: "en-AU",
    flag: "🇦🇺",
  },
  JPY: {
    code: "JPY",
    symbol: "¥",
    name: "Japanese Yen",
    shortName: "Yen",
    locale: "ja-JP",
    flag: "🇯🇵",
  },
  SGD: {
    code: "SGD",
    symbol: "S$",
    name: "Singapore Dollar",
    shortName: "Dollar",
    locale: "en-SG",
    flag: "🇸🇬",
  },
  CHF: {
    code: "CHF",
    symbol: "CHF",
    name: "Swiss Franc",
    shortName: "Franc",
    locale: "de-CH",
    flag: "🇨🇭",
  },
};

export function getCurrencyInfo(code?: string): CurrencyInfo {
  const upper = (code || "INR").toUpperCase();
  return SUPPORTED_CURRENCIES[upper] || SUPPORTED_CURRENCIES.INR;
}

/**
 * Returns the Excel number format string for the given currency
 * e.g., "₹#,##0.00" or "$#,##0.00"
 */
export function getExcelCurrencyFormat(code?: string): string {
  const info = getCurrencyInfo(code);
  const symbol = info.symbol;
  // If symbol contains letters or special characters, quote it safely
  if (symbol.length > 1 || !["$", "€", "£", "¥"].includes(symbol)) {
    return `"${symbol}"#,##0.00`;
  }
  return `${symbol}#,##0.00`;
}

/**
 * Formats a raw numeric string with commas/grouping according to currency locale
 * e.g., for "20000" in INR (en-IN) -> "20,000"
 * e.g., for "200000" in INR (en-IN) -> "2,00,000"
 * e.g., for "200000" in USD (en-US) -> "200,000"
 * Preserves trailing decimal point or decimal digits while typing.
 */
export function formatAmountInput(value: string, locale: string = "en-IN"): string {
  if (!value) return "";
  const clean = value.replace(/[^\d.]/g, "");
  if (!clean && value.includes(".")) return "0.";
  if (!clean) return "";

  const parts = clean.split(".");
  const intStr = parts[0];
  const hasDot = clean.includes(".");
  const decStr = parts.length > 1 ? parts.slice(1).join("").slice(0, 2) : "";

  let formattedInt = "";
  if (intStr) {
    try {
      formattedInt = new Intl.NumberFormat(locale).format(BigInt(intStr));
    } catch {
      formattedInt = intStr;
    }
  } else if (hasDot) {
    formattedInt = "0";
  }

  if (hasDot) {
    return `${formattedInt}.${decStr}`;
  }
  return formattedInt;
}

/**
 * Strips formatting (commas, spaces) to parse the clean numeric value
 */
export function parseAmountInput(value: string): number {
  if (!value) return 0;
  const clean = value.replace(/[^\d.]/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

