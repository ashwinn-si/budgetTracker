import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { connectToDatabase } from "./db";
import { RefreshToken } from "@/models/RefreshToken";
import { User, IUser } from "@/models/User";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "default_dev_access_secret_32_chars_long_12345";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "default_dev_refresh_secret_32_chars_long_67890";

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "30d" });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function createAndStoreRefreshToken(
  user: { _id: string; email: string; name: string },
  deviceInfo = "web"
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload: TokenPayload = {
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const tokenHash = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await connectToDatabase();
  await RefreshToken.create({
    userId: user._id.toString(),
    tokenHash,
    deviceInfo,
    expiresAt,
  });

  return { accessToken, refreshToken };
}

export async function getCurrentUser(req?: NextRequest): Promise<TokenPayload | null> {
  // Check authorization header first
  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);
      if (payload) return payload;
    }
  }

  // Check refresh cookie as fallback or for silent refresh
  try {
    const cookieStore = await cookies();
    const refreshCookie = cookieStore.get("refreshToken")?.value;
    if (refreshCookie) {
      const payload = verifyRefreshToken(refreshCookie);
      if (payload) return payload;
    }
  } catch {
    // cookies() unavailable in some execution contexts
  }

  return null;
}
