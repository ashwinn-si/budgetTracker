import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { Tag } from "@/models/Tag";
import { createAndStoreRefreshToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    if (!db) {
      // Offline / Local mock mode
      return NextResponse.json({
        user: { id: "local_user", name, email },
        accessToken: "local_dev_token",
        message: "Offline / Local Mode Active",
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
    });

    // Create default tags for the new user
    const defaultTags = [
      { userId: user._id.toString(), name: "Groceries", colorKey: "#22C55E" },
      { userId: user._id.toString(), name: "Dining & Coffee", colorKey: "#F59E0B" },
      { userId: user._id.toString(), name: "Housing & Bills", colorKey: "#3B82F6" },
      { userId: user._id.toString(), name: "Health & Gym", colorKey: "#EC4899" },
      { userId: user._id.toString(), name: "Transport", colorKey: "#14B8A6" },
      { userId: user._id.toString(), name: "Entertainment", colorKey: "#8B5CF6" },
    ];
    await Tag.insertMany(defaultTags);

    const { accessToken, refreshToken } = await createAndStoreRefreshToken({
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
    });

    const response = NextResponse.json({
      user: { id: user._id.toString(), name: user.name, email: user.email },
      accessToken,
    });

    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Failed to create account. Please try again." },
      { status: 500 }
    );
  }
}
