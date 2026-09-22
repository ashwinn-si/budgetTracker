export const GENERAL_TRIP_ID = "general";

export type TripLike = {
  tripId: string;
  mirrorToTripIds?: string[];
  name?: string;
  emoji?: string;
  colorKey?: string;
  status?: string;
  shareMode?: "monthly" | "full";
};

export function getEffectiveShareMode(trip: TripLike): "monthly" | "full" {
  return trip.shareMode ?? (trip.tripId === GENERAL_TRIP_ID ? "monthly" : "full");
}

// Trips (other than the target) whose mirrorToTripIds includes the target. Not transitive.
export function getSourceTripIds(trips: TripLike[], targetTripId: string): string[] {
  return trips
    .filter((t) => t.tripId !== targetTripId && (t.mirrorToTripIds || []).includes(targetTripId))
    .map((t) => t.tripId);
}

export function getVisibleTripIds(trips: TripLike[], targetTripId: string): string[] {
  return [targetTripId, ...getSourceTripIds(trips, targetTripId)];
}

// Values for a Mongo `tripId: {$in}` match; null also matches docs not yet backfilled by the migration (= General).
export function tripIdMatchValues(tripIds: string[]): (string | null)[] {
  return tripIds.includes(GENERAL_TRIP_ID) ? [...tripIds, null] : tripIds;
}

export function tripIdFilter(tripId: string): string | { $in: (string | null)[] } {
  return tripId === GENERAL_TRIP_ID ? { $in: [GENERAL_TRIP_ID, null] } : tripId;
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

// General first, then active trips, then completed trips, each group ordered by creation time.
export function sortTripsForCombinedShare<T extends TripLike & { createdAt?: Date | string }>(
  trips: T[]
): T[] {
  const byCreatedAt = (a: T, b: T) =>
    new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  const general = trips.filter((t) => t.tripId === GENERAL_TRIP_ID);
  const others = trips.filter((t) => t.tripId !== GENERAL_TRIP_ID);
  const active = others.filter((t) => t.status !== "completed").sort(byCreatedAt);
  const completed = others.filter((t) => t.status === "completed").sort(byCreatedAt);
  return [...general, ...active, ...completed];
}

// False for the same trip, or if the target already mirrors into the source (would create a 2-cycle).
export function canMirrorInto(trips: TripLike[], sourceTripId: string, targetTripId: string): boolean {
  if (sourceTripId === targetTripId) return false;
  const target = trips.find((t) => t.tripId === targetTripId);
  if (target && (target.mirrorToTripIds || []).includes(sourceTripId)) return false;
  return true;
}
