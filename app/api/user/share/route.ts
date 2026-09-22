import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { Trip } from "@/models/Trip";
import { ensureGeneralTrip } from "@/lib/server/trips";
import { GENERAL_TRIP_ID } from "@/lib/trips";
import crypto from "crypto";

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { isSharingEnabled } = body;
    const tripId =
      typeof body.tripId === "string" && body.tripId.trim() ? body.tripId.trim() : GENERAL_TRIP_ID;

    if (typeof isSharingEnabled !== "boolean") {
      return NextResponse.json(
        { error: "isSharingEnabled must be a boolean" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const trip =
      tripId === GENERAL_TRIP_ID
        ? await ensureGeneralTrip(user.userId)
        : await Trip.findOne({ userId: user.userId, tripId });

    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    let shareId = trip.shareId;
    if (isSharingEnabled && !shareId) {
      // Backward compat: reuse the legacy user-level shareId for General so
      // links already in circulation keep working, even before the migration ran.
      if (tripId === GENERAL_TRIP_ID) {
        const dbUser = await User.findById(user.userId);
        if (dbUser?.shareId) {
          shareId = dbUser.shareId;
        }
      }
      if (!shareId) {
        shareId = crypto.randomUUID();
      }
    }

    trip.isSharingEnabled = isSharingEnabled;
    if (shareId) {
      trip.shareId = shareId;
    }

    await trip.save();

    // Keep the legacy user-level flag in step so the old /share/<userShareId> fallback can't outlive a disable
    if (tripId === GENERAL_TRIP_ID) {
      await User.updateOne({ _id: user.userId }, { $set: { isSharingEnabled } });
    }

    return NextResponse.json({
      success: true,
      tripId: trip.tripId,
      isSharingEnabled: trip.isSharingEnabled,
      shareId: trip.shareId,
    });
  } catch (error: unknown) {
    console.error("Error updating sharing preferences:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
