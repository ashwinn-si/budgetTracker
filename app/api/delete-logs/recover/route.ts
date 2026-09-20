import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { DeleteLog } from "@/models/DeleteLog";
import { Expense } from "@/models/Expense";
import { Saving } from "@/models/Saving";
import { Tag } from "@/models/Tag";
import { getCurrentUser } from "@/lib/auth";

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

    if (entityType === "expense") {
      const clientId = (data.clientId as string) || log.entityId;
      const amount = Number(data.amount) || 0;
      const note = typeof data.note === "string" ? data.note.trim() : "";
      const date = data.date ? new Date(data.date as string) : new Date();

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

      const tag = await Tag.findOneAndUpdate(
        { name, userId },
        {
          $set: {
            userId,
            name,
            colorKey,
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
    }

    // Remove the delete log entry once recovered
    await DeleteLog.deleteOne({ _id: log._id });

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
