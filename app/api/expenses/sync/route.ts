import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { Tag } from "@/models/Tag";
import { Saving } from "@/models/Saving";
import { DeleteLog } from "@/models/DeleteLog";
import { getCurrentUser } from "@/lib/auth";
import { GENERAL_TRIP_ID, tripIdFilter } from "@/lib/trips";
import { upsertTrip, updateTrip, deleteTripCascade } from "@/lib/server/trips";

interface SyncItem {
  clientId: string;
  action: "create" | "update" | "delete";
  entity: "expense" | "tag" | "saving" | "trip";
  payload: Record<string, unknown>;
  createdAt: number;
}

interface FailedItem {
  clientId: string;
  entity: string;
  action: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Per-entity processors — each returns true on success, throws on DB error
// ---------------------------------------------------------------------------

async function processExpense(
  item: SyncItem,
  userId: string,
  tagMap: Map<string, string>
): Promise<void> {
  const { payload, action, clientId } = item;

  if (action === "create" || action === "update") {
    const tripId = typeof payload.tripId === "string" && payload.tripId ? payload.tripId : GENERAL_TRIP_ID;

    // Validate amount is a usable number
    const amount = Number(payload.amount);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${payload.amount}`);
    }

    // Validate date
    let date: Date;
    try {
      date = payload.date ? new Date(payload.date as string) : new Date();
      if (isNaN(date.getTime())) throw new Error("Invalid date");
    } catch {
      date = new Date(); // Fall back to now rather than failing the whole item
    }

    // Safely resolve tagIds to valid MongoDB ObjectIds
    // Never allow temporary client IDs (e.g. "tag_1789874834317_f9k1c") to throw CastError
    const resolvedTagIds: mongoose.Types.ObjectId[] = [];
    if (Array.isArray(payload.tagIds)) {
      for (const rawTagId of payload.tagIds) {
        if (!rawTagId) continue;
        const idStr = String(rawTagId).trim();
        if (!idStr) continue;

        // 1. Valid 24-character hex ObjectId
        if (mongoose.Types.ObjectId.isValid(idStr) && /^[a-f\d]{24}$/i.test(idStr)) {
          resolvedTagIds.push(new mongoose.Types.ObjectId(idStr));
          continue;
        }

        // 2. Mapped in this batch by processTag (raw client ids as-is; names scoped to this trip)
        const mappedId = tagMap.get(idStr) || tagMap.get(`${tripId}:${idStr.toLowerCase()}`);
        if (mappedId && mongoose.Types.ObjectId.isValid(mappedId) && /^[a-f\d]{24}$/i.test(mappedId)) {
          resolvedTagIds.push(new mongoose.Types.ObjectId(mappedId));
          continue;
        }

        // 3. Query Tag collection by clientId, name, or legacy tag name — scoped to this expense's trip
        const legacyNames: Record<string, string> = {
          tag_groceries: "Groceries",
          tag_dining: "Dining & Coffee",
          tag_housing: "Housing & Bills",
          tag_wellness: "Health & Gym",
          tag_transport: "Transport",
          tag_leisure: "Entertainment",
        };
        const searchName = legacyNames[idStr] || idStr;

        const dbTag = await Tag.findOne({
          userId,
          tripId: tripIdFilter(tripId),
          $or: [
            { clientId: idStr },
            { name: searchName },
            { name: { $regex: new RegExp(`^${searchName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, "i") } },
          ],
        });
        if (dbTag) {
          const sId = dbTag._id as mongoose.Types.ObjectId;
          resolvedTagIds.push(sId);
          tagMap.set(idStr, sId.toString());
          continue;
        }

        // Tag could not be resolved from DB or current batch - omit rather than throwing a fatal CastError
        console.warn(`[sync] Omitted unresolvable tagId "${idStr}" for expense ${clientId}`);
      }
    }

    // Drop any resolved tag whose tripId doesn't match this expense's trip (e.g. a raw ObjectId
    // that belongs to another trip). Missing tripId on the tag means "general".
    let tripScopedTagIds = resolvedTagIds;
    if (resolvedTagIds.length > 0) {
      const tagDocs = await Tag.find({ _id: { $in: resolvedTagIds }, userId }, { tripId: 1 }).lean();
      const tagTripById = new Map(tagDocs.map((t) => [t._id.toString(), t.tripId || GENERAL_TRIP_ID]));
      tripScopedTagIds = resolvedTagIds.filter((id) => (tagTripById.get(id.toString()) || GENERAL_TRIP_ID) === tripId);
    }

    const effectiveClientId = clientId || (payload.clientId as string) || (typeof payload._id === "string" ? payload._id : "");
    const isValidObjectId = payload._id && mongoose.Types.ObjectId.isValid(String(payload._id)) && /^[a-f\d]{24}$/i.test(String(payload._id));
    const filter: Record<string, unknown> = effectiveClientId
      ? { clientId: effectiveClientId, userId }
      : isValidObjectId
      ? { _id: payload._id, userId }
      : { clientId: String(payload._id || clientId), userId };

    const updateDoc = {
      userId,
      clientId: effectiveClientId,
      amount,
      note: typeof payload.note === "string" ? payload.note.trim() : "",
      tagIds: tripScopedTagIds,
      date,
      tripId,
      syncStatus: "synced",
      ...(payload.updatedAt
        ? { updatedAt: new Date(payload.updatedAt as string) }
        : {}),
    };

    await Expense.findOneAndUpdate(filter, { $set: updateDoc }, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

  } else if (action === "delete") {
    const deleteFilter: Record<string, unknown> = { userId };

    if (clientId && payload.id) {
      deleteFilter.$or = [{ clientId }, { _id: payload.id }];
    } else if (clientId) {
      deleteFilter.clientId = clientId;
    } else if (payload.id) {
      deleteFilter._id = payload.id;
    } else {
      throw new Error("delete requires clientId or payload.id");
    }

    const existing = await Expense.findOne(deleteFilter);
    if (existing) {
      await DeleteLog.findOneAndUpdate(
        { userId, entityId: existing.clientId || existing._id.toString() },
        {
          $set: {
            userId,
            entityType: "expense",
            entityId: existing.clientId || existing._id.toString(),
            title: existing.note?.trim() || "Expense",
            details: existing.date ? new Date(existing.date).toISOString().split("T")[0] : "Recent",
            data: existing.toObject(),
            deletedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
      await Expense.deleteOne({ _id: existing._id });
    } else if (payload.deleteSnapshot) {
      const snap = payload.deleteSnapshot as Record<string, unknown>;
      await DeleteLog.findOneAndUpdate(
        { userId, entityId: clientId || String(payload.id) },
        {
          $set: {
            userId,
            entityType: "expense",
            entityId: clientId || String(payload.id),
            title: (snap.note as string)?.trim() || "Expense",
            details: snap.date ? String(snap.date).split("T")[0] : "Recent",
            data: snap,
            deletedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
    }
  }
}

async function processTag(
  item: SyncItem,
  userId: string,
  tagMap: Map<string, string>
): Promise<void> {
  const { payload, action, clientId } = item;
  const tagName = typeof payload.name === "string" ? payload.name.trim() : "";
  const tripId = typeof payload.tripId === "string" && payload.tripId ? payload.tripId : GENERAL_TRIP_ID;

  if (!tagName && action !== "delete") {
    throw new Error("Tag is missing a name");
  }

  const effectiveClientId = clientId || (typeof payload._id === "string" ? payload._id : "");

  if (action === "update") {
    const targetId = String(payload.id || payload._id || clientId);
    const isValidObjectId = mongoose.Types.ObjectId.isValid(targetId) && /^[a-f\d]{24}$/i.test(targetId);
    const filter = isValidObjectId
      ? { _id: new mongoose.Types.ObjectId(targetId), userId }
      : { clientId: effectiveClientId || targetId, userId };

    let tag = await Tag.findOneAndUpdate(
      filter,
      {
        $set: {
          userId,
          name: tagName,
          colorKey: typeof payload.colorKey === "string"
            ? payload.colorKey
            : "#22C55E",
          tripId,
          ...(effectiveClientId ? { clientId: effectiveClientId } : {}),
        },
      },
      { new: true }
    );

    if (!tag) {
      tag = await Tag.findOneAndUpdate(
        { name: tagName, userId, tripId: tripIdFilter(tripId) },
        {
          $set: {
            userId,
            name: tagName,
            colorKey: typeof payload.colorKey === "string"
              ? payload.colorKey
              : "#22C55E",
            tripId,
            ...(effectiveClientId ? { clientId: effectiveClientId } : {}),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    if (tag) {
      const serverId = tag._id.toString();
      if (effectiveClientId) {
        tagMap.set(effectiveClientId, serverId);
      }
      tagMap.set(`${tripId}:${tagName.toLowerCase()}`, serverId);
    }

  } else if (action === "create") {
    // Tags are identified by { name, userId, tripId } — their compound unique index.
    const tag = await Tag.findOneAndUpdate(
      { name: tagName, userId, tripId: tripIdFilter(tripId) },
      {
        $set: {
          userId,
          name: tagName,
          colorKey: typeof payload.colorKey === "string"
            ? payload.colorKey
            : "#22C55E",
          tripId,
          ...(effectiveClientId ? { clientId: effectiveClientId } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (tag) {
      const serverId = tag._id.toString();
      if (effectiveClientId) {
        tagMap.set(effectiveClientId, serverId);
      }
      tagMap.set(`${tripId}:${tagName.toLowerCase()}`, serverId);
    }
  } else if (action === "delete") {
    let tag = null;
    if (tagName) {
      tag = await Tag.findOne({ name: tagName, userId, tripId: tripIdFilter(tripId) });
    } else {
      const isValidObjectId = /^[a-f\d]{24}$/i.test(clientId);
      tag = await Tag.findOne({
        userId,
        $or: [
          ...(isValidObjectId ? [{ _id: clientId }] : []),
          { clientId },
        ],
      });
    }

    if (tag) {
      const affectedExpenses = await Expense.find({ userId, tagIds: tag._id }).select("_id");
      const affectedExpenseIds = affectedExpenses.map((e) => e._id.toString());
      await DeleteLog.findOneAndUpdate(
        { userId, entityId: tag._id.toString() },
        {
          $set: {
            userId,
            entityType: "tag",
            entityId: tag._id.toString(),
            title: tag.name,
            details: `Category • ${tag.colorKey}`,
            data: { ...tag.toObject(), affectedExpenseIds },
            deletedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );

      await Expense.updateMany({ userId, tagIds: tag._id }, { $pull: { tagIds: tag._id } });
      await Tag.deleteOne({ _id: tag._id, userId });
    } else if (payload.deleteSnapshot) {
      const snap = payload.deleteSnapshot as Record<string, unknown>;
      await DeleteLog.findOneAndUpdate(
        { userId, entityId: clientId || String(payload.tagId || payload.id) },
        {
          $set: {
            userId,
            entityType: "tag",
            entityId: clientId || String(payload.tagId || payload.id),
            title: (snap.name as string) || tagName || "Category",
            details: `Category • ${(snap.colorKey as string) || "#22C55E"}`,
            data: snap,
            deletedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
    }
  }
}

async function processTrip(item: SyncItem, userId: string): Promise<void> {
  const { payload, action, clientId } = item;
  const tripId = (typeof payload.tripId === "string" && payload.tripId) || clientId;

  if (action === "create") {
    const result = await upsertTrip(userId, { ...payload, tripId });
    if (result.error) throw new Error(result.error);
  } else if (action === "update") {
    let result = await updateTrip(userId, tripId, payload);
    // An update can arrive for a trip whose create never landed; upsert so the queue item doesn't retry forever
    if (result.status === 404 && tripId !== GENERAL_TRIP_ID) {
      result = await upsertTrip(userId, { ...payload, tripId });
      if (!result.error && payload.status !== undefined) result = await updateTrip(userId, tripId, payload);
    }
    if (result.error) throw new Error(result.error);
  } else if (action === "delete") {
    const result = await deleteTripCascade(userId, tripId);
    if (result.error && result.status !== 404) throw new Error(result.error);
  }
}

async function processSaving(
  item: SyncItem,
  userId: string
): Promise<void> {
  const { payload, action, clientId } = item;

  if (action === "create" || action === "update") {
    const amount = Number(payload.amount);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${payload.amount}`);
    }

    const validTypes = ["deposit", "withdrawal"];
    const type = validTypes.includes(payload.type as string)
      ? (payload.type as "deposit" | "withdrawal")
      : "deposit";

    let date: Date;
    try {
      date = payload.date ? new Date(payload.date as string) : new Date();
      if (isNaN(date.getTime())) throw new Error("Invalid date");
    } catch {
      date = new Date();
    }

    const effectiveClientId = clientId || (payload.clientId as string) || (typeof payload._id === "string" ? payload._id : "");
    const isValidObjectId = payload._id && mongoose.Types.ObjectId.isValid(String(payload._id)) && /^[a-f\d]{24}$/i.test(String(payload._id));
    const filter: Record<string, unknown> = effectiveClientId
      ? { clientId: effectiveClientId, userId }
      : isValidObjectId
      ? { _id: payload._id, userId }
      : { clientId: String(payload._id || clientId), userId };

    const updateDoc = {
      userId,
      clientId: effectiveClientId,
      amount,
      type,
      note: typeof payload.note === "string" ? payload.note.trim() : "",
      date,
      syncStatus: "synced",
      linkedExpenseId: payload.linkedExpenseId || undefined,
      ...(payload.updatedAt
        ? { updatedAt: new Date(payload.updatedAt as string) }
        : {}),
    };

    await Saving.findOneAndUpdate(filter, { $set: updateDoc }, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

  } else if (action === "delete") {
    const deleteFilter: Record<string, unknown> = { userId };

    if (clientId && payload.id) {
      deleteFilter.$or = [{ clientId }, { _id: payload.id }];
    } else if (clientId) {
      deleteFilter.clientId = clientId;
    } else if (payload.id) {
      deleteFilter._id = payload.id;
    } else {
      throw new Error("delete requires clientId or payload.id");
    }

    const existing = await Saving.findOne(deleteFilter);
    if (existing) {
      await DeleteLog.findOneAndUpdate(
        { userId, entityId: existing.clientId || existing._id.toString() },
        {
          $set: {
            userId,
            entityType: "saving",
            entityId: existing.clientId || existing._id.toString(),
            title: existing.note?.trim() || (existing.type === "deposit" ? "Savings Deposit" : "Savings Withdrawal"),
            details: existing.date ? new Date(existing.date).toISOString().split("T")[0] : "Recent",
            data: existing.toObject(),
            deletedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
      await Saving.deleteOne({ _id: existing._id });
    } else if (payload.deleteSnapshot) {
      const snap = payload.deleteSnapshot as Record<string, unknown>;
      await DeleteLog.findOneAndUpdate(
        { userId, entityId: clientId || String(payload.id) },
        {
          $set: {
            userId,
            entityType: "saving",
            entityId: clientId || String(payload.id),
            title: (snap.note as string)?.trim() || ((snap.type as string) === "deposit" ? "Savings Deposit" : "Savings Withdrawal"),
            details: snap.date ? String(snap.date).split("T")[0] : "Recent",
            data: snap,
            deletedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // --- Auth ---
    // getCurrentUser checks Authorization: Bearer header first, then cookies,
    // so this works in all browsers regardless of cookie policy.
    const user = await getCurrentUser(req);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const userId = user.userId;

    // --- Payload validation ---
    let body: { items?: SyncItem[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: "Request body must contain an 'items' array." },
        { status: 400 }
      );
    }

    if (items.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    // --- DB connection ---
    // connectToDatabase() returns null on failure (never throws).
    let db: typeof import("mongoose") | null = null;
    try {
      db = await connectToDatabase();
    } catch {
      db = null;
    }

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable. Will retry on next sync." },
        { status: 503 }
      );
    }

    // --- Process items — each item is isolated in its own try/catch ---
    //
    // Design: a single bad item (CastError, duplicate key, invalid date…)
    // must NEVER crash the whole sync. We collect failures and return them
    // alongside the success count so the client can decide whether to keep
    // those items in the queue for a future retry.
    let processedCount = 0;
    const failedItems: FailedItem[] = [];
    const tagMap = new Map<string, string>();

    // Process trips first (so tags/expenses can reference them), then tags,
    // then everything else, so tags exist before expenses reference them.
    const entityOrder: Record<string, number> = { trip: 0, tag: 1 };
    const orderedItems = [...items].sort((a, b) => {
      const orderA = entityOrder[a.entity] ?? 2;
      const orderB = entityOrder[b.entity] ?? 2;
      return orderA - orderB;
    });

    for (const item of orderedItems) {
      // Skip structurally invalid items without counting them as failures
      if (
        !item ||
        typeof item.clientId !== "string" ||
        !item.clientId ||
        !item.action ||
        !item.entity ||
        !item.payload ||
        typeof item.payload !== "object"
      ) {
        console.warn("[sync] Skipping malformed item:", item);
        continue;
      }

      try {
        switch (item.entity) {
          case "expense":
            await processExpense(item, userId, tagMap);
            break;
          case "tag":
            await processTag(item, userId, tagMap);
            break;
          case "saving":
            await processSaving(item, userId);
            break;
          case "trip":
            await processTrip(item, userId);
            break;
          default:
            // Unknown entity type — log and skip, don't fail the whole batch
            console.warn(`[sync] Unknown entity type: ${(item as SyncItem).entity}`);
            continue;
        }
        processedCount++;
      } catch (itemErr: unknown) {
        // Log the individual failure but continue processing the rest of the batch
        const reason =
          itemErr instanceof Error ? itemErr.message : String(itemErr);
        console.error(
          `[sync] Failed to process ${item.entity}:${item.action} clientId=${item.clientId}:`,
          reason
        );
        failedItems.push({
          clientId: item.clientId,
          entity: item.entity,
          action: item.action,
          reason,
        });
      }
    }

    // Return a rich response including the tagMap so the client can reconcile
    // temporary local tag IDs with permanent server ObjectIds.
    return NextResponse.json({
      success: true,
      processed: processedCount,
      failed: failedItems.length,
      tagMap: Object.fromEntries(tagMap.entries()),
      ...(failedItems.length > 0 ? { failedItems } : {}),
    });

  } catch (error: unknown) {
    // This outer catch only fires for truly unexpected top-level errors
    // (e.g. auth middleware crash, unexpected DB driver bug).
    console.error("POST /api/expenses/sync unexpected error:", error);
    return NextResponse.json(
      { error: "Sync failed unexpectedly. Please try again." },
      { status: 500 }
    );
  }
}
