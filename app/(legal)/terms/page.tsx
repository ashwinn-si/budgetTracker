import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, ShieldAlert, FileText, Scale } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

export const metadata = {
  title: "Terms of Service | BudgetFlow",
  description: "BudgetFlow Terms of Service and user agreements.",
};

export default function TermsOfServicePage() {
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
            Legal Agreement
          </span>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-[var(--text-primary)] mt-1">
            Terms of Service
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-2">
            Last updated: September 19, 2026
          </p>
        </div>

        {/* Section 1 */}
        <section className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <h2 className="text-lg font-heading font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-500" />
            <span>1. Acceptance of Terms</span>
          </h2>
          <p>
            By accessing or using BudgetFlow (&ldquo;the Service&rdquo;) available at <strong>money.ashwinsi.in</strong>, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <h2 className="text-lg font-heading font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <span>2. Description of Service</span>
          </h2>
          <p>
            BudgetFlow is an offline-first personal financial management and expense tracking tool. Features include transaction logging, spend velocity analytics, category tagging, offline IndexedDB synchronization, and export functionalities (Excel and Google Sheets).
          </p>
        </section>

        {/* Section 3 */}
        <section className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <h2 className="text-lg font-heading font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            <span>3. User Accounts & Security</span>
          </h2>
          <p>
            You are responsible for safeguarding your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use or security breach.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <h2 className="text-lg font-heading font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-emerald-500" />
            <span>4. Financial Disclaimer</span>
          </h2>
          <p>
            BudgetFlow is an organizational tracking tool and does not provide financial, investment, accounting, or legal advice. You assume full responsibility for your financial decisions and budgeting plans.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <h2 className="text-lg font-heading font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-500" />
            <span>5. Contact Information</span>
          </h2>
          <p>
            If you have questions regarding these Terms, please contact us at <a href="mailto:ashwin.siiiiii@gmail.com" className="text-emerald-600 dark:text-emerald-400 underline font-medium">ashwin.siiiiii@gmail.com</a>.
          </p>
        </section>
      </GlassCard>

      <footer className="text-center text-xs text-[var(--text-muted)] space-x-4">
        <Link href="/terms" className="hover:underline font-semibold">Terms of Service</Link>
        <span>•</span>
        <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
        <span>•</span>
        <Link href="/login" className="hover:underline">Sign In</Link>
      </footer>
    </div>
  );
}
