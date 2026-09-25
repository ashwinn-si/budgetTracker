import { db, LocalExpense, SyncQueueItem } from "../db";
import { isOnline } from "./auth";
import { sendOrQueue } from "./directSync";
import { purgeDeleteLogsFor, writeDeleteLog } from "./deleteLogs";

async function saveAndSync(expense: LocalExpense, action: "create" | "update") {
  const initialStatus = isOnline() ? ("syncing" as const) : ("pending" as const);
  const local: LocalExpense = {
    ...expense,
    syncStatus: initialStatus,
    ...(action === "update" ? { updatedAt: new Date().toISOString() } : {}),
  };
  await db.expenses.put(local);

  const item: SyncQueueItem = {
    clientId: expense.clientId,
    action,
    entity: "expense",
    payload: { ...local },
    createdAt: Date.now(),
  };

  const sent = await sendOrQueue(item);
  if (!sent && initialStatus === "syncing") {
    await db.expenses.update(expense.clientId, { syncStatus: "pending" });
  }
}

export async function queueExpenseCreation(expense: LocalExpense) {
  await saveAndSync(expense, "create");
}

export async function queueExpenseUpdate(expense: LocalExpense) {
  await saveAndSync(expense, "update");
}

export async function queueExpenseDeletion(clientId: string) {
  // Capture snapshot for DeleteLog (Recycle Bin) before deletion
  const exp = await db.expenses.get(clientId);

  if (exp) {
    await writeDeleteLog({
      userId: exp.userId,
      entityType: "expense",
      entityId: clientId,
      title: exp.note?.trim() || "Expense",
      details: exp.date ? exp.date.split("T")[0] : "Recent",
      data: { ...exp },
      deletedAt: new Date().toISOString(),
      syncStatus: "pending",
    });
  } else {
    await purgeDeleteLogsFor(clientId);
  }

  await db.expenses.delete(clientId);

  await sendOrQueue({
    clientId,
    action: "delete",
    entity: "expense",
    payload: { clientId, ...(exp ? { deleteSnapshot: { ...exp } } : {}) },
    createdAt: Date.now(),
  });
}
