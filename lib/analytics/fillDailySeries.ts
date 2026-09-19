import { eachDayOfInterval, format, isSameDay } from "date-fns";

export interface DailySeriesPoint {
  date: string;       // Formatted short label e.g. "Sep 17"
  dayNumber: string;  // e.g. "17"
  fullDate: string;   // "2026-09-17"
  amount: number;
  rawDate: Date;
}

export function fillDailySeries(
  expenses: Array<{ date: string | Date; amount: number }>,
  startDate: Date,
  endDate: Date
): DailySeriesPoint[] {
  // Ensure start <= end
  const start = startDate < endDate ? startDate : endDate;
  const end = startDate < endDate ? endDate : startDate;

  // Generate list of days
  let days: Date[] = [];
  try {
    days = eachDayOfInterval({ start, end });
  } catch (err) {
    console.warn("Interval error in fillDailySeries:", err);
    days = [start];
  }

  // Pre-aggregate expenses by ISO date (YYYY-MM-DD)
  const amountByDate = new Map<string, number>();
  for (const exp of expenses) {
    const d = new Date(exp.date);
    if (isNaN(d.getTime())) continue;
    const key = format(d, "yyyy-MM-dd");
    amountByDate.set(key, (amountByDate.get(key) || 0) + exp.amount);
  }

  return days.map((day) => {
    const key = format(day, "yyyy-MM-dd");
    const amount = Math.round((amountByDate.get(key) || 0) * 100) / 100;
    return {
      date: format(day, "MMM d"),
      dayNumber: format(day, "d"),
      fullDate: key,
      amount,
      rawDate: day,
    };
  });
}
