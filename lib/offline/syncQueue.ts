import { db, cleanUpLegacyDefaultTags, ensureLocalGeneralTrip, LocalExpense, LocalTag, LocalSaving, LocalTrip, SyncQueueItem, LocalDeleteLog } from "./db";
import { GENERAL_TRIP_ID } from "@/lib/trips";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build fetch headers for authenticated API calls.
 *
 * Priority: Authorization header (Bearer token) > cookies (automatic).
 * Sending the Bearer token explicitly makes sync work in browsers that strip
 * or block cookies (Safari ITP, Arc incognito, cross-origin contexts).
 */
function buildAuthHeaders(accessToken?: string | null): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  return headers;
}

/**
 * Retrieve the stored access token from sessionStorage (persisted there by
 * AuthContext so it survives page reloads within the same tab).
 */
function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("budget_access_token");
  } catch {
    return null;
  }
}

/**
 * Attempt to refresh the access token silently if an API call returns 401.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) {
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("budget_access_token", data.accessToken);
          } catch {}
        }
        return data.accessToken;
      }
    }
  } catch (err) {
    console.error("[auth] Failed to refresh token:", err);
  }
  return null;
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

    // Re-point all expenses using localId to serverId
    const allExpenses = await db.expenses.toArray();
    for (const exp of allExpenses) {
      if (Array.isArray(exp.tagIds) && exp.tagIds.includes(localId)) {
        exp.tagIds = exp.tagIds.map((id) => (id === localId ? serverId : id));
        await db.expenses.put(exp);
      }
    }

    // Re-point any remaining pending items in syncQueue
    const queuePending = await db.syncQueue.toArray();
    for (const q of queuePending) {
      if (q.entity === "expense" && Array.isArray(q.payload?.tagIds)) {
        const pIds = q.payload.tagIds as string[];
        if (pIds.includes(localId)) {
          q.payload.tagIds = pIds.map((id) => (id === localId ? serverId : id));
          await db.syncQueue.put(q);
        }
      }
    }
  }
}

/**
 * Direct sync execution when the client is online.
 * Directly sends the item to the server and returns true on success.
 * Only if this returns false will the caller queue the item in db.syncQueue.
 */
