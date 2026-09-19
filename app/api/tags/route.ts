import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Tag } from "@/models/Tag";
import { Expense } from "@/models/Expense";
import { getCurrentUser } from "@/lib/auth";

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

    const { name, colorKey } = await req.json();

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
          expenseCount: 0,
        },
      });
    }

    const existing = await Tag.findOne({ userId, name: name.trim() });
    if (existing) {
      return NextResponse.json({ error: "A tag with this name already exists" }, { status: 409 });
    }

    const tag = await Tag.create({
      userId,
      name: name.trim(),
      colorKey: colorKey || "#22C55E",
    });

    return NextResponse.json({
      tag: {
        _id: tag._id.toString(),
        userId: tag.userId,
        name: tag.name,
        colorKey: tag.colorKey,
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

    const tag = await Tag.findOne({ _id: id, userId });
    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    if (name) tag.name = name.trim();
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

    await Tag.deleteOne({ _id: id, userId });
    // Remove tagId from any expenses referencing it
    await Expense.updateMany(
      { userId, tagIds: id },
      { $pull: { tagIds: id } }
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/tags error:", error);
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
