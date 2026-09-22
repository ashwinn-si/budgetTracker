"use client";

import React from "react";
import { Calendar, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LocalExpense, LocalTag } from "@/lib/offline/db";
import { useTrip } from "@/context/TripContext";
import { useCurrency } from "@/context/CurrencyContext";
import { GENERAL_TRIP_ID } from "@/lib/trips";

interface MirroredExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: LocalExpense | null;
  tagMap: Map<string, LocalTag>;
}

export function MirroredExpenseModal({ isOpen, onClose, expense, tagMap }: MirroredExpenseModalProps) {
  const { getTrip, activeTrip, setActiveTrip } = useTrip();
  const { formatAmount } = useCurrency();

  const sourceTripId = expense?.tripId || GENERAL_TRIP_ID;
  const sourceTrip = getTrip(sourceTripId);
  const sourceTripName = sourceTrip?.name || "another trip";

  const handleSwitch = () => {
    setActiveTrip(sourceTripId);
    onClose();
    toast.success(`Switched to ${sourceTripName}`);
  };

  const dateFormatted = expense?.date
    ? new Date(expense.date).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <Modal
      isOpen={isOpen && !!expense}
      onClose={onClose}
      title={`Expense from ${sourceTrip?.emoji ? `${sourceTrip.emoji} ` : ""}${sourceTripName}`}
      maxWidth="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} fullWidth className="sm:w-auto">
            Close
          </Button>
          <Button variant="primary" onClick={handleSwitch} fullWidth className="sm:w-auto">
            Switch to {sourceTripName}
          </Button>
        </>
      }
    >
      {expense && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white/60 dark:bg-black/25 border border-black/[0.06] dark:border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Amount
              </span>
              <span className="text-xl font-serif-display font-semibold text-[var(--text-primary)]">
                {formatAmount(expense.amount)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Calendar className="w-3.5 h-3.5" />
              <span>{dateFormatted}</span>
            </div>

            {expense.note && (
              <div className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{expense.note}</span>
              </div>
            )}

            {expense.tagIds && expense.tagIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {expense.tagIds.map((tId) => {
                  const tag = tagMap.get(tId);
                  if (!tag) return null;
                  return (
                    <span
                      key={tId}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium border"
                      style={{
                        backgroundColor: `${tag.colorKey}15`,
                        borderColor: `${tag.colorKey}30`,
                        color: tag.colorKey,
                      }}
                    >
                      {tag.name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            This expense belongs to {sourceTripName}. It&apos;s counted here because {sourceTripName} is set to
            also count in {activeTrip.name}. To edit or delete it, switch to {sourceTripName}.
          </p>
        </div>
      )}
    </Modal>
  );
}
