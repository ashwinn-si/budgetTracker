import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const userSession = await getCurrentUser(req);
    if (!userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ currency: "INR" });
    }

    const user = await User.findById(userSession.userId);
    return NextResponse.json({
      currency: user?.currency || "INR",
    });
  } catch (error: unknown) {
    console.error("GET /api/user/preferences error:", error);
    return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userSession = await getCurrentUser(req);
    if (!userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { currency } = body;

    if (!currency || typeof currency !== "string") {
      return NextResponse.json({ error: "Valid currency code is required" }, { status: 400 });
    }

    const db = await connectToDatabase();
    if (db) {
      await User.findByIdAndUpdate(userSession.userId, { currency: currency.toUpperCase() });
    }

    return NextResponse.json({
      success: true,
      currency: currency.toUpperCase(),
    });
  } catch (error: unknown) {
    console.error("PATCH /api/user/preferences error:", error);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}
