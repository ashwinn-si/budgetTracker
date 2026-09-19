import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";
import { connectToDatabase } from "./db";
import { RefreshToken } from "@/models/RefreshToken";
import { User, IUser } from "@/models/User";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "default_dev_access_secret_32_chars_long_12345";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "default_dev_refresh_secret_32_chars_long_67890";
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "default_nextauth_secret_dev_32_chars_12345";

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

export function extractNextAuthToken(cookieStore: {
  get: (name: string) => { value: string } | undefined;
}): string | null {
  // Check direct standard cookies
  const direct =
    cookieStore.get("__Secure-next-auth.session-token")?.value ||
    cookieStore.get("next-auth.session-token")?.value;
  if (direct) return direct;

  // Check chunked cookies (.0, .1, etc.)
  const isSecure = Boolean(cookieStore.get("__Secure-next-auth.session-token.0")?.value);
  const prefix = isSecure
    ? "__Secure-next-auth.session-token"
    : cookieStore.get("next-auth.session-token.0")?.value
    ? "next-auth.session-token"
    : null;

  if (prefix) {
    let assembled = "";
    let i = 0;
    while (cookieStore.get(`${prefix}.${i}`)?.value) {
      assembled += cookieStore.get(`${prefix}.${i}`)!.value;
      i++;
    }
    return assembled || null;
  }

  return null;
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
  // 1. Check authorization header first (Bearer token)
  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);
      if (payload) return payload;
    }
  }

  // 2. Check refresh cookie
  try {
    const cookieStore = req ? req.cookies : await cookies();
    const refreshCookie = cookieStore.get("refreshToken")?.value;
    if (refreshCookie) {
      const payload = verifyRefreshToken(refreshCookie);
      if (payload) return payload;
    }

    // 3. Fallback: Check NextAuth session token (for Google OAuth users)
    const nextAuthRaw = extractNextAuthToken(cookieStore);
    if (nextAuthRaw) {
      const decoded = await decode({
        token: nextAuthRaw,
        secret: NEXTAUTH_SECRET,
      });

      if (decoded?.email) {
        await connectToDatabase();
        const dbUser = await User.findOne({ email: (decoded.email as string).toLowerCase() });
        if (dbUser) {
          return {
            userId: dbUser._id.toString(),
            email: dbUser.email,
            name: dbUser.name,
          };
        }
      }
    }
  } catch {
    // cookies() or DB lookup unavailable in current execution context
  }

  return null;
}
