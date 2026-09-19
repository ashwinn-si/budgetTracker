"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Lock, Mail, ArrowRight, CheckCircle2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const payload = token ? { token, newPassword } : { email };
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Password reset failed");
      } else {
        setIsSubmitted(true);
        if (data.devResetUrl) {
          setDevResetUrl(data.devResetUrl);
        }
        if (token) {
          setTimeout(() => {
            router.push("/login");
          }, 2000);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard variant="strong" className="w-full max-w-md p-8 sm:p-10 space-y-7 shadow-2xl">
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-serif-display font-medium text-[var(--text-primary)]">
            Reset <em>Password</em>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)]">
            {token
              ? "Set a new secure password for your account."
              : "Enter your email to receive a password reset token."}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 text-center">
            {error}
          </div>
        )}

        {isSubmitted ? (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <h3 className="font-semibold text-sm text-emerald-800 dark:text-emerald-300">
              {token ? "Password updated successfully!" : "Reset instructions sent!"}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {token
                ? "Redirecting you to the login page..."
                : "Check your inbox for the password reset instructions."}
            </p>
            {devResetUrl && (
              <div className="pt-2 text-left">
                <span className="text-[10px] uppercase font-bold text-emerald-600">Dev Mode Link:</span>
                <a
                  href={devResetUrl}
                  className="block text-xs underline text-emerald-700 dark:text-emerald-300 break-all"
                >
                  {devResetUrl}
                </a>
              </div>
            )}
            <Link
              href="/login"
              className="inline-block mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Return to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {token ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  New Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 absolute left-3.5 text-[var(--text-muted)] pointer-events-none" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 text-sm bg-white/50 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/50 text-[var(--text-primary)]"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Email Address
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 absolute left-3.5 text-[var(--text-muted)] pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 text-sm bg-white/50 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/50 text-[var(--text-primary)]"
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              {token ? "Save New Password" : "Send Reset Link"}
            </Button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </GlassCard>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="animate-pulse text-sm text-[var(--text-muted)]">
            Loading...
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

