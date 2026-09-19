import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ShieldCheck, Lock, Database, EyeOff, FileText } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

export const metadata = {
  title: "Privacy Policy | BudgetFlow",
  description: "BudgetFlow Privacy Policy and Google API User Data Policy compliance.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to BudgetFlow</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl overflow-hidden shadow-xs border border-white/60 dark:border-white/10">
            <Image src="/logo.png" alt="BudgetFlow Logo" width={32} height={32} className="w-full h-full object-cover" />
          </div>
          <span className="font-heading font-bold text-base text-[var(--text-primary)]">
            Budget<span className="text-emerald-500 font-medium">Flow</span>
          </span>
        </div>
      </div>

      <GlassCard variant="strong" className="p-8 sm:p-12 space-y-8 shadow-xl">
        <div className="border-b border-black/5 dark:border-white/5 pb-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Legal & Data Protection
          </span>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-[var(--text-primary)] mt-1">
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-2">
            Last updated: September 19, 2026
          </p>
        </div>

        {/* Section 1: Overview */}
        <section className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <h2 className="text-lg font-heading font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <span>1. Overview & Commitment to Privacy</span>
          </h2>
          <p>
            BudgetFlow (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) provides personal finance and budget tracking services accessible at <strong>money.ashwinsi.in</strong>. We are deeply committed to respecting and protecting your privacy. This Privacy Policy details the types of personal and financial information we collect, how it is used, and how it is protected.
          </p>
        </section>

        {/* Section 2: Data Collection */}
        <section className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <h2 className="text-lg font-heading font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-500" />
            <span>2. Information We Collect</span>
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Account Information:</strong> When you register using email/password or Google OAuth, we collect your name and email address.
            </li>
            <li>
              <strong>Financial Transaction Data:</strong> Information you record within the app, including expense amounts, dates, notes, and custom category tags.
            </li>
            <li>
              <strong>Offline Device Data:</strong> For offline-first functionality, data is stored locally in your browser&apos;s IndexedDB (via Dexie.js) and synced with our secure servers when internet connectivity is available.
            </li>
          </ul>
        </section>

        {/* Section 3: Google API Disclosure (Crucial for Google OAuth Verification) */}
        <section className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3 text-sm text-[var(--text-secondary)]">
          <h2 className="text-lg font-heading font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-600" />
            <span>3. Google API Services & Google Sheets Data Disclosure</span>
          </h2>
          <p>
            BudgetFlow requests access to your Google account scopes (specifically <code>https://www.googleapis.com/auth/spreadsheets</code>) solely to provide the voluntary <strong>Google Sheets Sync</strong> feature.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm">
            <li>
              <strong>Scope of Access:</strong> We use your Google access token strictly to create or update personal spreadsheets in your own Google Drive that mirror your logged budget expenses.
            </li>
            <li>
              <strong>No Third-Party Sharing:</strong> Your Google user data is never shared with, sold to, or transferred to third parties or advertising brokers.
            </li>
            <li>
              <strong>No Model Training:</strong> We do not use your financial data or Google Sheets content to train AI or machine learning models.
            </li>
            <li>
              <strong>Limited Use Compliance:</strong> BudgetFlow&apos;s use and transfer to any other app of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-emerald-700 dark:text-emerald-400">Google API Services User Data Policy</a>, including the Limited Use requirements.
            </li>
          </ul>
        </section>

        {/* Section 4: Data Security */}
        <section className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <h2 className="text-lg font-heading font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <EyeOff className="w-5 h-5 text-emerald-500" />
            <span>4. Security of Your Information</span>
          </h2>
          <p>
            We implement robust security standards, including industry-standard bcrypt hashing for passwords, encrypted storage of OAuth refresh tokens, and HTTPS encryption in transit across all endpoints.
          </p>
        </section>

        {/* Section 5: User Rights */}
        <section className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <h2 className="text-lg font-heading font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            <span>5. Your Rights & Data Deletion</span>
          </h2>
          <p>
            You have full control over your data. You may review, modify, export (via Excel or Google Sheets), or permanently delete your account and associated transactions at any time via your Profile page or by contacting us at <a href="mailto:siashwin2005@gmail.com" className="text-emerald-600 dark:text-emerald-400 underline font-medium">siashwin2005@gmail.com</a>.
          </p>
        </section>
      </GlassCard>

      <footer className="text-center text-xs text-[var(--text-muted)] space-x-4">
        <Link href="/terms" className="hover:underline">Terms of Service</Link>
        <span>•</span>
        <Link href="/privacy" className="hover:underline font-semibold">Privacy Policy</Link>
        <span>•</span>
        <Link href="/login" className="hover:underline">Sign In</Link>
      </footer>
    </div>
  );
}
