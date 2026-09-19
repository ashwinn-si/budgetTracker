import { differenceInCalendarDays } from "date-fns";

export interface PacingResult {
  hasBaseline: boolean;
  pacingPercent: number | null;
  expectedByNow: number | null;
  status: "under" | "on_track" | "over" | "none";
  elapsedDays: number;
  totalDays: number;
}

/**
 * Computes pacing against a baseline (previous period spend).
 * If baseline is 0 or not available, hasBaseline is false.
 */
export function calculatePacing(
  currentSpend: number,
  prevSpend: number,
  startDate: Date,
  endDate: Date
): PacingResult {
  const now = new Date();
  const totalDays = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);

  // Calculate elapsed days within the period
  let elapsedDays: number;
  if (now < startDate) {
    elapsedDays = 0;
  } else if (now > endDate) {
    elapsedDays = totalDays;
  } else {
    elapsedDays = Math.max(1, differenceInCalendarDays(now, startDate) + 1);
  }

  if (prevSpend <= 0) {
    return {
      hasBaseline: false,
      pacingPercent: null,
      expectedByNow: null,
      status: "none",
      elapsedDays,
      totalDays,
    };
  }

  // Expected spend at this point in the period assuming linear distribution
  const expectedByNow = (elapsedDays / totalDays) * prevSpend;

  // Pacing percentage: current spend vs expected spend
  // 100% means exactly on budget for the elapsed time
  const pacingPercent = expectedByNow > 0
    ? Math.round((currentSpend / expectedByNow) * 100)
    : Math.round((currentSpend / prevSpend) * 100);

  let status: "under" | "on_track" | "over" = "on_track";
  if (pacingPercent < 90) {
    status = "under";
  } else if (pacingPercent > 110) {
    status = "over";
  }

  return {
    hasBaseline: true,
    pacingPercent,
    expectedByNow,
    status,
    elapsedDays,
    totalDays,
  };
}
