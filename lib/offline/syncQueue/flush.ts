import { db } from "../db";
import { buildAuthHeaders, getStoredAccessToken, isOnline, refreshAccessToken } from "./auth";
import { reconcileTagMap } from "./directSync";
import { deduplicateLocalTags } from "./tags";

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
  if (!isOnline()) {
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

export async function clearAllLocalExpenses(): Promise<void> {
  await db.expenses.clear();
  await db.savings.clear();
  await db.syncQueue.where("entity").anyOf("expense", "saving").delete();
}
