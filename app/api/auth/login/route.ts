import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { createAndStoreRefreshToken } from "@/lib/auth";

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
    if (!db) {
      // Local/offline mock user
      return NextResponse.json({
        user: { id: "local_user", name: "Local User", email },
        accessToken: "local_dev_token",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
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
