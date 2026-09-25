import { db, LocalDeleteLog } from "../db";
import { buildAuthHeaders, getStoredAccessToken } from "./auth";

// ---------------------------------------------------------------------------
// Recycle Bin (deleteLogs) helpers
//
// Invariant: there is at most ONE local delete log per entity, stored under
// the canonical id `del_${entityId}`. Every write path (queue*Deletion, pull,
// recovery, permanent delete) must preserve this to avoid double-deleted rows.
// ---------------------------------------------------------------------------

export function canonicalDeleteLogId(entityId: string): string {
  return `del_${entityId}`;
}

/** Legacy ids looked like `del_exp_<ts>_<rand>`; strip the prefix when entityId is missing. */
function resolveEntityId(log: LocalDeleteLog): string {
  return log.entityId || log.id.replace(/^del_(exp_|sav_|tag_|trip_)?/, "");
}

/** True when `candidate` refers to the same recycle-bin entry as `log`. */
function isSameLog(candidate: LocalDeleteLog, log: LocalDeleteLog): boolean {
  return (
    candidate.id === log.id ||
    (!!log.entityId && candidate.entityId === log.entityId) ||
    (!!log._id && candidate._id === log._id)
  );
}

/** Find a local log by local id, entityId, or server _id. */
export async function findDeleteLog(
  logId: string
): Promise<{ log: LocalDeleteLog | undefined; allLogs: LocalDeleteLog[] }> {
  const allLogs = await db.deleteLogs.toArray();
  const log = allLogs.find((l) => l.id === logId || l.entityId === logId || l._id === logId);
  return { log, allLogs };
}

/** Remove every local copy of `log` (by id, entityId, or server _id). */
export async function removeAllCopiesOfLog(log: LocalDeleteLog, allLogs: LocalDeleteLog[]): Promise<void> {
  for (const l of allLogs) {
    if (isSameLog(l, log)) {
      await db.deleteLogs.delete(l.id);
    }
  }
}

/**
 * Write the recycle-bin entry for a just-deleted entity, first purging any
 * preexisting or duplicate delete logs for the same entityId.
 */
export async function writeDeleteLog(log: Omit<LocalDeleteLog, "id">): Promise<void> {
  const canonicalId = canonicalDeleteLogId(log.entityId);
  await db.deleteLogs.where("entityId").equals(log.entityId).delete();
  await db.deleteLogs.delete(canonicalId);
  await db.deleteLogs.put({ ...log, id: canonicalId });
}

/** Purge delete logs for an entity without writing a new one (entity was already gone locally). */
export async function purgeDeleteLogsFor(entityId: string): Promise<void> {
  await db.deleteLogs.where("entityId").equals(entityId).delete();
  await db.deleteLogs.delete(canonicalDeleteLogId(entityId));
}

/** Map a server DeleteLog document to its canonical local form. */
export interface ServerDeleteLog {
  _id: string;
  userId: string;
  entityType: LocalDeleteLog["entityType"];
  entityId?: string;
  title: string;
  details?: string;
  data?: Record<string, unknown>;
  deletedAt: string | Date;
}

export function mapServerDeleteLog(sLog: ServerDeleteLog): LocalDeleteLog {
  const entityId =
    sLog.entityId ||
    (sLog.data?.clientId as string) ||
    (sLog.data?._id as string) ||
    sLog._id;
  return {
    id: canonicalDeleteLogId(entityId),
    _id: sLog._id,
    userId: sLog.userId,
    entityType: sLog.entityType,
    entityId,
    title: sLog.title,
    details: sLog.details || "",
    data: sLog.data || {},
    deletedAt:
      typeof sLog.deletedAt === "string"
        ? sLog.deletedAt
        : new Date(sLog.deletedAt).toISOString(),
    syncStatus: "synced",
  };
}

/**
 * Deduplicate local deleteLogs in Dexie:
 * 1. Groups by entityType:entityId.
 * 2. If multiple records exist for the same entity, retains the best (synced / with _id / latest),
 *    migrates it to canonical id `del_${entityId}`, and deletes all duplicate entries.
 * 3. Removes delete logs for entities that are currently active in db.expenses, db.savings, db.tags, or db.trips.
 */
export async function deduplicateDeleteLogs(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const allLogs = await db.deleteLogs.toArray();
    if (!allLogs || allLogs.length === 0) return;

    // Build active entity sets to purge zombie logs of recovered items
    const [expenses, savings, tags, trips] = await Promise.all([
      db.expenses.toArray(),
      db.savings.toArray(),
      db.tags.toArray(),
      db.trips.toArray(),
    ]);

    const activeIds: Record<LocalDeleteLog["entityType"], Set<string>> = {
      expense: new Set(expenses.map((e) => e.clientId)),
      saving: new Set(savings.map((s) => s.clientId)),
      tag: new Set(tags.map((t) => t._id)),
      trip: new Set(trips.map((t) => t.tripId)),
    };

    const grouped = new Map<string, LocalDeleteLog[]>();

    for (const log of allLogs) {
      const rawEntityId = resolveEntityId(log);
      if (activeIds[log.entityType]?.has(rawEntityId)) {
        await db.deleteLogs.delete(log.id);
        continue;
      }

      const key = `${log.entityType}:${rawEntityId}`;
      const group = grouped.get(key) || [];
      group.push(log);
      grouped.set(key, group);
    }

    for (const logs of grouped.values()) {
      const entityId = resolveEntityId(logs[0]);
      const canonicalId = canonicalDeleteLogId(entityId);

      if (logs.length === 1) {
        if (logs[0].id !== canonicalId) {
          await db.deleteLogs.delete(logs[0].id);
          await db.deleteLogs.put({ ...logs[0], id: canonicalId, entityId });
        }
        continue;
      }

      // Sort: prefer one with _id (synced to server), then syncStatus === 'synced', then latest deletedAt
      logs.sort((a, b) => {
        if (a._id && !b._id) return -1;
        if (!a._id && b._id) return 1;
        if (a.syncStatus === "synced" && b.syncStatus !== "synced") return -1;
        if (a.syncStatus !== "synced" && b.syncStatus === "synced") return 1;
        return new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime();
      });

      const bestLog = logs[0];

      // Delete all duplicate logs, then put only the best log under canonicalId
      for (const l of logs) {
        await db.deleteLogs.delete(l.id);
      }
      await db.deleteLogs.put({ ...bestLog, id: canonicalId, entityId });
    }
  } catch (err) {
    console.warn("[deduplicateDeleteLogs] Error:", err);
  }
}

export async function permanentDeleteLog(logId: string): Promise<boolean> {
  try {
    const { log, allLogs } = await findDeleteLog(logId);
    const targetId = log?._id || log?.entityId || logId;

    if (log) {
      await removeAllCopiesOfLog(log, allLogs);
    } else {
      await db.deleteLogs.delete(logId);
    }

    const token = getStoredAccessToken();
    await fetch(`/api/delete-logs?id=${encodeURIComponent(targetId)}`, {
      method: "DELETE",
      headers: buildAuthHeaders(token),
    });

    await deduplicateDeleteLogs();
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
