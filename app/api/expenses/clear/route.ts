import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { Saving } from "@/models/Saving";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/expenses/clear
 *
 * Deletes ALL expenses AND savings for the authenticated user from MongoDB.
 * The client is responsible for also clearing IndexedDB (Dexie) and the
 * sync queue after this returns 200.
 *
 * Auth: Bearer token (Authorization header) OR refreshToken cookie.
 */
export async function POST(req: NextRequest) {
  try {
    // Support both Bearer token (for cross-browser reliability) and cookie auth
    const user = await getCurrentUser(req);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const userId = user.userId;

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable. Try again shortly." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({} as { tripId?: unknown }));
    const tripId = typeof body?.tripId === "string" && body.tripId ? body.tripId : undefined;

    if (tripId) {
      // Trip-scoped clear — savings are global, so leave them alone.
      const expResult = await Expense.deleteMany({ userId, tripId });
      return NextResponse.json({
        success: true,
        deletedExpenses: expResult.deletedCount,
        deletedSavings: 0,
      });
    }

    // Delete both expenses AND savings so a full reset is truly complete
    const [expResult, savResult] = await Promise.all([
      Expense.deleteMany({ userId }),
      Saving.deleteMany({ userId }),
    ]);

    return NextResponse.json({
      success: true,
      deletedExpenses: expResult.deletedCount,
      deletedSavings: savResult.deletedCount,
    });
  } catch (error: unknown) {
    console.error("POST /api/expenses/clear error:", error);
    return NextResponse.json(
      { error: "Failed to clear data" },
      { status: 500 }
    );
  }
}
