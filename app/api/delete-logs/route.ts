import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { DeleteLog } from "@/models/DeleteLog";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ success: true, deleteLogs: [] });
    }

    const deleteLogs = await DeleteLog.find({ userId }).sort({ deletedAt: -1 });
    return NextResponse.json({ success: true, deleteLogs });
  } catch (error: unknown) {
    console.error("GET /api/delete-logs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch delete logs" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all") === "true";

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ success: true });
    }

    if (all) {
      await DeleteLog.deleteMany({ userId });
      return NextResponse.json({ success: true, message: "All delete logs permanently cleared" });
    }

    if (!id) {
      return NextResponse.json({ error: "Log ID is required" }, { status: 400 });
    }

    await DeleteLog.deleteOne({
      userId,
      $or: [{ _id: id }, { entityId: id }],
    });

    return NextResponse.json({ success: true, message: "Delete log removed" });
  } catch (error: unknown) {
    console.error("DELETE /api/delete-logs error:", error);
    return NextResponse.json(
      { error: "Failed to delete log entry" },
      { status: 500 }
    );
  }
}
