import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import connectToDatabase from "@/lib/db";
import { User } from "@/models/User";
import crypto from "crypto";

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { isSharingEnabled } = body;

    if (typeof isSharingEnabled !== "boolean") {
      return NextResponse.json(
        { error: "isSharingEnabled must be a boolean" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Fetch current user from DB
    const dbUser = await User.findById(user.id);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate a shareId if one doesn't exist and they are enabling sharing
    let shareId = dbUser.shareId;
    if (isSharingEnabled && !shareId) {
      shareId = crypto.randomUUID();
    }

    dbUser.isSharingEnabled = isSharingEnabled;
    if (shareId) {
      dbUser.shareId = shareId;
    }

    await dbUser.save();

    return NextResponse.json({
      success: true,
      isSharingEnabled: dbUser.isSharingEnabled,
      shareId: dbUser.shareId,
    });
  } catch (error: unknown) {
    console.error("Error updating sharing preferences:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
