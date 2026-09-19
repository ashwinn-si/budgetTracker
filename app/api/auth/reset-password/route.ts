import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

// In-memory or temporary cache for dev reset tokens
const resetTokenStore = new Map<string, { userId: string; expiresAt: number }>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, token, newPassword } = body;

    const db = await connectToDatabase();

    // Step 2: Handle resetting password with token
    if (token && newPassword) {
      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 }
        );
      }

      const record = resetTokenStore.get(token);
      if (!record || record.expiresAt < Date.now()) {
        return NextResponse.json(
          { error: "Invalid or expired reset token" },
          { status: 400 }
        );
      }

      if (db) {
        const user = await User.findById(record.userId);
        if (!user) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        user.passwordHash = await bcrypt.hash(newPassword, 12);
        await user.save();
      }

      resetTokenStore.delete(token);
      return NextResponse.json({ success: true, message: "Password updated successfully" });
    }

    // Step 1: Requesting reset link
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    let userId = "local_user";
    if (db) {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        // Do not leak user existence, return success message
        return NextResponse.json({
          success: true,
          message: "If an account exists, a reset link has been dispatched.",
        });
      }
      userId = user._id.toString();
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    resetTokenStore.set(resetToken, { userId, expiresAt });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5173";
    const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

    // If SMTP credentials are configured, dispatch real email
    const smtpHost = process.env.EMAIL_SERVER_HOST || process.env.SMTP_HOST;
    const smtpPort = Number(process.env.EMAIL_SERVER_PORT || process.env.SMTP_PORT) || 587;
    const smtpUser = process.env.EMAIL_SERVER_USER || process.env.SMTP_USER;
    const smtpPass = process.env.EMAIL_SERVER_PASSWORD || process.env.SMTP_PASS;
    const smtpFrom = process.env.EMAIL_FROM || process.env.SMTP_FROM || `"BudgetFlow" <${smtpUser}>`;

    if (smtpHost && smtpUser && smtpPass) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        await transporter.sendMail({
          from: smtpFrom,
          to: email,
          subject: "Reset your BudgetFlow password",
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #F5F0E8;">
              <h2 style="color: #16281A; font-size: 22px;">Reset Your Password</h2>
              <p style="color: #3A4F3D; font-size: 14px; line-height: 1.6;">
                We received a request to reset your password for your BudgetFlow account. Click the button below to choose a new password:
              </p>
              <div style="margin: 24px 0;">
                <a href="${resetUrl}" style="background-color: #22C55E; color: #ffffff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; display: inline-block;">
                  Reset Password
                </a>
              </div>
              <p style="color: #7A8C7C; font-size: 12px;">
                This link will expire in 1 hour. If you did not make this request, you can safely ignore this email.
              </p>
            </div>
          `,
        });
      } catch (mailError) {
        console.error("Failed to send transactional email:", mailError);
      }
    }

    console.log("==========================================");
    console.log("🔐 PASSWORD RESET LINK (DEV MODE):");
    console.log(resetUrl);
    console.log("==========================================");

    return NextResponse.json({
      success: true,
      message: "If an account exists, a reset link has been dispatched.",
      devResetUrl: process.env.NODE_ENV !== "production" ? resetUrl : undefined,
    });
  } catch (error: unknown) {
    console.error("Password reset error:", error);
    return NextResponse.json(
      { error: "Failed to process password reset request." },
      { status: 500 }
    );
  }
}
