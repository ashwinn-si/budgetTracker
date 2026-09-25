import { db, ensureLocalGeneralTrip, LocalTrip } from "../../db";
import { PullSession } from "./session";

function mapServerTrip(t: Record<string, unknown>): LocalTrip {
  return {
    tripId: t.tripId as string,
    _id: (t._id as { toString(): string })?.toString() ?? (t._id ? String(t._id) : undefined),
    userId: (t.userId as string) || "local_user",
    name: (t.name as string) || "Trip",
    emoji: (t.emoji as string) || "",
    colorKey: (t.colorKey as string) || "#22C55E",
    isDefault: Boolean(t.isDefault),
    status: (t.status as "active" | "completed") || "active",
    completedAt: t.completedAt ? new Date(t.completedAt as string).toISOString() : null,
    mirrorToTripIds: Array.isArray(t.mirrorToTripIds) ? (t.mirrorToTripIds as string[]) : [],
    startDate: t.startDate ? new Date(t.startDate as string).toISOString() : null,
    endDate: t.endDate ? new Date(t.endDate as string).toISOString() : null,
    isSharingEnabled: Boolean(t.isSharingEnabled),
    shareId: (t.shareId as string) || null,
    shareMode: t.shareMode === "monthly" || t.shareMode === "full" ? t.shareMode : undefined,
    createdAt: t.createdAt ? new Date(t.createdAt as string).toISOString() : undefined,
    updatedAt: t.updatedAt ? new Date(t.updatedAt as string).toISOString() : undefined,
  };
}

/**
 * Pull trips first, so tags/expenses can be reconciled against known trip ids.
 * Removes local trips that are gone on the server and not pending sync.
 */
export async function pullTrips(session: PullSession): Promise<void> {
  const res = await session.get("/api/trips");
  let localUserId: string | undefined;

  if (res.ok) {
    const data = await res.json();
    if (Array.isArray(data.trips)) {
      const localTrips = (data.trips as Record<string, unknown>[]).map(mapServerTrip);
      if (localTrips.length > 0) localUserId = localTrips[localTrips.length - 1].userId;
      await db.trips.bulkPut(localTrips);

      const serverTripIds = new Set(localTrips.map((t) => t.tripId));
      const pendingTripItems = await db.syncQueue.where("entity").equals("trip").toArray();
      const pendingTripIds = new Set(pendingTripItems.map((p) => p.clientId));
      const currentLocalTrips = await db.trips.toArray();
      for (const lt of currentLocalTrips) {
        if (!serverTripIds.has(lt.tripId) && !pendingTripIds.has(lt.tripId)) {
          await db.trips.delete(lt.tripId);
        }
      }
    }
  }

  if (localUserId) {
    await ensureLocalGeneralTrip(localUserId);
  }
}
