import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Trip } from "@/models/Trip";
import { User } from "@/models/User";
import { getCurrentUser } from "@/lib/auth";
import { listTripsSorted } from "@/lib/server/trips";
import { spreadsheetUrl, trashSpreadsheet, tripSpreadsheetTitle } from "@/lib/server/googleSheets";
import { syncTripToSheet } from "@/lib/server/sheetsSync";
import { GENERAL_TRIP_ID } from "@/lib/trips";

export async function GET(req: NextRequest) {
  try {
    const userSession = await getCurrentUser(req);
    const userId = userSession?.userId;
    if (!userId) {
      return NextResponse.json({ linked: false }, { status: 401 });
    }

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ linked: false }, { status: 404 });
    }

    const tripId = new URL(req.url).searchParams.get("tripId")?.trim() || GENERAL_TRIP_ID;
    const trips = await listTripsSorted(userId);

    const sheets = trips
      .filter((t) => t.sheetsSpreadsheetId)
      .map((t) => ({
        tripId: t.tripId,
        name: t.name,
        emoji: t.emoji || "",
        title: tripSpreadsheetTitle(t.name),
        spreadsheetId: t.sheetsSpreadsheetId!,
        url: spreadsheetUrl(t.sheetsSpreadsheetId!),
        lastSyncedAt: t.sheetsLastSyncedAt || null,
      }));

    return NextResponse.json({
      linked: Boolean(user.sheetsLinked || user.googleAccessToken),
      lastSyncedAt: user.sheetsLastSyncedAt || null,
      trip: sheets.find((s) => s.tripId === tripId) || null,
      sheets,
    });
  } catch (error: unknown) {
    console.error("GET /api/export/sheets error:", error);
    return NextResponse.json({ error: "Failed to fetch sheets info" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userSession = await getCurrentUser(req);
    const userId = userSession?.userId;

    const db = await connectToDatabase();
    if (!db || !userId) {
      return NextResponse.json(
        { error: "Please log in with Google to sync to Google Sheets." },
        { status: 401 }
      );
    }

    const user = await User.findById(userId);
    if (!user || !user.googleAccessToken) {
      return NextResponse.json(
        {
          error:
            "Google Sheets is not linked. Sign in with Google with spreadsheets scope enabled.",
        },
        { status: 400 }
      );
    }

    // Parse options from body or query params
    let startDateParam: string | null = null;
    let endDateParam: string | null = null;
    let tagIdsParam: string[] = [];
    let isFresh = false;
    let tripIdParam = GENERAL_TRIP_ID;

    try {
      const body = await req.json();
      if (body) {
        startDateParam = body.startDate || null;
        endDateParam = body.endDate || null;
        if (Array.isArray(body.tagIds)) {
          tagIdsParam = body.tagIds;
        }
        if (typeof body.tripId === "string" && body.tripId.trim()) {
          tripIdParam = body.tripId.trim();
        }
        if (body.action === "fresh" || body.reset === true || body.fresh === true) {
          isFresh = true;
        }
      }
    } catch {
      // Body may be empty
    }

    const url = new URL(req.url);
    if (!startDateParam || !endDateParam) {
      startDateParam = startDateParam || url.searchParams.get("startDate");
      endDateParam = endDateParam || url.searchParams.get("endDate");
      if (tagIdsParam.length === 0) {
        const qTagIds = url.searchParams.get("tagIds")?.split(",").filter(Boolean);
        if (qTagIds) tagIdsParam = qTagIds;
      }
    }
    if (tripIdParam === GENERAL_TRIP_ID) {
      const qTripId = url.searchParams.get("tripId")?.trim();
      if (qTripId) tripIdParam = qTripId;
    }
    if (!isFresh) {
      const qAction = url.searchParams.get("action");
      const qReset = url.searchParams.get("reset");
      if (qAction === "fresh" || qReset === "true") {
        isFresh = true;
      }
    }

    const userTrips = await listTripsSorted(userId);
    const trip = await Trip.findOne({ userId, tripId: tripIdParam });
    if (!trip) {
      return NextResponse.json(
        { error: "This trip hasn't reached the server yet. Sync your data and try again." },
        { status: 404 }
      );
    }

    const result = await syncTripToSheet({
      user,
      trip,
      userTrips,
      fresh: isFresh,
      startDate: startDateParam,
      endDate: endDateParam,
      tagIds: tagIdsParam,
    });

    const title = tripSpreadsheetTitle(trip.name);
    const message =
      result.action === "create"
        ? `Created "${title}" in your Google Drive.`
        : result.action === "fresh"
        ? `Rebuilt "${title}" from scratch. The link stays the same.`
        : `Updated "${title}" with the latest transactions.`;

    return NextResponse.json({
      success: true,
      action: result.action,
      spreadsheetId: result.spreadsheetId,
      url: spreadsheetUrl(result.spreadsheetId),
      title,
      lastSyncedAt: result.syncedAt,
      tripLastSyncedAt: result.syncedAt,
      message,
    });
  } catch (error: unknown) {
    console.error("Google Sheets sync error:", error);
    let message = error instanceof Error ? error.message : "Sync failed";
    if (message.includes("invalid_grant") || message.includes("401")) {
      message = "Google authorization expired. Please sign out and sign in with Google again.";
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Unlink: moves every trip's sheet (and any legacy combined sheet) to Drive trash and forgets them.
export async function DELETE(req: NextRequest) {
  try {
    const userSession = await getCurrentUser(req);
    const userId = userSession?.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const trips = await Trip.find({ userId, sheetsSpreadsheetId: { $nin: [null, ""] } }).lean();
    const spreadsheetIds = new Set(trips.map((t) => t.sheetsSpreadsheetId!));
    if (user.sheetsSpreadsheetId) spreadsheetIds.add(user.sheetsSpreadsheetId);

    for (const spreadsheetId of spreadsheetIds) {
      await trashSpreadsheet(user, spreadsheetId);
    }

    await Trip.updateMany(
      { userId },
      { $set: { sheetsSpreadsheetId: null, sheetsLastSyncedAt: null } }
    );
    user.sheetsLinked = false;
    user.sheetsSpreadsheetId = null;
    user.sheetsLastSyncedAt = null;
    await user.save();

    return NextResponse.json({
      success: true,
      message: "Google Sheets unlinked. Your trip sheets were moved to Drive trash.",
    });
  } catch (error: unknown) {
    console.error("DELETE /api/export/sheets error:", error);
    return NextResponse.json({ error: "Failed to unlink Google Sheet" }, { status: 500 });
  }
}
