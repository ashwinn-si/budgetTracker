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

export async function pullFromServer(): Promise<{ success: boolean; error?: string }> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { success: false, error: "Offline" };
  }

  try {
    // 1. Pull tags
    const tagsRes = await fetch("/api/tags");
    if (tagsRes.ok) {
      const tagsData = await tagsRes.json();
      if (Array.isArray(tagsData.tags) && tagsData.tags.length > 0) {
        const localTags: LocalTag[] = tagsData.tags.map((t: any) => ({
          _id: t._id?.toString(),
          userId: t.userId || "local_user",
          name: t.name,
          colorKey: t.colorKey || "#22C55E",
        }));
        await db.tags.bulkPut(localTags);
      }
    }

    // 2. Pull expenses
    const expRes = await fetch("/api/expenses");
    if (expRes.ok) {
      const expData = await expRes.json();
      if (Array.isArray(expData.expenses)) {
        const pendingItems = await db.syncQueue.toArray();
        const pendingClientIds = new Set(pendingItems.map((p) => p.clientId));
        const serverClientIds = new Set<string>();

        for (const sExp of expData.expenses) {
          const clientId = sExp.clientId || sExp._id?.toString();
          serverClientIds.add(clientId);

          if (!pendingClientIds.has(clientId)) {
            const localExp: LocalExpense = {
              clientId,
              userId: sExp.userId,
              amount: Number(sExp.amount) || 0,
              note: sExp.note || "",
              tagIds: Array.isArray(sExp.tagIds)
                ? sExp.tagIds.map((t: any) => (typeof t === "object" ? t._id?.toString() : t.toString()))
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

        // Clean up any old local expenses that no longer exist on server and are not pending
        const localExpenses = await db.expenses.toArray();
        for (const localExp of localExpenses) {
          if (!pendingClientIds.has(localExp.clientId) && !serverClientIds.has(localExp.clientId)) {
            await db.expenses.delete(localExp.clientId);
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
