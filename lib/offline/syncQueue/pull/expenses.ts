import { db, LocalExpense } from "../../db";
import { GENERAL_TRIP_ID } from "@/lib/trips";
import { PullSession, toDateOnly, toIdString, toIsoOrNow } from "./session";

/**
 * Pull expenses with deduplication and ObjectId preservation. Items with a
 * pending syncQueue entry are left untouched (local copy wins until flushed).
 */
export async function pullExpenses(session: PullSession): Promise<void> {
  const res = await session.get("/api/expenses");
  if (!res.ok) return;

  const data = await res.json();
  if (!Array.isArray(data.expenses)) return;

  const pendingItems = await db.syncQueue.toArray();
  const pendingClientIds = new Set(pendingItems.map((p) => p.clientId));
  const serverClientIds = new Set<string>();

  for (const sExp of data.expenses) {
    const clientId = sExp.clientId || (sExp._id as { toString(): string })?.toString();
    const serverId = toIdString(sExp._id);
    serverClientIds.add(clientId);

    if (pendingClientIds.has(clientId)) continue;

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
      date: toDateOnly(sExp.date),
      createdAt: toIsoOrNow(sExp.createdAt),
      updatedAt: toIsoOrNow(sExp.updatedAt),
      syncStatus: "synced",
      tripId: (sExp.tripId as string) || GENERAL_TRIP_ID,
    };
    await db.expenses.put(localExp);
  }

  // Clean up local expenses that no longer exist on server and are not pending
  const localExpenses = await db.expenses.toArray();
  for (const localExp of localExpenses) {
    if (!pendingClientIds.has(localExp.clientId) && !serverClientIds.has(localExp.clientId)) {
      await db.expenses.delete(localExp.clientId);
    }
  }
}
