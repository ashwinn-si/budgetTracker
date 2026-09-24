import React from "react";
import { RecentExpense } from "./types";
import { FromTripPill } from "./FromTripPill";

export function ExpenseRow({
  exp,
  formatAmount,
  showDate,
  formatExpenseDate,
}: {
  exp: RecentExpense;
  formatAmount: (val: number) => string;
  showDate: boolean;
  formatExpenseDate: (val: string) => string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
      {showDate && (
        <div className="w-14 shrink-0 text-xs font-medium text-[var(--text-muted)]">
          {formatExpenseDate(exp.date)}
        </div>
      )}
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-[var(--text-primary)] truncate">
          {exp.note || "Expense"}
        </span>
        {exp.tags.map((tag) => (
          <span
            key={tag.name}
            className="text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0"
            style={{
              backgroundColor: `${tag.colorKey}1F`,
              borderColor: `${tag.colorKey}40`,
              color: tag.colorKey,
            }}
          >
            {tag.name}
          </span>
        ))}
        {exp.sourceTrip && (
          <FromTripPill
            name={exp.sourceTrip.name}
            emoji={exp.sourceTrip.emoji}
            colorKey={exp.sourceTrip.colorKey}
          />
        )}
      </div>
      <div className="shrink-0 font-serif-display font-medium text-[var(--text-primary)]">
        {formatAmount(exp.amount)}
      </div>
    </div>
  );
}
