import { db, LocalExpense, LocalTag, SyncQueueItem } from "./db";

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
    payload: { tagId },
    createdAt: Date.now(),
  });
}

export async function flushSyncQueue(): Promise<{ success: boolean; syncedCount: number; error?: string }> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { success: false, syncedCount: 0, error: "Offline" };
  }

  const queueItems = await db.syncQueue.toArray();
  if (queueItems.length === 0) {
    return { success: true, syncedCount: 0 };
  }

  try {
    const res = await fetch("/api/expenses/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: queueItems }),
    });

    if (!res.ok) {
      // Server returned error or DB not connected
      return { success: false, syncedCount: 0, error: `Server response: ${res.status}` };
    }

    const data = await res.json();

    // Mark processed items in local Dexie as synced
    for (const item of queueItems) {
      if (item.entity === "expense" && item.action !== "delete") {
        const exp = await db.expenses.get(item.clientId);
        if (exp) {
          await db.expenses.update(item.clientId, { syncStatus: "synced" });
        }
      }
      if (item.id !== undefined) {
        await db.syncQueue.delete(item.id);
      }
    }

    return { success: true, syncedCount: queueItems.length, ...data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync error";
    return { success: false, syncedCount: 0, error: message };
  }
}
