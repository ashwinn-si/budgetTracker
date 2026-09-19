"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Lock, Mail, User, ArrowRight } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const router = useRouter();
  const { register, user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await register(name, email, password);
      if (result.success) {
        router.push("/dashboard");
      } else {
        setError(result.error || "Registration failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard variant="strong" className="w-full max-w-md p-8 sm:p-10 space-y-7 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl overflow-hidden mx-auto shadow-lg border border-white/60 dark:border-white/10">
            <Image
              src="/logo.png"
              alt="BudgetFlow Logo"
              width={64}
              height={64}
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif-display font-medium text-[var(--text-primary)]">
            Create <em>Account</em>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)]">
            Begin tracking your budget with instant offline sync.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Full Name
            </label>
            <div className="relative flex items-center">
              <User className="w-4 h-4 absolute left-3.5 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                required
                placeholder="Alex Morgan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 text-sm bg-white/50 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/50 text-[var(--text-primary)]"
              />
            </div>
          </div>

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

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Password (min. 6 characters)
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 absolute left-3.5 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 text-sm bg-white/50 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/50 text-[var(--text-primary)]"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            fullWidth
            isLoading={isLoading}
            icon={<ArrowRight className="w-4 h-4" />}
          >
            Create Account
          </Button>
        </form>

        <div className="text-center pt-2">
          <p className="text-xs text-[var(--text-muted)]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
            >
              Sign In
            </Link>
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
