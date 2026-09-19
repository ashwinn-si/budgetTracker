import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { createAndStoreRefreshToken } from "@/lib/auth";
import { DEMO_USER_EMAIL, DEMO_USER_PASSWORD, ensureDemoUserSeeded } from "@/lib/demoUser";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    const isDemoLogin =
      email.toLowerCase() === DEMO_USER_EMAIL.toLowerCase() &&
      password === DEMO_USER_PASSWORD;

    if (!db) {
      // Local/offline mock user
      if (isDemoLogin) {
        return NextResponse.json({
          user: { id: "demo_user", name: "Demo User", email: DEMO_USER_EMAIL, currency: "USD" },
          accessToken: "demo_dev_token",
        });
      }
      return NextResponse.json({
        user: { id: "local_user", name: "Local User", email },
        accessToken: "local_dev_token",
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let user: any = await User.findOne({ email: email.toLowerCase() });
    if (isDemoLogin) {
      // Auto-ensure demo user exists
      user = await ensureDemoUserSeeded();
    }

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const { accessToken, refreshToken } = await createAndStoreRefreshToken({
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
    });

    const response = NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        currency: user.currency || "INR",
        sheetsLinked: user.sheetsLinked,
        sheetsSpreadsheetId: user.sheetsSpreadsheetId || null,
        sheetsLastSyncedAt: user.sheetsLastSyncedAt,
      },
      accessToken,
    });

    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during login." },
      { status: 500 }
    );
  }
}
