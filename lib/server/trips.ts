import { Trip, ITrip } from "@/models/Trip";
import { Expense } from "@/models/Expense";
import { Tag } from "@/models/Tag";
import { DeleteLog } from "@/models/DeleteLog";
import { GENERAL_TRIP_ID, generateTripId, canMirrorInto, TripLike } from "@/lib/trips";

export interface TripOpResult {
  trip?: ITrip;
  error?: string;
  status?: number;
}

export async function ensureGeneralTrip(userId: string): Promise<ITrip> {
  const trip = await Trip.findOneAndUpdate(
    { userId, tripId: GENERAL_TRIP_ID },
    {
      $setOnInsert: {
        userId,
        tripId: GENERAL_TRIP_ID,
        name: "General",
        isDefault: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return trip;
}

export async function listTripsSorted(userId: string): Promise<ITrip[]> {
  await ensureGeneralTrip(userId);
  const trips = await Trip.find({ userId }).lean();
  return trips.sort((a, b) => {
    if (a.tripId === GENERAL_TRIP_ID) return -1;
    if (b.tripId === GENERAL_TRIP_ID) return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }) as unknown as ITrip[];
}

// Keeps only ids that are real trips of this user, aren't the trip itself, and don't already mirror into it (no 2-cycles).
export async function sanitizeMirrorTargets(
  userId: string,
  tripId: string,
  mirrorToTripIds: unknown
): Promise<string[]> {
  if (!Array.isArray(mirrorToTripIds)) return [];
  const userTrips = await Trip.find({ userId }).lean();
  const tripLikes: TripLike[] = userTrips.map((t) => ({
    tripId: t.tripId,
    mirrorToTripIds: t.mirrorToTripIds,
  }));
  const validIds = new Set(userTrips.map((t) => t.tripId));

  const result: string[] = [];
  for (const raw of mirrorToTripIds) {
    const target = String(raw);
    if (!validIds.has(target)) continue;
    if (!canMirrorInto(tripLikes, tripId, target)) continue;
    if (!result.includes(target)) result.push(target);
  }
  return result;
}

export async function upsertTrip(
  userId: string,
  payload: Record<string, unknown>
): Promise<TripOpResult> {
  const rawTripId = typeof payload.tripId === "string" ? payload.tripId.trim() : "";
  const tripId = rawTripId || generateTripId();

  if (tripId === GENERAL_TRIP_ID) {
    return { error: 'Cannot create a trip with id "general"', status: 400 };
  }

  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Trip";
  const mirrorToTripIds = await sanitizeMirrorTargets(userId, tripId, payload.mirrorToTripIds);

  const setDoc: Record<string, unknown> = {
    userId,
    tripId,
    name,
    emoji: typeof payload.emoji === "string" ? payload.emoji : "",
    colorKey: typeof payload.colorKey === "string" ? payload.colorKey : "#22C55E",
    mirrorToTripIds,
    startDate: payload.startDate ? new Date(payload.startDate as string) : null,
    endDate: payload.endDate ? new Date(payload.endDate as string) : null,
  };

  const trip = await Trip.findOneAndUpdate(
    { userId, tripId },
    { $set: setDoc, $setOnInsert: { isDefault: false, status: "active" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { trip: trip! };
}

export async function updateTrip(
  userId: string,
  tripId: string,
  updates: Record<string, unknown>
): Promise<TripOpResult> {
  const trip = await Trip.findOne({ userId, tripId });
  if (!trip) return { error: "Trip not found", status: 404 };

  if (typeof updates.name === "string" && updates.name.trim()) trip.name = updates.name.trim();
  if (typeof updates.emoji === "string") trip.emoji = updates.emoji;
  if (typeof updates.colorKey === "string") trip.colorKey = updates.colorKey;

  if (updates.mirrorToTripIds !== undefined) {
    trip.mirrorToTripIds = await sanitizeMirrorTargets(userId, tripId, updates.mirrorToTripIds);
  }

  if (updates.startDate !== undefined) {
    trip.startDate = updates.startDate ? new Date(updates.startDate as string) : null;
  }
  if (updates.endDate !== undefined) {
    trip.endDate = updates.endDate ? new Date(updates.endDate as string) : null;
  }

  if (updates.status !== undefined) {
    const status = updates.status === "completed" ? "completed" : "active";
    if (trip.isDefault && status === "completed") {
      return { error: "The General trip cannot be marked completed", status: 400 };
    }
    trip.status = status;
    trip.completedAt = status === "completed" ? new Date() : null;
  }

  await trip.save();
  return { trip };
}

export async function deleteTripCascade(userId: string, tripId: string): Promise<TripOpResult & { success?: boolean }> {
  if (tripId === GENERAL_TRIP_ID) {
    return { error: "The General trip cannot be deleted", status: 400 };
  }

  const trip = await Trip.findOne({ userId, tripId });
  if (!trip) return { error: "Trip not found", status: 404 };

  const [tags, expenses] = await Promise.all([
    Tag.find({ userId, tripId }),
    Expense.find({ userId, tripId }),
  ]);

  await DeleteLog.findOneAndUpdate(
    { userId, entityId: tripId, entityType: "trip" },
    {
      $set: {
        userId,
        entityType: "trip",
        entityId: tripId,
        title: trip.name,
        details: `Trip • ${expenses.length} expenses • ${tags.length} categories`,
        data: {
          trip: trip.toObject(),
          tags: tags.map((t) => t.toObject()),
          expenses: expenses.map((e) => e.toObject()),
        },
        deletedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  await Expense.deleteMany({ userId, tripId });
  await Tag.deleteMany({ userId, tripId });
  await Trip.deleteOne({ _id: trip._id });
  await Trip.updateMany({ userId }, { $pull: { mirrorToTripIds: tripId } });

  return { success: true };
}
