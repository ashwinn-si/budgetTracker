"use client";

import React, { useState, useEffect, useRef } from "react";
import { PiggyBank, Calendar, FileText } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LocalSaving } from "@/lib/offline/db";
import { queueSavingCreation, queueSavingUpdate } from "@/lib/offline/syncQueue";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { formatAmountInput, parseAmountInput } from "@/lib/currency";
import toast from "react-hot-toast";

interface SavingsDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDeposit?: LocalSaving | null;
  onSaved?: () => void;
}

export function SavingsDepositModal({
  isOpen,
  onClose,
  initialDeposit,
  onSaved,
}: SavingsDepositModalProps) {
  const { user } = useAuth();
  const { currencyInfo } = useCurrency();
  const userId = user?.id || "local_user";

  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialDeposit) {
      setAmount(formatAmountInput(initialDeposit.amount.toString(), currencyInfo.locale));
      setNote(initialDeposit.note || "");
      setDate(initialDeposit.date ? initialDeposit.date.split("T")[0] : new Date().toISOString().split("T")[0]);
    } else {
      setAmount("");
      setNote("");
      setDate(new Date().toISOString().split("T")[0]);
    }
  }, [initialDeposit, isOpen, currencyInfo.locale]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const rawValue = input.value;
    const cursor = input.selectionStart || 0;

    const rawBeforeCursor = rawValue.slice(0, cursor);
    const digitsBeforeCursor = rawBeforeCursor.replace(/[^\d.]/g, "").length;

    const formatted = formatAmountInput(rawValue, currencyInfo.locale);
    setAmount(formatted);

    requestAnimationFrame(() => {
      if (!amountInputRef.current) return;
      let newCursor = formatted.length;
      let count = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (/[\d.]/.test(formatted[i])) {
          count++;
        }
        if (count >= digitsBeforeCursor) {
          newCursor = i + 1;
          break;
        }
      }
      amountInputRef.current.setSelectionRange(newCursor, newCursor);
    });
  };

  const handleAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    if (e.key === "Backspace" && input.selectionStart === input.selectionEnd) {
      const pos = input.selectionStart ?? 0;
      if (pos > 0 && input.value[pos - 1] === ",") {
        e.preventDefault();
        const val = input.value;
        const updated = val.slice(0, pos - 2) + val.slice(pos - 1);
        const formatted = formatAmountInput(updated, currencyInfo.locale);
        setAmount(formatted);
        const digitsLeft = val.slice(0, pos - 2).replace(/[^\d.]/g, "").length;
        requestAnimationFrame(() => {
          if (!amountInputRef.current) return;
          let newPos = 0;
          let count = 0;
          for (let i = 0; i < formatted.length; i++) {
            if (/[\d.]/.test(formatted[i])) count++;
            if (count === digitsLeft) {
              newPos = i + 1;
              break;
            }
          }
          amountInputRef.current.setSelectionRange(newPos, newPos);
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const parsedAmount = parseAmountInput(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid amount greater than 0");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();

      if (initialDeposit) {
        const updatedSaving: LocalSaving = {
          ...initialDeposit,
          amount: parsedAmount,
          note: note.trim(),
          date,
          updatedAt: now,
          syncStatus: "pending",
        };
        await queueSavingUpdate(updatedSaving);
      } else {
        const newDeposit: LocalSaving = {
          clientId: `sav_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          userId,
          amount: parsedAmount,
          type: "deposit",
          note: note.trim(),
          date,
          createdAt: now,
          updatedAt: now,
          syncStatus: "pending",
        };
        await queueSavingCreation(newDeposit);
      }

      onSaved?.();
      onClose();
    } catch (err) {
      console.error("Save savings error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialDeposit ? "Edit Savings Deposit" : "Add to Savings"}
      subtitle="Allocate money into your savings vault."
      maxWidth="md"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
            fullWidth
            className="sm:w-auto px-5 bg-white/70 dark:bg-white/10 border-black/10 dark:border-white/10 shadow-xs"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            fullWidth
            className="sm:w-auto px-6 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 shadow-lg shadow-teal-500/30"
          >
            {initialDeposit ? "Save Changes" : "Deposit Funds"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 min-w-0 max-w-full">
        {/* Hero Amount Card */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-teal-500/[0.04] dark:bg-teal-500/[0.08] border border-teal-500/30 dark:border-teal-500/20 shadow-xs focus-within:border-teal-500 focus-within:ring-4 focus-within:ring-teal-500/15 transition-all min-w-0">
          <label className="block text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-2 flex items-center gap-1.5">
            <PiggyBank className="w-3.5 h-3.5 shrink-0" />
            <span>Deposit Amount</span>
          </label>
          <div className="flex items-center min-w-0 max-w-full overflow-hidden">
            <span className="text-2xl sm:text-3xl lg:text-4xl font-serif-display font-bold text-teal-600 dark:text-teal-400 mr-2 select-none shrink-0">
              {currencyInfo.symbol}
            </span>
            <input
              ref={amountInputRef}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={handleAmountChange}
              onKeyDown={handleAmountKeyDown}
              required
              autoFocus
              className="w-full min-w-0 max-w-full text-2xl sm:text-3xl lg:text-4xl font-serif-display font-bold text-[var(--text-primary)] bg-transparent outline-none placeholder:text-[var(--text-muted)]/30"
            />
          </div>
        </div>

        {/* Date and Description */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 min-w-0 max-w-full">
          <div className="space-y-1.5 min-w-0 max-w-full">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>Date</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full min-w-0 max-w-full appearance-none px-3.5 sm:px-4 py-2.5 sm:py-3 text-base sm:text-sm font-medium bg-white/80 dark:bg-black/25 border border-black/[0.08] dark:border-white/10 rounded-2xl text-[var(--text-primary)] outline-none focus:ring-3 focus:ring-teal-500/20 focus:border-teal-500 focus:bg-white dark:focus:bg-black/40 shadow-xs transition-all"
            />
          </div>

          <div className="space-y-1.5 min-w-0 max-w-full">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>Purpose / Note</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Monthly salary allocation"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full min-w-0 max-w-full px-3.5 sm:px-4 py-2.5 sm:py-3 text-base sm:text-sm bg-white/80 dark:bg-black/25 border border-black/[0.08] dark:border-white/10 rounded-2xl text-[var(--text-primary)] outline-none focus:ring-3 focus:ring-teal-500/20 focus:border-teal-500 focus:bg-white dark:focus:bg-black/40 placeholder:text-[var(--text-muted)]/50 shadow-xs transition-all"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