export async function executeDirectSync(item: SyncQueueItem): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.onLine) {
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

// ---------------------------------------------------------------------------
// Optimistic Sync & Queue helpers:
// If online, perform direct API call immediately.
// If offline (or if network call fails), enqueue into db.syncQueue.
// ---------------------------------------------------------------------------

export async function queueExpenseCreation(expense: LocalExpense) {
  const isOnline = typeof window !== "undefined" && navigator.onLine;
  const initialStatus = isOnline ? ("syncing" as const) : ("pending" as const);
  const localExp: LocalExpense = { ...expense, syncStatus: initialStatus };
  await db.expenses.put(localExp);

  const item: SyncQueueItem = {
    clientId: expense.clientId,
    action: "create",
    entity: "expense",
    payload: { ...localExp },
    createdAt: Date.now(),
  };

  if (!isOnline) {
    await db.syncQueue.add(item);
    return;
  }

  const ok = await executeDirectSync(item);
  if (!ok) {
    await db.syncQueue.add(item);
    await db.expenses.update(expense.clientId, { syncStatus: "pending" });
  }
}

export async function queueExpenseUpdate(expense: LocalExpense) {
  const isOnline = typeof window !== "undefined" && navigator.onLine;
  const initialStatus = isOnline ? ("syncing" as const) : ("pending" as const);
  const updated: LocalExpense = { ...expense, syncStatus: initialStatus, updatedAt: new Date().toISOString() };
  await db.expenses.put(updated);

  const item: SyncQueueItem = {
    clientId: expense.clientId,
    action: "update",
    entity: "expense",
    payload: { ...updated },
    createdAt: Date.now(),
  };

  if (!isOnline) {
    await db.syncQueue.add(item);
    return;
  }

  const ok = await executeDirectSync(item);
  if (!ok) {
    await db.syncQueue.add(item);
    await db.expenses.update(expense.clientId, { syncStatus: "pending" });
  }
}

export async function queueExpenseDeletion(clientId: string) {
  // 1. Capture snapshot for DeleteLog (Recycle Bin) before deletion
  const exp = await db.expenses.get(clientId);
  if (exp) {
    const logId = `del_exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const deleteLogItem: LocalDeleteLog = {
      id: logId,
      userId: exp.userId,
      entityType: "expense",
      entityId: clientId,
      title: exp.note?.trim() || "Expense",
      details: exp.date ? exp.date.split("T")[0] : "Recent",
      data: { ...exp },
      deletedAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    await db.deleteLogs.put(deleteLogItem);
  }

  await db.expenses.delete(clientId);

  const item: SyncQueueItem = {
    clientId,
    action: "delete",
    entity: "expense",
    payload: { clientId, ...(exp ? { deleteSnapshot: { ...exp } } : {}) },
    createdAt: Date.now(),
  };

  const isOnline = typeof window !== "undefined" && navigator.onLine;
  if (!isOnline) {
    await db.syncQueue.add(item);
    return;
  }

  const ok = await executeDirectSync(item);
  if (!ok) {
    await db.syncQueue.add(item);
  }
}

export async function queueSavingCreation(saving: LocalSaving) {
  const isOnline = typeof window !== "undefined" && navigator.onLine;
  const initialStatus = isOnline ? ("syncing" as const) : ("pending" as const);
  const localSaving: LocalSaving = { ...saving, syncStatus: initialStatus };
  await db.savings.put(localSaving);

  const item: SyncQueueItem = {
    clientId: saving.clientId,
    action: "create",
    entity: "saving",
    payload: { ...localSaving },
    createdAt: Date.now(),
  };

  if (!isOnline) {
    await db.syncQueue.add(item);
    return;
  }

  const ok = await executeDirectSync(item);
  if (!ok) {
    await db.syncQueue.add(item);
    await db.savings.update(saving.clientId, { syncStatus: "pending" });
  }
}

export async function queueSavingUpdate(saving: LocalSaving) {
  const isOnline = typeof window !== "undefined" && navigator.onLine;
  const initialStatus = isOnline ? ("syncing" as const) : ("pending" as const);
  const updated: LocalSaving = { ...saving, syncStatus: initialStatus, updatedAt: new Date().toISOString() };
  await db.savings.put(updated);

  const item: SyncQueueItem = {
    clientId: saving.clientId,
    action: "update",
    entity: "saving",
    payload: { ...updated },
    createdAt: Date.now(),
  };

  if (!isOnline) {
    await db.syncQueue.add(item);
    return;
  }

  const ok = await executeDirectSync(item);
  if (!ok) {
    await db.syncQueue.add(item);
    await db.savings.update(saving.clientId, { syncStatus: "pending" });
  }
}

export async function queueSavingDeletion(clientId: string) {
  const saving = await db.savings.get(clientId);
  if (saving) {
    const logId = `del_sav_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const deleteLogItem: LocalDeleteLog = {
      id: logId,
      userId: saving.userId,
      entityType: "saving",
      entityId: clientId,
      title: saving.note?.trim() || (saving.type === "deposit" ? "Savings Deposit" : "Savings Withdrawal"),
      details: saving.date ? saving.date.split("T")[0] : "Recent",
      data: { ...saving },
      deletedAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    await db.deleteLogs.put(deleteLogItem);
  }

  await db.savings.delete(clientId);

  const item: SyncQueueItem = {
    clientId,
    action: "delete",
    entity: "saving",
    payload: { clientId, ...(saving ? { deleteSnapshot: { ...saving } } : {}) },
    createdAt: Date.now(),
  };

  const isOnline = typeof window !== "undefined" && navigator.onLine;
  if (!isOnline) {
    await db.syncQueue.add(item);
    return;
  }

  const ok = await executeDirectSync(item);
  if (!ok) {
    await db.syncQueue.add(item);
  }
}

export async function queueTagCreation(tag: LocalTag) {
  await db.tags.put(tag);

  const item: SyncQueueItem = {
    clientId: tag._id,
    action: "create",
    entity: "tag",
    payload: { ...tag },
    createdAt: Date.now(),
  };

  const isOnline = typeof window !== "undefined" && navigator.onLine;
  if (!isOnline) {
    await db.syncQueue.add(item);
    return;
  }

  const ok = await executeDirectSync(item);
  if (!ok) {
    await db.syncQueue.add(item);
  }
}

export async function queueTagUpdate(tag: LocalTag) {
  await db.tags.put(tag);

  const item: SyncQueueItem = {
    clientId: tag._id,
    action: "update",
    entity: "tag",
    payload: { id: tag._id, ...tag },
    createdAt: Date.now(),
  };

  const isOnline = typeof window !== "undefined" && navigator.onLine;
  if (!isOnline) {
    await db.syncQueue.add(item);
    return;
  }

  const ok = await executeDirectSync(item);
  if (!ok) {
    await db.syncQueue.add(item);
  }
}

export async function queueTagDeletion(tagId: string) {
  const tag = await db.tags.get(tagId);
  const tagName = tag?.name ?? "";

  const allExpenses = await db.expenses.toArray();
  const affectedExpenseClientIds = allExpenses
    .filter((exp) => Array.isArray(exp.tagIds) && exp.tagIds.includes(tagId))
    .map((exp) => exp.clientId);

  if (tag) {
    const logId = `del_tag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const deleteLogItem: LocalDeleteLog = {
      id: logId,
      userId: tag.userId,
      entityType: "tag",
      entityId: tagId,
      title: tag.name,
      details: `Category • ${tag.colorKey}`,
      data: { ...tag, affectedExpenseClientIds },
      deletedAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    await db.deleteLogs.put(deleteLogItem);
  }

  await db.tags.delete(tagId);
  for (const exp of allExpenses) {
    if (exp.tagIds && exp.tagIds.includes(tagId)) {
      exp.tagIds = exp.tagIds.filter((id) => id !== tagId);
      await db.expenses.put(exp);
    }
  }

  const item: SyncQueueItem = {
    clientId: tagId,
    action: "delete",
    entity: "tag",
    payload: {
      tagId,
      name: tagName,
      tripId: tag?.tripId || GENERAL_TRIP_ID,
      ...(tag ? { deleteSnapshot: { ...tag, affectedExpenseIds: affectedExpenseClientIds } } : {}),
    },
    createdAt: Date.now(),
  };

  const isOnline = typeof window !== "undefined" && navigator.onLine;
  if (!isOnline) {
    await db.syncQueue.add(item);
    return;
  }

  const ok = await executeDirectSync(item);
  if (!ok) {
    await db.syncQueue.add(item);
  }
}

// ---------------------------------------------------------------------------
// Trip queue helpers
// ---------------------------------------------------------------------------

export async function queueTripCreation(
  trip: LocalTrip,
  opts?: { copyTagsFromTripId?: string }
): Promise<void> {
  await db.trips.put(trip);

  const item: SyncQueueItem = {
    clientId: trip.tripId,
    action: "create",
    entity: "trip",
    payload: { ...trip },
    createdAt: Date.now(),
  };

  const isOnline = typeof window !== "undefined" && navigator.onLine;
  if (!isOnline) {
    await db.syncQueue.add(item);
  } else {
    const ok = await executeDirectSync(item);
    if (!ok) {
      await db.syncQueue.add(item);
    }
  }

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

  const item: SyncQueueItem = {
    clientId: trip.tripId,
    action: "update",
    entity: "trip",
    payload: { ...trip },
    createdAt: Date.now(),
  };

  const isOnline = typeof window !== "undefined" && navigator.onLine;
  if (!isOnline) {
    await db.syncQueue.add(item);
    return;
  }

  const ok = await executeDirectSync(item);
  if (!ok) {
    await db.syncQueue.add(item);
  }
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

  const logId = `del_trip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const deleteLogItem: LocalDeleteLog = {
    id: logId,
    userId: trip.userId,
    entityType: "trip",
    entityId: tripId,
    title: trip.name,
    details: `Trip • ${tripExpenses.length} expenses • ${tripTags.length} categories`,
    data: { trip, tags: tripTags, expenses: tripExpenses },
    deletedAt: new Date().toISOString(),
    syncStatus: "pending",
  };
  await db.deleteLogs.put(deleteLogItem);

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
    const item: SyncQueueItem = {
      clientId: tripId,
      action: "delete",
      entity: "trip",
      payload: { tripId },
      createdAt: Date.now(),
    };

    const isOnline = typeof window !== "undefined" && navigator.onLine;
    if (!isOnline) {
      await db.syncQueue.add(item);
    } else {
      const ok = await executeDirectSync(item);
      if (!ok) {
        await db.syncQueue.add(item);
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Recovery & Delete Logs Helpers
// ---------------------------------------------------------------------------

export async function recoverDeletedItem(logId: string): Promise<{ success: boolean; entityType?: string; error?: string }> {
  try {
    const log = (await db.deleteLogs.get(logId)) || (await db.deleteLogs.where("entityId").equals(logId).first());
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
        return { success: true };
      }
      return { success: false, error: "Record not found in recycle bin" };
    }

    const { entityType, data, entityId } = log;

    const resolveTripId = async (tripId?: string | null): Promise<string> => {
      const id = tripId || GENERAL_TRIP_ID;
      if (id === GENERAL_TRIP_ID) return GENERAL_TRIP_ID;
      const existingTrip = await db.trips.get(id);
      return existingTrip ? id : GENERAL_TRIP_ID;
    };

    if (entityType === "expense") {
      const exp = data as unknown as LocalExpense;
      const restoredExp: LocalExpense = {
        ...exp,
        clientId: exp.clientId || entityId,
        tripId: await resolveTripId(exp.tripId),
        syncStatus: "pending",
        updatedAt: new Date().toISOString(),
      };
      await queueExpenseCreation(restoredExp);
    } else if (entityType === "saving") {
      const sav = data as unknown as LocalSaving;
      const restoredSav: LocalSaving = {
        ...sav,
        clientId: sav.clientId || entityId,
        syncStatus: "pending",
        updatedAt: new Date().toISOString(),
      };
      await queueSavingCreation(restoredSav);
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
      const trip = snapshot.trip;
      const restoredTrip: LocalTrip = {
        ...trip,
        tripId: trip.tripId || entityId,
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

    // Remove from Dexie deleteLogs
    await db.deleteLogs.delete(log.id);

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

    return { success: true, entityType };
  } catch (err: unknown) {
    console.error("[recoverDeletedItem] Error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Recovery failed" };
  }
}

export async function permanentDeleteLog(logId: string): Promise<boolean> {
  try {
    const log = (await db.deleteLogs.get(logId)) || (await db.deleteLogs.where("entityId").equals(logId).first());
    const targetId = log?._id || log?.entityId || logId;
    if (log) {
      await db.deleteLogs.delete(log.id);
    }

    const token = getStoredAccessToken();
    await fetch(`/api/delete-logs?id=${encodeURIComponent(targetId)}`, {
      method: "DELETE",
      headers: buildAuthHeaders(token),
    });
    return true;
  } catch (err) {
    console.error("[permanentDeleteLog] Error:", err);
    return false;
  }
}

export async function clearAllDeleteLogs(): Promise<boolean> {
  try {
    await db.deleteLogs.clear();
    const token = getStoredAccessToken();
    await fetch("/api/delete-logs?all=true", {
      method: "DELETE",
      headers: buildAuthHeaders(token),
    });
    return true;
  } catch (err) {
    console.error("[clearAllDeleteLogs] Error:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Deduplication helper
// ---------------------------------------------------------------------------

/**
 * Scan Dexie's local tags table and deduplicate any tags that share the same
 * name (case-insensitive). Keeps the server-synced tag (valid 24-char ObjectId)
 * or the first created tag, updates all local expenses and pending sync queue
 * items to reference the canonical ID, and removes duplicate tag records.
 */
export async function deduplicateLocalTags(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await cleanUpLegacyDefaultTags();
    const allTags = await db.tags.toArray();
    if (allTags.length <= 1) return;

    // Group by trip + trimmed, lowercase name
    const byName = new Map<string, LocalTag[]>();
    for (const tag of allTags) {
      const name = (tag.name || "").trim().toLowerCase();
      if (!name) continue;
      const key = `${tag.tripId || GENERAL_TRIP_ID}|${name}`;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(tag);
    }

    for (const [, tagList] of byName) {
      if (tagList.length <= 1) continue;

      // Prefer a real MongoDB ObjectId (24 hex characters), otherwise pick the first
      let canonical = tagList.find((t) => /^[a-f\d]{24}$/i.test(t._id));
      if (!canonical) canonical = tagList[0];

      const duplicateIds = new Set(
        tagList.filter((t) => t._id !== canonical!._id).map((t) => t._id)
      );

      if (duplicateIds.size === 0) continue;

      // Re-point all expenses in Dexie to canonical._id
      const allExpenses = await db.expenses.toArray();
      for (const exp of allExpenses) {
        if (Array.isArray(exp.tagIds) && exp.tagIds.some((id) => duplicateIds.has(id))) {
          exp.tagIds = Array.from(
            new Set(exp.tagIds.map((id) => (duplicateIds.has(id) ? canonical!._id : id)))
          );
          await db.expenses.put(exp);
        }
      }

      // Re-point pending items in syncQueue
      const queueItems = await db.syncQueue.toArray();
      for (const q of queueItems) {
        if (q.entity === "expense" && Array.isArray(q.payload?.tagIds)) {
          const pIds = q.payload.tagIds as string[];
          if (pIds.some((id) => duplicateIds.has(id))) {
            q.payload.tagIds = Array.from(
              new Set(pIds.map((id) => (duplicateIds.has(id) ? canonical!._id : id)))
            );
            await db.syncQueue.put(q);
          }
        }
      }

      // Remove the duplicate tag records from Dexie
      for (const dupId of duplicateIds) {
        await db.tags.delete(dupId);
      }
    }
  } catch (err) {
    console.error("[syncQueue] Error in deduplicateLocalTags:", err);
  }
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

let isFlushing = false;

/**
 * Push all pending sync queue items to the server.
 *
 * @param accessToken - Optional JWT access token. When provided it is sent as
 *   `Authorization: Bearer <token>` so sync works even when cookies are
 *   unavailable (Safari ITP, Arc incognito, cross-origin setups).
 */
export async function flushSyncQueue(
  accessToken?: string | null
): Promise<{ success: boolean; syncedCount: number; failedCount?: number; failedItems?: unknown[]; error?: string }> {
  if (isFlushing) {
    return { success: true, syncedCount: 0 };
  }
  if (typeof window === "undefined" || !navigator.onLine) {
    return { success: false, syncedCount: 0, error: "Offline" };
  }

  // Resolve access token: prefer explicit param, fall back to sessionStorage
  let token = accessToken ?? getStoredAccessToken();

  isFlushing = true;
  try {
    await deduplicateLocalTags();

    const queueItems = await db.syncQueue.toArray();
    if (queueItems.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    let res = await fetch("/api/expenses/sync", {
      method: "POST",
      headers: buildAuthHeaders(token),
      body: JSON.stringify({ items: queueItems }),
    });

    if (res.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        token = refreshedToken;
        res = await fetch("/api/expenses/sync", {
          method: "POST",
          headers: buildAuthHeaders(token),
          body: JSON.stringify({ items: queueItems }),
        });
      }
    }

    if (res.status === 503) {
      // DB temporarily unavailable — keep items in queue, retry later
      return { success: false, syncedCount: 0, error: "Server DB unavailable" };
    }

    if (res.status === 401) {
      // Not authenticated — token may have expired and refresh failed
      return { success: false, syncedCount: 0, error: "Unauthorized — token expired" };
    }

    if (!res.ok) {
      return { success: false, syncedCount: 0, error: `Server response: ${res.status}` };
    }

    const data = await res.json();

    // Reconcile server-resolved tag IDs into Dexie immediately
    if (data.tagMap && typeof data.tagMap === "object") {
      await reconcileTagMap(data.tagMap as Record<string, string>);
    }

    // Build a set of clientIds that the server explicitly reported as failed.
    const failedClientIds = new Set<string>(
      Array.isArray(data.failedItems)
        ? data.failedItems.map((f: { clientId: string }) => f.clientId)
        : []
    );

    let syncedCount = 0;
    for (const item of queueItems) {
      if (failedClientIds.has(item.clientId)) {
        continue;
      }

      if (item.entity === "expense" && item.action !== "delete") {
        const exp = await db.expenses.get(item.clientId);
        if (exp) {
          await db.expenses.update(item.clientId, { syncStatus: "synced" });
        }
      }
      if (item.entity === "saving" && item.action !== "delete") {
        const saving = await db.savings.get(item.clientId);
        if (saving) {
          await db.savings.update(item.clientId, { syncStatus: "synced" });
        }
      }
      if (item.id !== undefined) {
        await db.syncQueue.delete(item.id);
      }
      syncedCount++;
    }

    return {
      success: true,
      syncedCount,
      failedCount: failedClientIds.size,
      ...(data.failedItems ? { failedItems: data.failedItems } : {}),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync error";
    return { success: false, syncedCount: 0, error: message };
  } finally {
    isFlushing = false;
  }
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

/**
 * Pull the latest data from the server and reconcile with local Dexie store.
 *
 * @param accessToken - Optional JWT access token (see flushSyncQueue docs).
 */
export async function pullFromServer(
  accessToken?: string | null
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { success: false, error: "Offline" };
  }

  // Resolve access token: prefer explicit param, fall back to sessionStorage
  let currentToken = accessToken ?? getStoredAccessToken();
  let headers = buildAuthHeaders(currentToken);

  try {
    await deduplicateLocalTags();

    // 0. Pull trips first, so tags/expenses can be reconciled against known trip ids
    let tripsRes = await fetch("/api/trips", { headers });
    if (tripsRes.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        currentToken = refreshedToken;
        headers = buildAuthHeaders(currentToken);
        tripsRes = await fetch("/api/trips", { headers });
      }
    }
    let localUserId: string | undefined;
    if (tripsRes.ok) {
      const tripsData = await tripsRes.json();
      if (Array.isArray(tripsData.trips)) {
        const serverTrips = tripsData.trips as Record<string, unknown>[];
        const localTrips: LocalTrip[] = serverTrips.map((t) => {
          const userId = (t.userId as string) || "local_user";
          localUserId = userId;
          return {
            tripId: t.tripId as string,
            _id: (t._id as { toString(): string })?.toString() ?? (t._id ? String(t._id) : undefined),
            userId,
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
        });
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

    // 1. Pull tags with reconciliation
    let tagsRes = await fetch("/api/tags", { headers });
    if (tagsRes.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        currentToken = refreshedToken;
        headers = buildAuthHeaders(currentToken);
        tagsRes = await fetch("/api/tags", { headers });
      }
    }
    if (tagsRes.ok) {
      const tagsData = await tagsRes.json();
      if (Array.isArray(tagsData.tags)) {
        const existingLocalTags = await db.tags.toArray();
        const serverTags = tagsData.tags;

        for (const sTag of serverTags) {
          const sId = (sTag._id as { toString(): string })?.toString() ?? String(sTag._id);
          const sName = (sTag.name as string || "").trim().toLowerCase();
          const sClientId = sTag.clientId as string | undefined;
          const sTripId = (sTag.tripId as string) || GENERAL_TRIP_ID;

          // Check if an existing local tag has a different _id but matches by name+trip or clientId
          const matchingLocal = existingLocalTags.find(
            (lt) => lt._id !== sId && (
              (lt.name && lt.name.trim().toLowerCase() === sName && (lt.tripId || GENERAL_TRIP_ID) === sTripId) ||
              (sClientId && lt._id === sClientId)
            )
          );

          if (matchingLocal) {
            const oldId = matchingLocal._id;
            // Update local expenses referencing oldId to sId
            const allExpenses = await db.expenses.toArray();
            for (const exp of allExpenses) {
              if (Array.isArray(exp.tagIds) && exp.tagIds.includes(oldId)) {
                exp.tagIds = exp.tagIds.map((id) => (id === oldId ? sId : id));
                await db.expenses.put(exp);
              }
            }
            // Update syncQueue
            const queueItems = await db.syncQueue.toArray();
            for (const q of queueItems) {
              if (q.entity === "expense" && Array.isArray(q.payload?.tagIds)) {
                const pIds = q.payload.tagIds as string[];
                if (pIds.includes(oldId)) {
                  q.payload.tagIds = pIds.map((id) => (id === oldId ? sId : id));
                  await db.syncQueue.put(q);
                }
              }
            }
            // Delete old duplicate local tag
            await db.tags.delete(oldId);
          }
        }

        const localTags: LocalTag[] = serverTags.map((t: Record<string, unknown>) => ({
          _id: (t._id as { toString(): string })?.toString() ?? String(t._id),
          userId: (t.userId as string) || "local_user",
          name: t.name as string,
          colorKey: (t.colorKey as string) || "#22C55E",
          tripId: (t.tripId as string) || GENERAL_TRIP_ID,
        }));
        await db.tags.bulkPut(localTags);

        // Remove local tags that no longer exist on server and aren't pending creation
        const pendingTagItems = await db.syncQueue.where("entity").equals("tag").toArray();
        const pendingTagIds = new Set(pendingTagItems.map((p) => p.clientId));
        const serverTagIdSet = new Set(
          serverTags.map((t: Record<string, unknown>) =>
            (t._id as { toString(): string })?.toString() ?? String(t._id)
          )
        );
        const currentLocalTags = await db.tags.toArray();
        for (const lt of currentLocalTags) {
          if (!serverTagIdSet.has(lt._id) && !pendingTagIds.has(lt._id)) {
            await db.tags.delete(lt._id);
          }
        }
      }
    }

    // 2. Pull expenses with deduplication and ObjectId preservation
    const expRes = await fetch("/api/expenses", { headers });
    if (expRes.ok) {
      const expData = await expRes.json();
      if (Array.isArray(expData.expenses)) {
        const pendingItems = await db.syncQueue.toArray();
        const pendingClientIds = new Set(pendingItems.map((p) => p.clientId));
        const serverClientIds = new Set<string>();

        for (const sExp of expData.expenses) {
          const clientId =
            sExp.clientId || (sExp._id as { toString(): string })?.toString();
          const serverId =
            (sExp._id as { toString(): string })?.toString() ?? String(sExp._id);
          serverClientIds.add(clientId);

          if (!pendingClientIds.has(clientId)) {
            // Deduplicate if an existing record in Dexie has matching _id under a different clientId
            const existingByServerId = await db.expenses.where("_id").equals(serverId).first();
            if (existingByServerId && existingByServerId.clientId !== clientId) {
              await db.expenses.delete(existingByServerId.clientId);
            }

            const localExp: LocalExpense = {
              _id: serverId,
              clientId,
              userId: sExp.userId,
              amount: Number(sExp.amount) || 0,
              note: sExp.note || "",
              tagIds: Array.isArray(sExp.tagIds)
                ? sExp.tagIds.map((t: unknown) =>
                    typeof t === "object" && t !== null
                      ? (t as { _id: { toString(): string } })._id?.toString()
                      : String(t)
                  )
                : [],
              date:
                typeof sExp.date === "string"
                  ? sExp.date.split("T")[0]
                  : new Date(sExp.date).toISOString().split("T")[0],
              createdAt: sExp.createdAt
                ? new Date(sExp.createdAt).toISOString()
                : new Date().toISOString(),
              updatedAt: sExp.updatedAt
                ? new Date(sExp.updatedAt).toISOString()
                : new Date().toISOString(),
              syncStatus: "synced",
              tripId: (sExp.tripId as string) || GENERAL_TRIP_ID,
            };
            await db.expenses.put(localExp);
          }
        }

        // Clean up local expenses that no longer exist on server and are not pending
        const localExpenses = await db.expenses.toArray();
        for (const localExp of localExpenses) {
          if (
            !pendingClientIds.has(localExp.clientId) &&
            !serverClientIds.has(localExp.clientId)
          ) {
            await db.expenses.delete(localExp.clientId);
          }
        }
      }
    }

    // 3. Pull savings with deduplication
    const savRes = await fetch("/api/savings", { headers });
    if (savRes.ok) {
      const savData = await savRes.json();
      if (Array.isArray(savData.savings)) {
        const pendingItems = await db.syncQueue.toArray();
        const pendingClientIds = new Set(pendingItems.map((p) => p.clientId));
        const serverSavIds = new Set<string>();

        for (const sSav of savData.savings) {
          const clientId =
            sSav.clientId || (sSav._id as { toString(): string })?.toString();
          const serverId =
            (sSav._id as { toString(): string })?.toString() ?? String(sSav._id);
          serverSavIds.add(clientId);

          if (!pendingClientIds.has(clientId)) {
            // Deduplicate if an existing record in Dexie has matching _id under a different clientId
            const existingByServerId = await db.savings.where("_id").equals(serverId).first();
            if (existingByServerId && existingByServerId.clientId !== clientId) {
              await db.savings.delete(existingByServerId.clientId);
            }

            const localSav: LocalSaving = {
              _id: serverId,
              clientId,
              userId: sSav.userId,
              amount: Number(sSav.amount) || 0,
              type: sSav.type || "deposit",
              note: sSav.note || "",
              date:
                typeof sSav.date === "string"
                  ? sSav.date.split("T")[0]
                  : new Date(sSav.date).toISOString().split("T")[0],
              createdAt: sSav.createdAt
                ? new Date(sSav.createdAt).toISOString()
                : new Date().toISOString(),
              updatedAt: sSav.updatedAt
                ? new Date(sSav.updatedAt).toISOString()
                : new Date().toISOString(),
              syncStatus: "synced",
              linkedExpenseId: sSav.linkedExpenseId || undefined,
            };
            await db.savings.put(localSav);
          }
        }

        const localSavings = await db.savings.toArray();
        for (const localSav of localSavings) {
          if (
            !pendingClientIds.has(localSav.clientId) &&
            !serverSavIds.has(localSav.clientId)
          ) {
            await db.savings.delete(localSav.clientId);
          }
        }
      }
    }

    // 4. Pull delete logs from server
    try {
      const delLogsRes = await fetch("/api/delete-logs", { headers });
      if (delLogsRes.ok) {
        const delData = await delLogsRes.json();
        if (Array.isArray(delData.deleteLogs)) {
          for (const sLog of delData.deleteLogs) {
            const logId = sLog._id || sLog.entityId || `del_${sLog.deletedAt}`;
            const localLog: LocalDeleteLog = {
              id: logId,
              _id: sLog._id,
              userId: sLog.userId,
              entityType: sLog.entityType,
              entityId: sLog.entityId,
              title: sLog.title,
              details: sLog.details || "",
              data: sLog.data || {},
              deletedAt: typeof sLog.deletedAt === "string" ? sLog.deletedAt : new Date(sLog.deletedAt).toISOString(),
              syncStatus: "synced",
            };
            await db.deleteLogs.put(localLog);
          }
        }
      }
    } catch {
      // Non-critical offline fallback
    }

    await deduplicateLocalTags();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Pull error";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

export async function clearAllLocalExpenses(): Promise<void> {
  await db.expenses.clear();
  await db.savings.clear();
  await db.syncQueue.where("entity").anyOf("expense", "saving").delete();
}
