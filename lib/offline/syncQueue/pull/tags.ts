import { db, LocalTag } from "../../db";
import { GENERAL_TRIP_ID } from "@/lib/trips";
import { repointTagReferences } from "../directSync";
import { PullSession, toIdString } from "./session";

/**
 * Pull tags with reconciliation: a local tag matching a server tag by
 * name+trip or clientId (but with a different _id) is merged into the server
 * id. Local tags gone from the server and not pending sync are removed.
 */
export async function pullTags(session: PullSession): Promise<void> {
  const res = await session.get("/api/tags");
  if (!res.ok) return;

  const data = await res.json();
  if (!Array.isArray(data.tags)) return;

  const serverTags = data.tags as Record<string, unknown>[];
  const existingLocalTags = await db.tags.toArray();

  for (const sTag of serverTags) {
    const sId = toIdString(sTag._id);
    const sName = ((sTag.name as string) || "").trim().toLowerCase();
    const sClientId = sTag.clientId as string | undefined;
    const sTripId = (sTag.tripId as string) || GENERAL_TRIP_ID;

    // Check if an existing local tag has a different _id but matches by name+trip or clientId
    const matchingLocal = existingLocalTags.find(
      (lt) => lt._id !== sId && (
        (lt.name && lt.name.trim().toLowerCase() === sName && (lt.tripId || GENERAL_TRIP_ID) === sTripId) ||
        (sClientId && lt._id === sClientId)
      )
    );

    if (matchingLocal) {
      await repointTagReferences(matchingLocal._id, sId);
      // Delete old duplicate local tag
      await db.tags.delete(matchingLocal._id);
    }
  }

  const localTags: LocalTag[] = serverTags.map((t) => ({
    _id: toIdString(t._id),
    userId: (t.userId as string) || "local_user",
    name: t.name as string,
    colorKey: (t.colorKey as string) || "#22C55E",
    tripId: (t.tripId as string) || GENERAL_TRIP_ID,
  }));
  await db.tags.bulkPut(localTags);

  // Remove local tags that no longer exist on server and aren't pending creation
  const pendingTagItems = await db.syncQueue.where("entity").equals("tag").toArray();
  const pendingTagIds = new Set(pendingTagItems.map((p) => p.clientId));
  const serverTagIdSet = new Set(localTags.map((t) => t._id));
  const currentLocalTags = await db.tags.toArray();
  for (const lt of currentLocalTags) {
    if (!serverTagIdSet.has(lt._id) && !pendingTagIds.has(lt._id)) {
      await db.tags.delete(lt._id);
    }
  }
}
