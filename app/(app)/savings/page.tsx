"use client";

import React, { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  PiggyBank,
  ArrowDownLeft,
  Plus,
  Search,
  Calendar,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  TrendingUp,
  Wallet,
  ArrowUpRight,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { db, LocalExpense, LocalSaving } from "@/lib/offline/db";
import { queueExpenseDeletion, queueSavingDeletion } from "@/lib/offline/syncQueue";
import { useCurrency } from "@/context/CurrencyContext";
import { SavingsDepositModal } from "@/components/savings/SavingsDepositModal";
import { ExpenseFormModal } from "@/components/expenses/ExpenseFormModal";
import toast from "react-hot-toast";

type FilterTab = "all" | "deposits" | "withdrawals";

export default function SavingsPage() {
  const { formatAmount } = useCurrency();

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<LocalSaving | null>(null);

  // Allow editing an expense withdrawal if needed
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<LocalExpense | null>(null);

  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Live queries
  const allSavings = useLiveQuery(() => db.savings.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const allTags = useLiveQuery(() => db.tags.toArray(), []) || [];

  const tagMap = useMemo(() => {
    return new Map(allTags.map((t) => [t._id, t]));
  }, [allTags]);

  // Savings Metrics
  const { totalSaved, totalFromSavings, balance, savingsList } = useMemo(() => {
    const deposits = allSavings.filter((e) => e.type === "deposit");
    const withdrawals = allSavings.filter((e) => e.type === "withdrawal");

    const savedSum = deposits.reduce((sum, e) => sum + e.amount, 0);
    const withdrawnSum = withdrawals.reduce((sum, e) => sum + e.amount, 0);

    const combined = [...allSavings].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return {
      totalSaved: savedSum,
      totalFromSavings: withdrawnSum,
      balance: savedSum - withdrawnSum,
      savingsList: combined,
    };
  }, [allSavings]);

  // Filtered savings logs
  const filteredLogs = useMemo(() => {
    return savingsList.filter((item) => {
      // Tab filter
      if (filterTab === "deposits" && item.type !== "deposit") return false;
      if (filterTab === "withdrawals" && item.type !== "withdrawal") return false;

      // Search filter
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesNote = (item.note || "").toLowerCase().includes(q);
        const matchesAmount = item.amount.toString().includes(q);
        
        let matchesTag = false;
        if (item.linkedExpenseId) {
          const exp = allExpenses.find(e => e.clientId === item.linkedExpenseId);
          if (exp && exp.tagIds) {
            matchesTag = exp.tagIds.some((tId) => (tagMap.get(tId)?.name || "").toLowerCase().includes(q));
          }
        }
        if (!matchesNote && !matchesAmount && !matchesTag) return false;
      }

      return true;
    });
  }, [savingsList, filterTab, searchTerm, tagMap]);

  const handleDelete = async (item: LocalSaving) => {
    if (confirm("Are you sure you want to delete this record?")) {
      await queueSavingDeletion(item.clientId);
      if (item.linkedExpenseId) {
        await queueExpenseDeletion(item.linkedExpenseId);
      }
    }
  };

  const handleEditRecord = (item: LocalSaving) => {
    if (item.type === "deposit") {
      setEditingDeposit(item);
      setIsDepositModalOpen(true);
    } else {
      if (item.linkedExpenseId) {
        const expense = allExpenses.find((e) => e.clientId === item.linkedExpenseId);
        if (expense) {
          setEditingExpense(expense);
          setIsExpenseModalOpen(true);
        } else {
          toast.error("Linked expense not found.");
        }
      } else {
        toast.error("Cannot edit standalone withdrawal yet.");
      }
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
            <PiggyBank className="w-3.5 h-3.5" />
            <span>Financial Vault</span>
          </span>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif-display font-medium text-[var(--text-primary)] tracking-tight mt-1">
            Savings & <em>Reserves</em>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
            Deposit allocations to your savings and track spending drawn from your reserves.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            setEditingDeposit(null);
            setIsDepositModalOpen(true);
          }}
          icon={<Plus className="w-4 h-4 stroke-[2.5]" />}
          className="shadow-teal-500/20 shadow-lg bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700"
        >
          Add to Savings
        </Button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Net Savings Balance */}
        <GlassCard
          variant="mid"
          className="p-5 relative overflow-hidden flex flex-col justify-between border-teal-500/30"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
              Net Savings Balance
            </span>
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-4">
            <h2
              className={`text-2xl sm:text-3xl lg:text-4xl font-serif-display font-bold tracking-tight ${
                balance >= 0 ? "text-teal-600 dark:text-teal-400" : "text-rose-500"
              }`}
            >
              {balance >= 0 ? "" : "-"}
              {formatAmount(Math.abs(balance))}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  balance >= 0 ? "bg-teal-500" : "bg-rose-500"
                }`}
              />
              {balance >= 0 ? "Available reserve funds" : "Deficit: withdrawals exceed deposits"}
            </p>
          </div>
        </GlassCard>

        {/* Total Deposited */}
        <GlassCard variant="light" className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Total Added to Savings
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xl sm:text-2xl lg:text-3xl font-serif-display font-bold text-[var(--text-primary)]">
              {formatAmount(totalSaved)}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              {allSavings.filter((e) => e.type === "deposit").length} deposit transaction
              {allSavings.filter((e) => e.type === "deposit").length === 1 ? "" : "s"}
            </p>
          </div>
        </GlassCard>

        {/* Total Spent from Savings */}
        <GlassCard variant="light" className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Spent from Savings
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xl sm:text-2xl lg:text-3xl font-serif-display font-bold text-amber-600 dark:text-amber-400">
              {formatAmount(totalFromSavings)}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              {allSavings.filter((e) => e.type === "withdrawal").length} expenditure
              {allSavings.filter((e) => e.type === "withdrawal").length === 1 ? "" : "s"} drawn from savings
            </p>
          </div>
        </GlassCard>
      </div>

      {/* Activity Filter & Search Bar */}
      <GlassCard variant="light" className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 w-full sm:w-auto overflow-x-auto hide-scrollbar">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                filterTab === "all"
                  ? "bg-white dark:bg-zinc-800 text-[var(--text-primary)] shadow-xs font-semibold"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              All Activity ({savingsList.length})
            </button>
            <button
              onClick={() => setFilterTab("deposits")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                filterTab === "deposits"
                  ? "bg-teal-500 text-white shadow-xs font-semibold"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <PiggyBank className="w-3 h-3" />
              Deposits ({allSavings.filter((e) => e.type === "deposit").length})
            </button>
            <button
              onClick={() => setFilterTab("withdrawals")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                filterTab === "withdrawals"
                  ? "bg-amber-500 text-white shadow-xs font-semibold"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <ArrowDownLeft className="w-3 h-3" />
              Spent from Savings ({allSavings.filter((e) => e.type === "withdrawal").length})
            </button>
          </div>

          {/* Search box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search savings note or amount..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-white/50 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-teal-500/40 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>
      </GlassCard>

      {/* Savings Logs / Transactions List */}
      <div className="overflow-y-auto max-h-[calc(100vh-380px)] pr-2 -mr-2 custom-scrollbar">
        <div className="space-y-3 pb-4">
          {filteredLogs.length === 0 ? (
            <GlassCard variant="light" className="p-8 sm:p-12 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-3xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shadow-inner">
              <PiggyBank className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-base sm:text-lg text-[var(--text-primary)]">
                No savings records found
              </h3>
              <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-md mx-auto">
                {searchTerm
                  ? "No transactions match your search query."
                  : "Start building your reserve by adding funds to your savings vault."}
              </p>
            </div>
            {!searchTerm && (
              <Button
                variant="primary"
                onClick={() => {
                  setEditingDeposit(null);
                  setIsDepositModalOpen(true);
                }}
                icon={<Plus className="w-4 h-4" />}
                className="mt-2 bg-teal-500 hover:bg-teal-600 shadow-teal-500/25"
              >
                Deposit First Amount
              </Button>
            )}
          </GlassCard>
        ) : (
          filteredLogs.map((item) => {
            const isDeposit = item.type === "deposit";
            const itemDate = new Date(item.date).toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            });

            // Find linked expense tags for withdrawals
            const linkedExp = item.linkedExpenseId ? allExpenses.find((e) => e.clientId === item.linkedExpenseId) : null;
            const itemTagIds = linkedExp?.tagIds || [];

            return (
              <GlassCard
                key={item.clientId}
                variant="mid"
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-teal-500/30 transition-all duration-200"
              >
                {/* Left details */}
                <div className="flex items-start gap-3.5 min-w-0">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      isDeposit
                        ? "bg-teal-500/15 text-teal-600 dark:text-teal-400"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {isDeposit ? (
                      <PiggyBank className="w-5 h-5" />
                    ) : (
                      <ArrowDownLeft className="w-5 h-5" />
                    )}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm sm:text-base text-[var(--text-primary)] truncate max-w-full">
                        {item.note || (isDeposit ? "Savings Allocation" : "Expense from Savings")}
                      </h4>

                      {/* Badge */}
                      {isDeposit ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                          <Plus className="w-2.5 h-2.5 stroke-[3]" /> Added to Savings
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          <ArrowDownLeft className="w-2.5 h-2.5" /> Spent from Savings
                        </span>
                      )}

                      {/* Sync Status Badge */}
                      {item.syncStatus === "synced" ? (
                        <span
                          title="Synced to cloud"
                          className="inline-flex items-center text-teal-600 dark:text-teal-400"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span
                          title="Pending offline sync"
                          className="inline-flex items-center text-amber-500 animate-pulse"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>

                    {/* Metadata & Tag Badges */}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--text-muted)]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {itemDate}
                      </span>

                      {/* Show category tag for expenditures */}
                      {!isDeposit && itemTagIds.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {itemTagIds.map((tId) => {
                            const tag = tagMap.get(tId);
                            if (!tag) return null;
                            return (
                              <span
                                key={tId}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border border-black/5 dark:border-white/10"
                                style={{
                                  backgroundColor: `${tag.colorKey || "#10b981"}15`,
                                  color: tag.colorKey || "#10b981",
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: tag.colorKey || "#10b981" }}
                                />
                                <span className="truncate max-w-[100px]">{tag.name}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right amount and actions */}
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-13 sm:pl-0">
                  <span
                    className={`font-serif-display text-base sm:text-lg lg:text-xl font-bold tracking-tight ${
                      isDeposit
                        ? "text-teal-600 dark:text-teal-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {isDeposit ? "+" : "-"}
                    {formatAmount(item.amount)}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditRecord(item)}
                      aria-label="Edit record"
                      title="Edit"
                      className="p-2 rounded-xl text-[var(--text-muted)] hover:text-teal-600 dark:hover:text-teal-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      aria-label="Delete record"
                      title="Delete"
                      className="p-2 rounded-xl text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })
        )}
        </div>
      </div>

      {/* Deposit Modal */}
      <SavingsDepositModal
        isOpen={isDepositModalOpen}
        onClose={() => {
          setIsDepositModalOpen(false);
          setEditingDeposit(null);
        }}
        initialDeposit={editingDeposit}
      />

      {/* Expense Modal (for editing an expenditure paid from savings) */}
      <ExpenseFormModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setEditingExpense(null);
        }}
        initialExpense={editingExpense}
      />
    </div>
  );
}
