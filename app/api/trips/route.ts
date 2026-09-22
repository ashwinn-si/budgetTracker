import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  listTripsSorted,
  upsertTrip,
  updateTrip,
  deleteTripCascade,
} from "@/lib/server/trips";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ error: "Database unavailable. Try again shortly." }, { status: 503 });
    }

    const trips = await listTripsSorted(user.userId);
    return NextResponse.json({ trips });
  } catch (error: unknown) {
    console.error("GET /api/trips error:", error);
    return NextResponse.json({ error: "Failed to load trips" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ error: "Database unavailable. Try again shortly." }, { status: 503 });
    }

    const result = await upsertTrip(user.userId, payload);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json({ trip: result.trip });
  } catch (error: unknown) {
    console.error("POST /api/trips error:", error);
    return NextResponse.json({ error: "Failed to create trip" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
    }

    const tripId = typeof payload.tripId === "string" ? payload.tripId : "";
    if (!tripId) {
      return NextResponse.json({ error: "tripId is required" }, { status: 400 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ error: "Database unavailable. Try again shortly." }, { status: 503 });
    }

    const result = await updateTrip(user.userId, tripId, payload);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json({ trip: result.trip });
  } catch (error: unknown) {
    console.error("PUT /api/trips error:", error);
    return NextResponse.json({ error: "Failed to update trip" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId");
    if (!tripId) {
      return NextResponse.json({ error: "tripId is required" }, { status: 400 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ error: "Database unavailable. Try again shortly." }, { status: 503 });
    }

    const result = await deleteTripCascade(user.userId, tripId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/trips error:", error);
    return NextResponse.json({ error: "Failed to delete trip" }, { status: 500 });
  }
}
