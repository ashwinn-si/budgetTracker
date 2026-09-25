import { db, LocalExpense, LocalSaving, LocalTag, LocalTrip } from "../db";
import { GENERAL_TRIP_ID } from "@/lib/trips";
import { buildAuthHeaders, getStoredAccessToken } from "./auth";
import { deduplicateDeleteLogs, findDeleteLog, removeAllCopiesOfLog } from "./deleteLogs";
import { queueExpenseCreation, queueExpenseUpdate } from "./expenses";
import { queueSavingCreation } from "./savings";
import { queueTagCreation } from "./tags";
import { queueTripCreation } from "./trips";
import { pullFromServer } from "./pull";

/** Fall back to the General trip when the original trip no longer exists locally. */
async function resolveTripId(tripId?: string | null): Promise<string> {
  const id = tripId || GENERAL_TRIP_ID;
  if (id === GENERAL_TRIP_ID) return GENERAL_TRIP_ID;
  const existingTrip = await db.trips.get(id);
  return existingTrip ? id : GENERAL_TRIP_ID;
}

/**
 * Restore an item from the Recycle Bin. Accepts a local log id, entityId, or
 * server _id. Re-creates the entity through the normal queue helpers, removes
 * every local copy of the log, then notifies the server.
 */
export async function recoverDeletedItem(logId: string): Promise<{ success: boolean; entityType?: string; error?: string }> {
  try {
    const { log, allLogs } = await findDeleteLog(logId);
    if (!log) {
      // Try direct server recovery
      const token = getStoredAccessToken();
      const res = await fetch("/api/delete-logs/recover", {
        method: "POST",
        headers: buildAuthHeaders(token),
        body: JSON.stringify({ logId }),
      });
      if (res.ok) {
        await pullFromServer();
        await deduplicateDeleteLogs();
        return { success: true };
      }
      return { success: false, error: "Record not found in recycle bin" };
    }

    const { entityType, data, entityId } = log;

    if (entityType === "expense") {
      const exp = data as unknown as LocalExpense;
      await queueExpenseCreation({
        ...exp,
        clientId: exp.clientId || entityId,
        tripId: await resolveTripId(exp.tripId),
        syncStatus: "pending",
        updatedAt: new Date().toISOString(),
      });
    } else if (entityType === "saving") {
      const sav = data as unknown as LocalSaving;
      await queueSavingCreation({
        ...sav,
        clientId: sav.clientId || entityId,
        syncStatus: "pending",
        updatedAt: new Date().toISOString(),
      });
    } else if (entityType === "tag") {
      const tag = data as unknown as LocalTag;
      const restoredTag: LocalTag = {
        ...tag,
        _id: tag._id || entityId,
        tripId: await resolveTripId(tag.tripId),
      };
      await queueTagCreation(restoredTag);

      // Reattach tag to affected expenses
      const affected = (data.affectedExpenseClientIds || data.affectedExpenseIds) as string[] | undefined;
      if (Array.isArray(affected) && affected.length > 0) {
        for (const cId of affected) {
          const exp = await db.expenses.get(cId);
          if (exp) {
            const currentTagIds = Array.isArray(exp.tagIds) ? exp.tagIds : [];
            if (!currentTagIds.includes(restoredTag._id)) {
              exp.tagIds = [...currentTagIds, restoredTag._id];
              await queueExpenseUpdate(exp);
            }
          }
        }
      }
    } else if (entityType === "trip") {
      const snapshot = data as unknown as {
        trip: LocalTrip;
        tags?: LocalTag[];
        expenses?: LocalExpense[];
      };
      const restoredTrip: LocalTrip = {
        ...snapshot.trip,
        tripId: snapshot.trip.tripId || entityId,
      };
      await queueTripCreation(restoredTrip);

      for (const tag of snapshot.tags || []) {
        await queueTagCreation({ ...tag, tripId: restoredTrip.tripId });
      }
      for (const exp of snapshot.expenses || []) {
        await queueExpenseCreation({
          ...exp,
          tripId: restoredTrip.tripId,
          syncStatus: "pending",
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // Remove ALL matching copies from Dexie deleteLogs
    await removeAllCopiesOfLog(log, allLogs);

    // Notify server recovery endpoint
    try {
      const token = getStoredAccessToken();
      await fetch("/api/delete-logs/recover", {
        method: "POST",
        headers: buildAuthHeaders(token),
        body: JSON.stringify({ logId: log._id || log.id, entityId: log.entityId }),
      });
    } catch (netErr) {
      console.warn("[recoverDeletedItem] Offline server notify error:", netErr);
    }

    await deduplicateDeleteLogs();
    return { success: true, entityType };
  } catch (err: unknown) {
    console.error("[recoverDeletedItem] Error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Recovery failed" };
  }
}
