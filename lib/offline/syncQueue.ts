"use client";

import { db, LocalExpense, LocalTag, LocalSaving, SyncQueueItem } from "./db";

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

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

export async function queueExpenseCreation(expense: LocalExpense) {
  await db.expenses.put(expense);
  await db.syncQueue.add({
    clientId: expense.clientId,
    action: "create",
    entity: "expense",
    payload: { ...expense },
    createdAt: Date.now(),
  });
}

export async function queueExpenseUpdate(expense: LocalExpense) {
  const updated = { ...expense, syncStatus: "pending" as const, updatedAt: new Date().toISOString() };
  await db.expenses.put(updated);
  await db.syncQueue.add({
    clientId: expense.clientId,
    action: "update",
    entity: "expense",
    payload: { ...updated },
    createdAt: Date.now(),
  });
}

export async function queueExpenseDeletion(clientId: string) {
  await db.expenses.delete(clientId);
  await db.syncQueue.add({
    clientId,
    action: "delete",
    entity: "expense",
    payload: { clientId },
    createdAt: Date.now(),
  });
}

export async function queueSavingCreation(saving: LocalSaving) {
  await db.savings.put(saving);
  await db.syncQueue.add({
    clientId: saving.clientId,
    action: "create",
    entity: "saving",
    payload: { ...saving },
    createdAt: Date.now(),
  });
}

export async function queueSavingUpdate(saving: LocalSaving) {
  const updated = { ...saving, syncStatus: "pending" as const, updatedAt: new Date().toISOString() };
  await db.savings.put(updated);
  await db.syncQueue.add({
    clientId: saving.clientId,
    action: "update",
    entity: "saving",
    payload: { ...updated },
    createdAt: Date.now(),
  });
}

export async function queueSavingDeletion(clientId: string) {
  await db.savings.delete(clientId);
  await db.syncQueue.add({
    clientId,
    action: "delete",
    entity: "saving",
    payload: { clientId },
    createdAt: Date.now(),
  });
}

export async function queueTagCreation(tag: LocalTag) {
  await db.tags.put(tag);
  await db.syncQueue.add({
    clientId: tag._id,
    action: "create",
    entity: "tag",
    payload: { ...tag },
    createdAt: Date.now(),
  });
}

export async function queueTagDeletion(tagId: string) {
  // Read the tag BEFORE deleting it locally so we can include its name in the
  // sync payload. The server's delete handler uses payload.name for a safe
  // name-based lookup — payload.tagId alone is not enough because local IDs
  // are not valid MongoDB ObjectIds and cannot be used as _id on the server.
  const tag = await db.tags.get(tagId);
  const tagName = tag?.name ?? "";

  await db.tags.delete(tagId);
  // Also remove tagId from local expenses that reference it
  const expenses = await db.expenses.toArray();
  for (const exp of expenses) {
    if (exp.tagIds && exp.tagIds.includes(tagId)) {
      exp.tagIds = exp.tagIds.filter((id) => id !== tagId);
      await db.expenses.put(exp);
    }
  }
  await db.syncQueue.add({
    clientId: tagId,
    action: "delete",
    entity: "tag",
    // Include name so the server can resolve the tag even when clientId is
    // a local-style ID (not a MongoDB ObjectId).
    payload: { tagId, name: tagName },
    createdAt: Date.now(),
  });
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
  const token = accessToken ?? getStoredAccessToken();

  isFlushing = true;
  try {
    const queueItems = await db.syncQueue.toArray();
    if (queueItems.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    const res = await fetch("/api/expenses/sync", {
      method: "POST",
      headers: buildAuthHeaders(token),
      body: JSON.stringify({ items: queueItems }),
    });

    if (res.status === 503) {
      // DB temporarily unavailable — keep items in queue, retry later
      return { success: false, syncedCount: 0, error: "Server DB unavailable" };
    }

    if (res.status === 401) {
      // Not authenticated — token may have expired; caller should refresh first
      return { success: false, syncedCount: 0, error: "Unauthorized — token expired" };
    }

    if (!res.ok) {
      return { success: false, syncedCount: 0, error: `Server response: ${res.status}` };
    }

    const data = await res.json();

    // Build a set of clientIds that the server explicitly reported as failed.
    // These items stay in the Dexie queue for a future retry rather than
    // being silently dropped as if they had succeeded.
    const failedClientIds = new Set<string>(
      Array.isArray(data.failedItems)
        ? data.failedItems.map((f: { clientId: string }) => f.clientId)
        : []
    );

    // Mark successfully processed items as synced and remove them from the queue.
    // Items in failedClientIds are intentionally left untouched.
    let syncedCount = 0;
    for (const item of queueItems) {
      if (failedClientIds.has(item.clientId)) {
        // Server returned this item as failed — leave it in the queue
        // so it will be retried on the next sync trigger.
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
  const token = accessToken ?? getStoredAccessToken();
  const headers = buildAuthHeaders(token);

  try {
    // 1. Pull tags
    const tagsRes = await fetch("/api/tags", { headers });
    if (tagsRes.ok) {
      const tagsData = await tagsRes.json();
      if (Array.isArray(tagsData.tags) && tagsData.tags.length > 0) {
        const localTags: LocalTag[] = tagsData.tags.map((t: Record<string, unknown>) => ({
          _id: (t._id as { toString(): string })?.toString() ?? String(t._id),
          userId: (t.userId as string) || "local_user",
          name: t.name as string,
          colorKey: (t.colorKey as string) || "#22C55E",
        }));
        await db.tags.bulkPut(localTags);
      }
    }

    // 2. Pull expenses
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
          serverClientIds.add(clientId);

          if (!pendingClientIds.has(clientId)) {
            const localExp: LocalExpense = {
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

    // 3. Pull savings
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
          serverSavIds.add(clientId);

          if (!pendingClientIds.has(clientId)) {
            const localSav: LocalSaving = {
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
