import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { Tag } from "@/models/Tag";
import { Saving } from "@/models/Saving";
import { getCurrentUser } from "@/lib/auth";

interface SyncItem {
  clientId: string;
  action: "create" | "update" | "delete";
  entity: "expense" | "tag" | "saving";
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
  userId: string
): Promise<void> {
  const { payload, action, clientId } = item;

  if (action === "create" || action === "update") {
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

    const filter: Record<string, unknown> = clientId
      ? { clientId, userId }
      : { _id: payload._id, userId };

    const updateDoc = {
      userId,
      clientId,
      amount,
      note: typeof payload.note === "string" ? payload.note.trim() : "",
      tagIds: Array.isArray(payload.tagIds) ? payload.tagIds : [],
      date,
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

    await Expense.deleteOne(deleteFilter);
  }
}

async function processTag(
  item: SyncItem,
  userId: string
): Promise<void> {
  const { payload, action, clientId } = item;
  const tagName = typeof payload.name === "string" ? payload.name.trim() : "";

  if (!tagName) {
    throw new Error("Tag is missing a name");
  }

  if (action === "create" || action === "update") {
    // Tags are identified by { name, userId } — their compound unique index.
    // Local tag IDs (e.g. "tag_groceries", "tag_1789843710097_rvbhe") are
    // Dexie-only identifiers and are NOT valid MongoDB ObjectIds.
    // Using them as _id would cause a CastError.
    await Tag.findOneAndUpdate(
      { name: tagName, userId },
      {
        $set: {
          userId,
          name: tagName,
          colorKey: typeof payload.colorKey === "string"
            ? payload.colorKey
            : "#22C55E",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

  } else if (action === "delete") {
    if (tagName) {
      // Always prefer name-based delete — safe regardless of clientId format
      await Tag.deleteOne({ name: tagName, userId });
    } else {
      // Fall back to _id only when clientId is a valid 24-char hex ObjectId
      const isValidObjectId = /^[a-f\d]{24}$/i.test(clientId);
      if (isValidObjectId) {
        await Tag.deleteOne({ _id: clientId, userId });
      }
      // Otherwise: local-only tag never synced to server — nothing to delete
    }
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

    const filter: Record<string, unknown> = clientId
      ? { clientId, userId }
      : { _id: payload._id, userId };

    const updateDoc = {
      userId,
      clientId,
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

    await Saving.deleteOne(deleteFilter);
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

    for (const item of items) {
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
            await processExpense(item, userId);
            break;
          case "tag":
            await processTag(item, userId);
            break;
          case "saving":
            await processSaving(item, userId);
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

    // Return a rich response so the client can selectively retry only the
    // items that actually failed, rather than re-sending the whole queue.
    return NextResponse.json({
      success: true,
      processed: processedCount,
      failed: failedItems.length,
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
