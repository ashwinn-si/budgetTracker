import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import { RefreshToken } from "@/models/RefreshToken";
import { verifyRefreshToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const refreshTokenCookie = req.cookies.get("refreshToken")?.value;

    if (refreshTokenCookie) {
      const payload = verifyRefreshToken(refreshTokenCookie);
      if (payload) {
        const db = await connectToDatabase();
        if (db) {
          const tokens = await RefreshToken.find({ userId: payload.userId, revokedAt: null });
          for (const tokenDoc of tokens) {
            const isMatch = await bcrypt.compare(refreshTokenCookie, tokenDoc.tokenHash);
            if (isMatch) {
              tokenDoc.revokedAt = new Date();
              await tokenDoc.save();
              break;
            }
          }
        }
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete("refreshToken");
    return response;
  } catch (error: unknown) {
    console.error("Logout error:", error);
    const response = NextResponse.json({ success: true });
    response.cookies.delete("refreshToken");
    return response;
  }
}
