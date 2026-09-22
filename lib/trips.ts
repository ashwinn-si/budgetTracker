export const GENERAL_TRIP_ID = "general";

export type TripLike = {
  tripId: string;
  mirrorToTripIds?: string[];
  name?: string;
  emoji?: string;
  colorKey?: string;
  status?: string;
};

// Trips (other than the target) whose mirrorToTripIds includes the target. Not transitive.
export function getSourceTripIds(trips: TripLike[], targetTripId: string): string[] {
  return trips
    .filter((t) => t.tripId !== targetTripId && (t.mirrorToTripIds || []).includes(targetTripId))
    .map((t) => t.tripId);
}

export function getVisibleTripIds(trips: TripLike[], targetTripId: string): string[] {
  return [targetTripId, ...getSourceTripIds(trips, targetTripId)];
}

export function filterExpensesForTrip<T extends { tripId?: string }>(
  expenses: T[],
  targetTripId: string,
  trips: TripLike[]
): { own: T[]; mirrored: T[]; all: T[] } {
  const sourceTripIds = new Set(getSourceTripIds(trips, targetTripId));
  const own: T[] = [];
  const mirrored: T[] = [];

  for (const expense of expenses) {
    const tripId = expense.tripId || GENERAL_TRIP_ID;
    if (tripId === targetTripId) {
      own.push(expense);
    } else if (sourceTripIds.has(tripId)) {
      mirrored.push(expense);
    }
  }

  return { own, mirrored, all: [...own, ...mirrored] };
}

export function generateTripId(): string {
  return `trip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// False for the same trip, or if the target already mirrors into the source (would create a 2-cycle).
export function canMirrorInto(trips: TripLike[], sourceTripId: string, targetTripId: string): boolean {
  if (sourceTripId === targetTripId) return false;
  const target = trips.find((t) => t.tripId === targetTripId);
  if (target && (target.mirrorToTripIds || []).includes(sourceTripId)) return false;
  return true;
}
