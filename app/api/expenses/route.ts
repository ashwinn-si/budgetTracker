import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const tagIds = searchParams.get("tagIds")?.split(",").filter(Boolean);
    const search = searchParams.get("search");

    const db = await connectToDatabase();
    if (!db) {
      // Local fallback
      return NextResponse.json({ expenses: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = { userId };

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (tagIds && tagIds.length > 0) {
      filter.tagIds = { $in: tagIds };
    }

    if (search && search.trim()) {
      filter.note = { $regex: search.trim(), $options: "i" };
    }

    const expenses = await Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .populate("tagIds")
      .lean();

    return NextResponse.json({ expenses });
  } catch (error: unknown) {
    console.error("GET /api/expenses error:", error);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { amount, note, tagIds, date, clientId, isSaving, fromSavings } = await req.json();

    if (amount === undefined || isNaN(Number(amount))) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({
        expense: {
          _id: `exp_${Date.now()}`,
          userId,
          amount: Number(amount),
          note: note || "",
          tagIds: tagIds || [],
          date: date ? new Date(date).toISOString() : new Date().toISOString(),
          clientId: clientId || `client_${Date.now()}`,
          syncStatus: "synced",
          isSaving: Boolean(isSaving),
          fromSavings: Boolean(fromSavings),
        },
      });
    }

    const expense = await Expense.create({
      userId,
      amount: Number(amount),
      note: note ? note.trim() : "",
      tagIds: tagIds || [],
      date: date ? new Date(date) : new Date(),
      clientId,
      syncStatus: "synced",
      isSaving: Boolean(isSaving),
      fromSavings: Boolean(fromSavings),
    });

    return NextResponse.json({ expense });
  } catch (error: unknown) {
    console.error("POST /api/expenses error:", error);
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { id, clientId, amount, note, tagIds, date, isSaving, fromSavings } = await req.json();

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ success: true });
    }

    const filter = id ? { _id: id, userId } : { clientId, userId };
    const expense = await Expense.findOne(filter);

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    if (amount !== undefined) expense.amount = Number(amount);
    if (note !== undefined) expense.note = note.trim();
    if (tagIds !== undefined) expense.tagIds = tagIds;
    if (date !== undefined) expense.date = new Date(date);
    if (isSaving !== undefined) expense.isSaving = Boolean(isSaving);
    if (fromSavings !== undefined) expense.fromSavings = Boolean(fromSavings);

    await expense.save();
    return NextResponse.json({ expense });
  } catch (error: unknown) {
    console.error("PUT /api/expenses error:", error);
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const clientId = searchParams.get("clientId");

    if (!id && !clientId) {
      return NextResponse.json({ error: "id or clientId is required" }, { status: 400 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ success: true });
    }

    const filter = id ? { _id: id, userId } : { clientId, userId };
    await Expense.deleteOne(filter);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/expenses error:", error);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
