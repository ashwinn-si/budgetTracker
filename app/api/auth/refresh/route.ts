import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { decode } from "next-auth/jwt";
import { connectToDatabase } from "@/lib/db";
import { RefreshToken } from "@/models/RefreshToken";
import { User } from "@/models/User";
import { Tag } from "@/models/Tag";
import { verifyRefreshToken, createAndStoreRefreshToken, extractNextAuthToken } from "@/lib/auth";

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "default_nextauth_secret_dev_32_chars_12345";

export async function POST(req: NextRequest) {
  try {
    const refreshTokenCookie = req.cookies.get("refreshToken")?.value;
    const db = await connectToDatabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userDoc: any = null;

    // 1. Try refreshing via existing refreshToken cookie
    if (refreshTokenCookie) {
      const payload = verifyRefreshToken(refreshTokenCookie);
      if (payload && db) {
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

        if (matchedToken) {
          // Revoke old token (rotation)
          matchedToken.revokedAt = new Date();
          await matchedToken.save();
          userDoc = await User.findById(payload.userId);
        }
      }
    }

    // 2. Fallback: If no valid refreshToken, check for NextAuth session (Google OAuth)
    if (!userDoc) {
      const nextAuthRaw = extractNextAuthToken(req.cookies);
      if (nextAuthRaw) {
        try {
          const decoded = await decode({
            token: nextAuthRaw,
            secret: NEXTAUTH_SECRET,
          });

          if (decoded?.email && db) {
            const email = (decoded.email as string).toLowerCase();
            userDoc = await User.findOne({ email });

            // If user record doesn't exist yet, create it
            if (!userDoc) {
              userDoc = await User.create({
                name: (decoded.name as string) || "Google User",
                email,
                sheetsLinked: false,
              });

              // Initialize default tags
              const defaultTags = [
                { userId: userDoc._id.toString(), name: "Groceries", colorKey: "#22C55E" },
                { userId: userDoc._id.toString(), name: "Dining & Coffee", colorKey: "#F59E0B" },
                { userId: userDoc._id.toString(), name: "Housing & Bills", colorKey: "#3B82F6" },
                { userId: userDoc._id.toString(), name: "Health & Gym", colorKey: "#EC4899" },
                { userId: userDoc._id.toString(), name: "Transport", colorKey: "#14B8A6" },
                { userId: userDoc._id.toString(), name: "Entertainment", colorKey: "#8B5CF6" },
              ];
              await Tag.insertMany(defaultTags);
            }
          }
        } catch (err) {
          console.error("NextAuth token decode error in refresh:", err);
        }
      }
    }

    // 3. If neither authentication method yielded a user, return 401
    if (!userDoc) {
      return NextResponse.json({ error: "No active session or valid refresh token" }, { status: 401 });
    }

    // 4. Issue new JWT accessToken and store persistent refreshToken
    const { accessToken, refreshToken: newRefreshToken } = await createAndStoreRefreshToken({
      _id: userDoc._id.toString(),
      email: userDoc.email,
      name: userDoc.name,
    });

    const response = NextResponse.json({
      accessToken,
      user: {
        id: userDoc._id.toString(),
        name: userDoc.name,
        email: userDoc.email,
        currency: userDoc.currency || "INR",
        sheetsLinked: Boolean(userDoc.sheetsLinked || userDoc.googleAccessToken),
        sheetsLastSyncedAt: userDoc.sheetsLastSyncedAt,
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
