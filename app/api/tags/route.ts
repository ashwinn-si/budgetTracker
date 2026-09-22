import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Tag } from "@/models/Tag";
import { Expense } from "@/models/Expense";
import { DeleteLog } from "@/models/DeleteLog";
import { getCurrentUser } from "@/lib/auth";
import { GENERAL_TRIP_ID, tripIdFilter } from "@/lib/trips";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const db = await connectToDatabase();
    if (!db) {
      // Local fallback
      return NextResponse.json({ tags: [] });
    }

    const tags = await Tag.find({ userId }).lean();

    // Aggregate expense count for each tag
    const tagIds = tags.map((t) => t._id);
    const expenseCounts = await Expense.aggregate([
      { $match: { userId, tagIds: { $in: tagIds } } },
      { $unwind: "$tagIds" },
      { $match: { tagIds: { $in: tagIds } } },
      { $group: { _id: "$tagIds", count: { $sum: 1 } } },
    ]);

    const countMap: Record<string, number> = {};
    expenseCounts.forEach((ec) => {
      countMap[ec._id.toString()] = ec.count;
    });

    const tagsWithCounts = tags.map((t) => ({
      ...t,
      _id: t._id.toString(),
      expenseCount: countMap[t._id.toString()] || 0,
    }));

    return NextResponse.json({ tags: tagsWithCounts });
  } catch (error: unknown) {
    console.error("GET /api/tags error:", error);
    return NextResponse.json({ error: "Failed to load tags" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { name, colorKey, tripId } = await req.json();
    const effectiveTripId = typeof tripId === "string" && tripId ? tripId : GENERAL_TRIP_ID;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({
        tag: {
          _id: `tag_${Date.now()}`,
          userId,
          name: name.trim(),
          colorKey: colorKey || "#22C55E",
          tripId: effectiveTripId,
          expenseCount: 0,
        },
      });
    }

    const existing = await Tag.findOne({ userId, tripId: tripIdFilter(effectiveTripId), name: name.trim() });
    if (existing) {
      return NextResponse.json({ error: "A tag with this name already exists" }, { status: 409 });
    }

    const tag = await Tag.create({
      userId,
      name: name.trim(),
      colorKey: colorKey || "#22C55E",
      tripId: effectiveTripId,
    });

    return NextResponse.json({
      tag: {
        _id: tag._id.toString(),
        userId: tag.userId,
        name: tag.name,
        colorKey: tag.colorKey,
        tripId: tag.tripId,
        expenseCount: 0,
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/tags error:", error);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { id, name, colorKey } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Tag ID is required" }, { status: 400 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ success: true });
    }

    const isValidObjectId = mongoose.Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(id);
    const tag = await Tag.findOne({
      userId,
      $or: [
        ...(isValidObjectId ? [{ _id: id }] : []),
        { clientId: id },
      ],
    });
    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    if (name) {
      const trimmed = name.trim();
      const duplicate = await Tag.findOne({
        userId,
        tripId: tripIdFilter(tag.tripId || GENERAL_TRIP_ID),
        name: { $regex: new RegExp(`^${trimmed.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, "i") },
        _id: { $ne: tag._id },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "Another category with this name already exists" },
          { status: 409 }
        );
      }
      tag.name = trimmed;
    }
    if (colorKey) tag.colorKey = colorKey;
    await tag.save();

    return NextResponse.json({ tag });
  } catch (error: unknown) {
    console.error("PUT /api/tags error:", error);
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Tag ID is required" }, { status: 400 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ success: true });
    }

    const tag = await Tag.findOne({ _id: id, userId });
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

      await Tag.deleteOne({ _id: id, userId });
      // Remove tagId from any expenses referencing it
      await Expense.updateMany(
        { userId, tagIds: id },
        { $pull: { tagIds: id } }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/tags error:", error);
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
