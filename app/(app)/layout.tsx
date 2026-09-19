"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Navbar } from "@/components/layout/Navbar";
import { ExpenseFormModal } from "@/components/expenses/ExpenseFormModal";
import { useAuth } from "@/context/AuthContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8] dark:bg-[#0B140F]">
        <div className="w-10 h-10 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex w-full">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <Navbar />

        {/* Page Content */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav onOpenAddExpense={() => setIsAddExpenseOpen(true)} />

      {/* Global Quick Add Expense Modal */}
      <ExpenseFormModal
        isOpen={isAddExpenseOpen}
        onClose={() => setIsAddExpenseOpen(false)}
      />
    </div>
  );
}
