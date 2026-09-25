import { db } from "../../db";
import { getStoredAccessToken, isOnline } from "../auth";
import { deduplicateDeleteLogs, mapServerDeleteLog, ServerDeleteLog } from "../deleteLogs";
import { deduplicateLocalTags } from "../tags";
import { PullSession } from "./session";
import { pullTrips } from "./trips";
import { pullTags } from "./tags";
import { pullExpenses } from "./expenses";
import { pullSavings } from "./savings";

/** Pull the Recycle Bin, stored under canonical `del_${entityId}` ids. Non-critical. */
async function pullDeleteLogs(session: PullSession): Promise<void> {
  try {
    const res = await session.get("/api/delete-logs");
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data.deleteLogs)) return;

    for (const sLog of data.deleteLogs as ServerDeleteLog[]) {
      await db.deleteLogs.put(mapServerDeleteLog(sLog));
    }
    await deduplicateDeleteLogs();
  } catch {
    // Non-critical offline fallback
  }
}

/**
 * Pull the latest data from the server and reconcile with local Dexie store.
 * Order matters: trips → tags → expenses → savings → delete logs.
 *
 * @param accessToken - Optional JWT access token (see flushSyncQueue docs).
 */
export async function pullFromServer(
  accessToken?: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!isOnline()) {
    return { success: false, error: "Offline" };
  }

  // Resolve access token: prefer explicit param, fall back to sessionStorage
  const session = new PullSession(accessToken ?? getStoredAccessToken());

  try {
    await deduplicateLocalTags();

    await pullTrips(session);
    await pullTags(session);
    await pullExpenses(session);
    await pullSavings(session);
    await pullDeleteLogs(session);

    await deduplicateLocalTags();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Pull error";
    return { success: false, error: message };
  }
}
