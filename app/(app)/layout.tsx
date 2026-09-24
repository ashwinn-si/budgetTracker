"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Navbar } from "@/components/layout/Navbar";
import { ExpenseFormModal } from "@/components/expenses/ExpenseFormModal";
import { useAuth } from "@/context/AuthContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { Loader } from "@/components/ui/Loader";

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
    return <Loader fullScreen message="Entering BudgetFlow..." showBrand />;
  }

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      {/* Outer shell: fixed to the dynamic viewport (dvh) so iOS toolbars never hide the bottom of the page */}
      <div className="h-dvh overflow-hidden flex w-full">
        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Navbar */}
          <Navbar />

          {/* Page Content — only this scrolls */}
          <main className="flex-1 overflow-y-auto w-full">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-[calc(7rem_+_env(safe-area-inset-bottom,0px))] lg:pb-8">
              {children}
            </div>
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
    </SidebarProvider>
  );
}
