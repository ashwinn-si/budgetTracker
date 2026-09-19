import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Saving } from "@/models/Saving";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    await connectToDatabase();

    const savings = await Saving.find({ userId }).sort({ date: -1, createdAt: -1 });
    return NextResponse.json({ success: true, savings });
  } catch (error: unknown) {
    console.error("GET /api/savings error:", error);
    return NextResponse.json({ error: "Failed to fetch savings" }, { status: 500 });
  }
}
