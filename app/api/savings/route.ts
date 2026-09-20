import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Saving } from "@/models/Saving";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    // connectToDatabase() returns null on failure (never throws after the db.ts fix).
    // Guard here so savings pull fails gracefully instead of 500-ing when DB is down.
    const db = await connectToDatabase();
    if (!db) {
      // Return an empty list — the client will retry on next sync cycle
      return NextResponse.json({ success: true, savings: [] });
    }

    const savings = await Saving.find({ userId }).sort({ date: -1, createdAt: -1 });
    return NextResponse.json({ success: true, savings });
  } catch (error: unknown) {
    console.error("GET /api/savings error:", error);
    return NextResponse.json({ error: "Failed to fetch savings" }, { status: 500 });
  }
}
