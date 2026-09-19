import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import { RefreshToken } from "@/models/RefreshToken";
import { User } from "@/models/User";
import { verifyRefreshToken, createAndStoreRefreshToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const refreshTokenCookie = req.cookies.get("refreshToken")?.value;

    if (!refreshTokenCookie) {
      return NextResponse.json({ error: "No refresh token provided" }, { status: 401 });
    }

    const payload = verifyRefreshToken(refreshTokenCookie);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
    }

    const db = await connectToDatabase();
    if (!db) {
      // Local fallback
      return NextResponse.json({
        accessToken: "local_dev_token",
        user: { id: "local_user", name: "Local User", email: "user@local.dev" },
      });
    }

    // Find valid non-revoked refresh tokens for this user
    const tokens = await RefreshToken.find({
      userId: payload.userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    let matchedToken = null;
    for (const tokenDoc of tokens) {
      const isMatch = await bcrypt.compare(refreshTokenCookie, tokenDoc.tokenHash);
      if (isMatch) {
        matchedToken = tokenDoc;
        break;
      }
    }

    if (!matchedToken) {
      return NextResponse.json({ error: "Refresh token revoked or expired" }, { status: 401 });
    }

    // Revoke the old token (token rotation)
    matchedToken.revokedAt = new Date();
    await matchedToken.save();

    const user = await User.findById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Issue new pair
    const { accessToken, refreshToken: newRefreshToken } = await createAndStoreRefreshToken({
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
    });

    const response = NextResponse.json({
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        sheetsLinked: user.sheetsLinked,
        sheetsLastSyncedAt: user.sheetsLastSyncedAt,
      },
    });

    response.cookies.set("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    console.error("Token refresh error:", error);
    return NextResponse.json({ error: "Could not refresh token" }, { status: 500 });
  }
}
