import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { DeleteLog } from "@/models/DeleteLog";
import { Expense } from "@/models/Expense";
import { Saving } from "@/models/Saving";
import { Tag } from "@/models/Tag";
import { Trip } from "@/models/Trip";
import { getCurrentUser } from "@/lib/auth";
import { GENERAL_TRIP_ID, tripIdFilter } from "@/lib/trips";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const body = await req.json().catch(() => ({}));
    const { logId, entityId } = body;

    if (!logId && !entityId) {
      return NextResponse.json(
        { error: "logId or entityId is required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 }
      );
    }

    const searchCriteria: Record<string, unknown>[] = [];
    if (logId) {
      if (mongoose.Types.ObjectId.isValid(logId) && /^[a-f\d]{24}$/i.test(logId)) {
        searchCriteria.push({ _id: new mongoose.Types.ObjectId(logId) });
      }
      searchCriteria.push({ entityId: logId });
    }
    if (entityId) {
      searchCriteria.push({ entityId });
    }

    const log = await DeleteLog.findOne({
      userId,
      $or: searchCriteria,
    });

    if (!log) {
      return NextResponse.json(
        { error: "Delete log record not found" },
        { status: 404 }
      );
    }

    const data = (log.data || {}) as Record<string, unknown>;
    const entityType = log.entityType;

    // If the trip the item belonged to no longer exists for this user, fall back to General.
    async function resolveTripId(): Promise<string> {
      const rawTripId = typeof data.tripId === "string" && data.tripId ? data.tripId : GENERAL_TRIP_ID;
      if (rawTripId === GENERAL_TRIP_ID) return GENERAL_TRIP_ID;
      const exists = await Trip.exists({ userId, tripId: rawTripId });
      return exists ? rawTripId : GENERAL_TRIP_ID;
    }

    if (entityType === "expense") {
      const clientId = (data.clientId as string) || log.entityId;
      const amount = Number(data.amount) || 0;
      const note = typeof data.note === "string" ? data.note.trim() : "";
      const date = data.date ? new Date(data.date as string) : new Date();
      const tripId = await resolveTripId();

      // Resolve tagIds
      const resolvedTagIds: mongoose.Types.ObjectId[] = [];
      if (Array.isArray(data.tagIds)) {
        for (const tid of data.tagIds) {
          if (tid && mongoose.Types.ObjectId.isValid(String(tid)) && /^[a-f\d]{24}$/i.test(String(tid))) {
            resolvedTagIds.push(new mongoose.Types.ObjectId(String(tid)));
          }
        }
      }

      const updateDoc = {
        userId,
        clientId,
        amount,
        note,
        tagIds: resolvedTagIds,
        date,
        tripId,
        syncStatus: "synced",
        updatedAt: new Date(),
      };

      const filter = clientId ? { clientId, userId } : { _id: new mongoose.Types.ObjectId(), userId };
      await Expense.findOneAndUpdate(filter, { $set: updateDoc }, { upsert: true, new: true });

    } else if (entityType === "saving") {
      const clientId = (data.clientId as string) || log.entityId;
      const amount = Number(data.amount) || 0;
      const note = typeof data.note === "string" ? data.note.trim() : "";
      const date = data.date ? new Date(data.date as string) : new Date();
      const type = data.type === "withdrawal" ? "withdrawal" : "deposit";
      const linkedExpenseId = data.linkedExpenseId as string | undefined;

      const updateDoc = {
        userId,
        clientId,
        amount,
        type,
        note,
        date,
        linkedExpenseId,
        syncStatus: "synced",
        updatedAt: new Date(),
      };

      const filter = clientId ? { clientId, userId } : { _id: new mongoose.Types.ObjectId(), userId };
      await Saving.findOneAndUpdate(filter, { $set: updateDoc }, { upsert: true, new: true });

    } else if (entityType === "tag") {
      const name = typeof data.name === "string" ? data.name.trim() : log.title;
      const colorKey = typeof data.colorKey === "string" ? data.colorKey : "#22C55E";
      const clientId = (data.clientId as string) || (typeof data._id === "string" ? data._id : log.entityId);
      const tripId = await resolveTripId();

      const tag = await Tag.findOneAndUpdate(
        { name, userId, tripId: tripIdFilter(tripId) },
        {
          $set: {
            userId,
            name,
            colorKey,
            tripId,
            ...(clientId ? { clientId } : {}),
          },
        },
        { upsert: true, new: true }
      );

      // Re-attach tag to affected expenses if recorded in snapshot
      if (tag && Array.isArray(data.affectedExpenseIds) && data.affectedExpenseIds.length > 0) {
        const validExpenseIds = data.affectedExpenseIds.filter(
          (id) => typeof id === "string" && mongoose.Types.ObjectId.isValid(id)
        );
        if (validExpenseIds.length > 0) {
          await Expense.updateMany(
            { userId, _id: { $in: validExpenseIds } },
            { $addToSet: { tagIds: tag._id } }
          );
        }
      }
    } else if (entityType === "trip") {
      const tripSnapshot = (data.trip || {}) as Record<string, unknown>;
      const tagsSnapshot = Array.isArray(data.tags) ? (data.tags as Record<string, unknown>[]) : [];
      const expensesSnapshot = Array.isArray(data.expenses)
        ? (data.expenses as Record<string, unknown>[])
        : [];

      const restoredTripId =
        (typeof tripSnapshot.tripId === "string" && tripSnapshot.tripId) || log.entityId;
      if (!restoredTripId || restoredTripId === GENERAL_TRIP_ID) {
        return NextResponse.json({ error: "Invalid trip snapshot" }, { status: 400 });
      }

      const existingTrips = await Trip.find({ userId }).lean();
      const existingTripIds = new Set(existingTrips.map((t) => t.tripId));
      existingTripIds.add(restoredTripId);

      const rawMirror = Array.isArray(tripSnapshot.mirrorToTripIds)
        ? (tripSnapshot.mirrorToTripIds as unknown[])
        : [];
      const mirrorToTripIds = rawMirror
        .map((id) => String(id))
        .filter((id) => existingTripIds.has(id) && id !== restoredTripId);

      // Sharing is not restored — the owner must re-enable it manually.
      await Trip.findOneAndUpdate(
        { userId, tripId: restoredTripId },
        {
          $set: {
            userId,
            tripId: restoredTripId,
            name:
              typeof tripSnapshot.name === "string" && tripSnapshot.name.trim()
                ? tripSnapshot.name.trim()
                : "Trip",
            emoji: typeof tripSnapshot.emoji === "string" ? tripSnapshot.emoji : "",
            colorKey: typeof tripSnapshot.colorKey === "string" ? tripSnapshot.colorKey : "#22C55E",
            status: tripSnapshot.status === "completed" ? "completed" : "active",
            completedAt: tripSnapshot.completedAt ? new Date(tripSnapshot.completedAt as string) : null,
            mirrorToTripIds,
            startDate: tripSnapshot.startDate ? new Date(tripSnapshot.startDate as string) : null,
            endDate: tripSnapshot.endDate ? new Date(tripSnapshot.endDate as string) : null,
          },
          $setOnInsert: { isDefault: false },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const tagIdMap = new Map<string, mongoose.Types.ObjectId>();
      for (const tagSnap of tagsSnapshot) {
        const name = typeof tagSnap.name === "string" ? tagSnap.name.trim() : "";
        if (!name) continue;
        const colorKey = typeof tagSnap.colorKey === "string" ? tagSnap.colorKey : "#22C55E";
        const clientId = typeof tagSnap.clientId === "string" ? tagSnap.clientId : undefined;
        const oldId = tagSnap._id ? String(tagSnap._id) : undefined;

        const tag = await Tag.findOneAndUpdate(
          { userId, tripId: restoredTripId, name },
          {
            $set: {
              userId,
              tripId: restoredTripId,
              name,
              colorKey,
              ...(clientId ? { clientId } : {}),
            },
          },
          { upsert: true, new: true }
        );
        if (oldId && tag) tagIdMap.set(oldId, tag._id as mongoose.Types.ObjectId);
      }

      let expenseCount = 0;
      for (const expSnap of expensesSnapshot) {
        const clientId =
          (typeof expSnap.clientId === "string" && expSnap.clientId) ||
          (expSnap._id ? String(expSnap._id) : undefined);
        if (!clientId) continue;

        const amount = Number(expSnap.amount) || 0;
        const note = typeof expSnap.note === "string" ? expSnap.note.trim() : "";
        const date = expSnap.date ? new Date(expSnap.date as string) : new Date();

        const rawTagIds = Array.isArray(expSnap.tagIds) ? (expSnap.tagIds as unknown[]) : [];
        const remappedTagIds: mongoose.Types.ObjectId[] = [];
        for (const tid of rawTagIds) {
          const newId = tagIdMap.get(String(tid));
          if (newId) remappedTagIds.push(newId);
        }

        await Expense.findOneAndUpdate(
          { userId, clientId },
          {
            $set: {
              userId,
              clientId,
              amount,
              note,
              tagIds: remappedTagIds,
              date,
              tripId: restoredTripId,
              syncStatus: "synced",
              updatedAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );
        expenseCount += 1;
      }

      const delConditions: Record<string, unknown>[] = [{ _id: log._id }];
      if (log.entityId) delConditions.push({ entityId: log.entityId });
      await DeleteLog.deleteMany({ userId, $or: delConditions });

      return NextResponse.json({
        success: true,
        message: "trip recovered successfully",
        entityType,
        entityId: restoredTripId,
        counts: { tags: tagIdMap.size, expenses: expenseCount },
      });
    }

    // Remove the delete log entry once recovered
    const delConditions: Record<string, unknown>[] = [{ _id: log._id }];
    if (log.entityId) delConditions.push({ entityId: log.entityId });
    await DeleteLog.deleteMany({ userId, $or: delConditions });

    return NextResponse.json({
      success: true,
      message: `${entityType} recovered successfully`,
      entityType,
      entityId: log.entityId,
    });
  } catch (error: unknown) {
    console.error("POST /api/delete-logs/recover error:", error);
    return NextResponse.json(
      { error: "Failed to recover item" },
      { status: 500 }
    );
  }
}
