import { db, LocalSaving, SyncQueueItem } from "../db";
import { isOnline } from "./auth";
import { sendOrQueue } from "./directSync";
import { purgeDeleteLogsFor, writeDeleteLog } from "./deleteLogs";

async function saveAndSync(saving: LocalSaving, action: "create" | "update") {
  const initialStatus = isOnline() ? ("syncing" as const) : ("pending" as const);
  const local: LocalSaving = {
    ...saving,
    syncStatus: initialStatus,
    ...(action === "update" ? { updatedAt: new Date().toISOString() } : {}),
  };
  await db.savings.put(local);

  const item: SyncQueueItem = {
    clientId: saving.clientId,
    action,
    entity: "saving",
    payload: { ...local },
    createdAt: Date.now(),
  };

  const sent = await sendOrQueue(item);
  if (!sent && initialStatus === "syncing") {
    await db.savings.update(saving.clientId, { syncStatus: "pending" });
  }
}

export async function queueSavingCreation(saving: LocalSaving) {
  await saveAndSync(saving, "create");
}

export async function queueSavingUpdate(saving: LocalSaving) {
  await saveAndSync(saving, "update");
}

export async function queueSavingDeletion(clientId: string) {
  const saving = await db.savings.get(clientId);

  if (saving) {
    await writeDeleteLog({
      userId: saving.userId,
      entityType: "saving",
      entityId: clientId,
      title: saving.note?.trim() || (saving.type === "deposit" ? "Savings Deposit" : "Savings Withdrawal"),
      details: saving.date ? saving.date.split("T")[0] : "Recent",
      data: { ...saving },
      deletedAt: new Date().toISOString(),
      syncStatus: "pending",
    });
  } else {
    await purgeDeleteLogsFor(clientId);
  }

  await db.savings.delete(clientId);

  await sendOrQueue({
    clientId,
    action: "delete",
    entity: "saving",
    payload: { clientId, ...(saving ? { deleteSnapshot: { ...saving } } : {}) },
    createdAt: Date.now(),
  });
}
