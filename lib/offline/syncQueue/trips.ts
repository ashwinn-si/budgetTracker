import { db, LocalTag, LocalTrip } from "../db";
import { GENERAL_TRIP_ID } from "@/lib/trips";
import { sendOrQueue } from "./directSync";
import { writeDeleteLog } from "./deleteLogs";
import { queueTagCreation } from "./tags";

export async function queueTripCreation(
  trip: LocalTrip,
  opts?: { copyTagsFromTripId?: string }
): Promise<void> {
  await db.trips.put(trip);

  await sendOrQueue({
    clientId: trip.tripId,
    action: "create",
    entity: "trip",
    payload: { ...trip },
    createdAt: Date.now(),
  });

  if (opts?.copyTagsFromTripId) {
    const sourceTripId = opts.copyTagsFromTripId;
    const allTags = await db.tags.toArray();
    const sourceTags = allTags.filter((t) => (t.tripId || GENERAL_TRIP_ID) === sourceTripId);
    for (const sourceTag of sourceTags) {
      const newTag: LocalTag = {
        _id: `tag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: sourceTag.userId,
        name: sourceTag.name,
        colorKey: sourceTag.colorKey,
        tripId: trip.tripId,
      };
      await queueTagCreation(newTag);
    }
  }
}

export async function queueTripUpdate(trip: LocalTrip): Promise<void> {
  await db.trips.put(trip);
  await sendOrQueue({
    clientId: trip.tripId,
    action: "update",
    entity: "trip",
    payload: { ...trip },
    createdAt: Date.now(),
  });
}

export async function queueTripDeletion(tripId: string): Promise<boolean> {
  if (tripId === GENERAL_TRIP_ID) return false;

  const trip = await db.trips.get(tripId);
  if (!trip) return false;

  const allTags = await db.tags.toArray();
  const tripTags = allTags.filter((t) => (t.tripId || GENERAL_TRIP_ID) === tripId);
  const allExpenses = await db.expenses.toArray();
  const tripExpenses = allExpenses.filter((e) => (e.tripId || GENERAL_TRIP_ID) === tripId);

  // A trip whose create never synced has nothing on the server to delete; the local log still allows recovery.
  const pendingQueueItems = await db.syncQueue.toArray();
  const hadPendingCreate = pendingQueueItems.some(
    (q) => q.entity === "trip" && q.action === "create" && q.clientId === tripId
  );

  const idsToRemove = pendingQueueItems
    .filter((q) => {
      if (q.entity === "trip" && q.clientId === tripId) return true;
      if ((q.entity === "expense" || q.entity === "tag") && q.payload?.tripId === tripId) return true;
      return false;
    })
    .map((q) => q.id)
    .filter((id): id is number => id !== undefined);
  if (idsToRemove.length > 0) {
    await db.syncQueue.bulkDelete(idsToRemove);
  }

  await writeDeleteLog({
    userId: trip.userId,
    entityType: "trip",
    entityId: tripId,
    title: trip.name,
    details: `Trip • ${tripExpenses.length} expenses • ${tripTags.length} categories`,
    data: { trip, tags: tripTags, expenses: tripExpenses },
    deletedAt: new Date().toISOString(),
    syncStatus: "pending",
  });

  for (const exp of tripExpenses) {
    await db.expenses.delete(exp.clientId);
  }
  for (const tag of tripTags) {
    await db.tags.delete(tag._id);
  }
  await db.trips.delete(tripId);

  await db.trips.toCollection().modify((t) => {
    if (Array.isArray(t.mirrorToTripIds) && t.mirrorToTripIds.includes(tripId)) {
      t.mirrorToTripIds = t.mirrorToTripIds.filter((id) => id !== tripId);
    }
  });

  if (!hadPendingCreate) {
    await sendOrQueue({
      clientId: tripId,
      action: "delete",
      entity: "trip",
      payload: { tripId },
      createdAt: Date.now(),
    });
  }

  return true;
}
