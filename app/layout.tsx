import type { Metadata, Viewport } from "next";
import { Poppins, Open_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "react-hot-toast";

const poppins = Poppins({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

const openSans = Open_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5173"
  ),
  title: {
    default: "BudgetFlow — Modern Glassmorphism Budget Tracker",
    template: "%s | BudgetFlow",
  },
  description:
    "Personal budget tracking web app with offline-first background sync, spend pacing analytics, and Google Sheets integration.",
  keywords: [
    "budget tracker",
    "expense manager",
    "personal finance",
    "glassmorphism",
    "offline-first",
    "money management",
    "nextjs",
    "dexie",
  ],
  authors: [{ name: "BudgetFlow" }],
  creator: "BudgetFlow",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "BudgetFlow",
    title: "BudgetFlow — Modern Glassmorphism Budget Tracker",
    description:
      "Track your expenses offline-first with beautiful light-green glassmorphism, instant sync, and Google Sheets export.",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "BudgetFlow Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "BudgetFlow — Modern Glassmorphism Budget Tracker",
    description:
      "Track your expenses offline-first with beautiful light-green glassmorphism.",
    images: ["/logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#22C55E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} ${openSans.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href="/logo.png" />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col font-sans"
      >
        <Providers>{children}</Providers>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
