import { db, LocalSaving } from "../../db";
import { PullSession, toDateOnly, toIdString, toIsoOrNow } from "./session";

/**
 * Pull savings with deduplication. Items with a pending syncQueue entry are
 * left untouched (local copy wins until flushed).
 */
export async function pullSavings(session: PullSession): Promise<void> {
  const res = await session.get("/api/savings");
  if (!res.ok) return;

  const data = await res.json();
  if (!Array.isArray(data.savings)) return;

  const pendingItems = await db.syncQueue.toArray();
  const pendingClientIds = new Set(pendingItems.map((p) => p.clientId));
  const serverSavIds = new Set<string>();

  for (const sSav of data.savings) {
    const clientId = sSav.clientId || (sSav._id as { toString(): string })?.toString();
    const serverId = toIdString(sSav._id);
    serverSavIds.add(clientId);

    if (pendingClientIds.has(clientId)) continue;

    // Deduplicate if an existing record in Dexie has matching _id under a different clientId
    const existingByServerId = await db.savings.where("_id").equals(serverId).first();
    if (existingByServerId && existingByServerId.clientId !== clientId) {
      await db.savings.delete(existingByServerId.clientId);
    }

    const localSav: LocalSaving = {
      _id: serverId,
      clientId,
      userId: sSav.userId,
      amount: Number(sSav.amount) || 0,
      type: sSav.type || "deposit",
      note: sSav.note || "",
      date: toDateOnly(sSav.date),
      createdAt: toIsoOrNow(sSav.createdAt),
      updatedAt: toIsoOrNow(sSav.updatedAt),
      syncStatus: "synced",
      linkedExpenseId: sSav.linkedExpenseId || undefined,
    };
    await db.savings.put(localSav);
  }

  const localSavings = await db.savings.toArray();
  for (const localSav of localSavings) {
    if (!pendingClientIds.has(localSav.clientId) && !serverSavIds.has(localSav.clientId)) {
      await db.savings.delete(localSav.clientId);
    }
  }
}
