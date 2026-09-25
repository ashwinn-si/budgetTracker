import { db, cleanUpLegacyDefaultTags, LocalTag } from "../db";
import { GENERAL_TRIP_ID } from "@/lib/trips";
import { sendOrQueue } from "./directSync";
import { purgeDeleteLogsFor, writeDeleteLog } from "./deleteLogs";

export async function queueTagCreation(tag: LocalTag) {
  await db.tags.put(tag);
  await sendOrQueue({
    clientId: tag._id,
    action: "create",
    entity: "tag",
    payload: { ...tag },
    createdAt: Date.now(),
  });
}

export async function queueTagUpdate(tag: LocalTag) {
  await db.tags.put(tag);
  await sendOrQueue({
    clientId: tag._id,
    action: "update",
    entity: "tag",
    payload: { id: tag._id, ...tag },
    createdAt: Date.now(),
  });
}

export async function queueTagDeletion(tagId: string) {
  const tag = await db.tags.get(tagId);

  const allExpenses = await db.expenses.toArray();
  const affectedExpenseClientIds = allExpenses
    .filter((exp) => Array.isArray(exp.tagIds) && exp.tagIds.includes(tagId))
    .map((exp) => exp.clientId);

  if (tag) {
    await writeDeleteLog({
      userId: tag.userId,
      entityType: "tag",
      entityId: tagId,
      title: tag.name,
      details: `Category • ${tag.colorKey}`,
      data: { ...tag, affectedExpenseClientIds },
      deletedAt: new Date().toISOString(),
      syncStatus: "pending",
    });
  } else {
    await purgeDeleteLogsFor(tagId);
  }

  await db.tags.delete(tagId);
  for (const exp of allExpenses) {
    if (exp.tagIds && exp.tagIds.includes(tagId)) {
      exp.tagIds = exp.tagIds.filter((id) => id !== tagId);
      await db.expenses.put(exp);
    }
  }

  await sendOrQueue({
    clientId: tagId,
    action: "delete",
    entity: "tag",
    payload: {
      tagId,
      name: tag?.name ?? "",
      tripId: tag?.tripId || GENERAL_TRIP_ID,
      ...(tag ? { deleteSnapshot: { ...tag, affectedExpenseIds: affectedExpenseClientIds } } : {}),
    },
    createdAt: Date.now(),
  });
}

/**
 * Scan Dexie's local tags table and deduplicate any tags that share the same
 * name (case-insensitive) within a trip. Keeps the server-synced tag (valid
 * 24-char ObjectId) or the first created tag, updates all local expenses and
 * pending sync queue items to reference the canonical ID, and removes
 * duplicate tag records.
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
      const canonical = tagList.find((t) => /^[a-f\d]{24}$/i.test(t._id)) ?? tagList[0];
      const duplicateIds = new Set(
        tagList.filter((t) => t._id !== canonical._id).map((t) => t._id)
      );
      if (duplicateIds.size === 0) continue;

      // Re-point all expenses in Dexie to canonical._id
      const allExpenses = await db.expenses.toArray();
      for (const exp of allExpenses) {
        if (Array.isArray(exp.tagIds) && exp.tagIds.some((id) => duplicateIds.has(id))) {
          exp.tagIds = Array.from(
            new Set(exp.tagIds.map((id) => (duplicateIds.has(id) ? canonical._id : id)))
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
              new Set(pIds.map((id) => (duplicateIds.has(id) ? canonical._id : id)))
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
