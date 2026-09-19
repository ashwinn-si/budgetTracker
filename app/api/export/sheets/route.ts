import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { User } from "@/models/User";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const userSession = await getCurrentUser(req);
    const userId = userSession?.userId;

    const db = await connectToDatabase();
    if (!db || !userId) {
      return NextResponse.json(
        { error: "Please log in with Google to sync to Google Sheets." },
        { status: 401 }
      );
    }

    const user = await User.findById(userId);
    if (!user || !user.googleAccessToken) {
      return NextResponse.json(
        {
          error:
            "Google Sheets is not linked. Sign in with Google with spreadsheets scope enabled.",
        },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken || undefined,
    });

    const sheets = google.sheets({ version: "v4", auth: oauth2Client });

    // Fetch user's expenses
    const expenses = await Expense.find({ userId })
      .sort({ date: -1 })
      .populate("tagIds")
      .lean();

    const rows = [
      ["Date", "Description", "Categories", `Amount (${user?.currency || "INR"})`],
      ...expenses.map((e) => {
        const tagNames = (e.tagIds as any[])
          ?.map((t) => (typeof t === "object" ? t.name : ""))
          .filter(Boolean)
          .join(", ");
        return [
          new Date(e.date).toISOString().split("T")[0],
          e.note || "",
          tagNames || "Uncategorized",
          e.amount,
        ];
      }),
    ];

    let spreadsheetId = user.sheetsSpreadsheetId;

    if (!spreadsheetId) {
      // Create a new Google Spreadsheet
      const createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `Personal Budget Tracker (${new Date().toLocaleDateString()})`,
          },
        },
      });
      spreadsheetId = createRes.data.spreadsheetId;
    }

    if (spreadsheetId) {
      // Update values in sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "A1:D" + rows.length,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: rows,
        },
      });

      user.sheetsLinked = true;
      user.sheetsSpreadsheetId = spreadsheetId;
      user.sheetsLastSyncedAt = new Date();
      await user.save();

      return NextResponse.json({
        success: true,
        spreadsheetId,
        lastSyncedAt: user.sheetsLastSyncedAt,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      });
    }

    return NextResponse.json(
      { error: "Could not initialize spreadsheet" },
      { status: 500 }
    );
  } catch (error: unknown) {
    console.error("Google Sheets sync error:", error);
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
