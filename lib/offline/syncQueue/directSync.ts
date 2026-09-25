import { db, SyncQueueItem } from "../db";
import { buildAuthHeaders, getStoredAccessToken, isOnline, refreshAccessToken } from "./auth";

/**
 * Re-point every local reference from `oldId` to `newId`: expense tagIds in
 * Dexie and expense payloads still waiting in the syncQueue.
 */
export async function repointTagReferences(oldId: string, newId: string): Promise<void> {
  const allExpenses = await db.expenses.toArray();
  for (const exp of allExpenses) {
    if (Array.isArray(exp.tagIds) && exp.tagIds.includes(oldId)) {
      exp.tagIds = exp.tagIds.map((id) => (id === oldId ? newId : id));
      await db.expenses.put(exp);
    }
  }

  const queueItems = await db.syncQueue.toArray();
  for (const q of queueItems) {
    if (q.entity === "expense" && Array.isArray(q.payload?.tagIds)) {
      const pIds = q.payload.tagIds as string[];
      if (pIds.includes(oldId)) {
        q.payload.tagIds = pIds.map((id) => (id === oldId ? newId : id));
        await db.syncQueue.put(q);
      }
    }
  }
}

/**
 * Reconcile server-resolved tag IDs into Dexie immediately.
 */
export async function reconcileTagMap(tagMap: Record<string, string>): Promise<void> {
  for (const [localId, serverId] of Object.entries(tagMap)) {
    if (!localId || !serverId || localId === serverId) continue;

    // Replace local tag with serverId in db.tags
    const localTag = await db.tags.get(localId);
    if (localTag) {
      await db.tags.delete(localId);
      await db.tags.put({ ...localTag, _id: serverId });
    }

    await repointTagReferences(localId, serverId);
  }
}

/**
 * Direct sync execution when the client is online.
 * Directly sends the item to the server and returns true on success.
 * Only if this returns false will the caller queue the item in db.syncQueue.
 */
export async function executeDirectSync(item: SyncQueueItem): Promise<boolean> {
  if (!isOnline()) {
    return false;
  }

  try {
    let token = getStoredAccessToken();
    let res = await fetch("/api/expenses/sync", {
      method: "POST",
      headers: buildAuthHeaders(token),
      body: JSON.stringify({ items: [item] }),
    });

    if (res.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        token = refreshedToken;
        res = await fetch("/api/expenses/sync", {
          method: "POST",
          headers: buildAuthHeaders(token),
          body: JSON.stringify({ items: [item] }),
        });
      }
    }

    if (!res.ok) {
      return false;
    }

    const data = await res.json();

    if (Array.isArray(data.failedItems) && data.failedItems.length > 0) {
      console.warn("[directSync] Item failed on server:", data.failedItems);
      return false;
    }

    if (data.tagMap && typeof data.tagMap === "object") {
      await reconcileTagMap(data.tagMap as Record<string, string>);
    }

    // Mark as synced in Dexie
    if (item.entity === "expense" && item.action !== "delete") {
      await db.expenses.update(item.clientId, { syncStatus: "synced" });
    } else if (item.entity === "saving" && item.action !== "delete") {
      await db.savings.update(item.clientId, { syncStatus: "synced" });
    }

    return true;
  } catch (err) {
    console.warn("[directSync] Network error during direct sync, will queue:", err);
    return false;
  }
}

/**
 * Optimistic sync: if online, send the item directly; if offline (or the
 * direct call fails), enqueue it in db.syncQueue for the next flush.
 *
 * @returns true when the item reached the server directly, false when queued.
 */
export async function sendOrQueue(item: SyncQueueItem): Promise<boolean> {
  if (isOnline() && (await executeDirectSync(item))) {
    return true;
  }
  await db.syncQueue.add(item);
  return false;
}
