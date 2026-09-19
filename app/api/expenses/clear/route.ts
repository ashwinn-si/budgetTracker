import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const result = await Expense.deleteMany({ userId });
    return NextResponse.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: unknown) {
    console.error("POST /api/expenses/clear error:", error);
    return NextResponse.json({ error: "Failed to clear expenses" }, { status: 500 });
  }
}
