import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { Tag } from "@/models/Tag";
import { User } from "@/models/User";
import { getCurrentUser } from "@/lib/auth";
import { getCurrencyInfo } from "@/lib/currency";

function formatDateDisplay(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: NextRequest) {
  try {
    const userSession = await getCurrentUser(req);
    const userId = userSession?.userId;
    if (!userId) {
      return NextResponse.json({ linked: false }, { status: 401 });
    }

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ linked: false }, { status: 404 });
    }

    const spreadsheetId = user.sheetsSpreadsheetId || null;
    return NextResponse.json({
      linked: Boolean(user.sheetsLinked || user.googleAccessToken),
      spreadsheetId,
      url: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null,
      lastSyncedAt: user.sheetsLastSyncedAt || null,
    });
  } catch (error: unknown) {
    console.error("GET /api/export/sheets error:", error);
    return NextResponse.json({ error: "Failed to fetch sheets info" }, { status: 500 });
  }
}

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

    // Parse options from body or query params
    let startDateParam: string | null = null;
    let endDateParam: string | null = null;
    let tagIdsParam: string[] = [];

    try {
      const body = await req.json();
      if (body) {
        startDateParam = body.startDate || null;
        endDateParam = body.endDate || null;
        if (Array.isArray(body.tagIds)) {
          tagIdsParam = body.tagIds;
        }
      }
    } catch {
      // Body may be empty
    }

    if (!startDateParam || !endDateParam) {
      const url = new URL(req.url);
      startDateParam = startDateParam || url.searchParams.get("startDate");
      endDateParam = endDateParam || url.searchParams.get("endDate");
      if (tagIdsParam.length === 0) {
        const qTagIds = url.searchParams.get("tagIds")?.split(",").filter(Boolean);
        if (qTagIds) tagIdsParam = qTagIds;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = { userId };
    const parsedStartDate = startDateParam ? new Date(startDateParam) : null;
    const parsedEndDate = endDateParam ? new Date(endDateParam) : null;

    if (parsedStartDate || parsedEndDate) {
      filter.date = {};
      if (parsedStartDate) filter.date.$gte = parsedStartDate;
      if (parsedEndDate) {
        const endOfDay = new Date(parsedEndDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.date.$lte = endOfDay;
      }
    }

    if (tagIdsParam.length > 0) {
      filter.tagIds = { $in: tagIdsParam };
    }

    // Fetch user's expenses sorted oldest first
    const expenses = await Expense.find(filter)
      .sort({ date: 1 })
      .populate("tagIds")
      .lean();

    const currencyInfo = getCurrencyInfo(user?.currency);

    // Prepare expenses data
    const expensesData = expenses.map((exp) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawTags: any[] = (exp.tagIds as any[]) || [];
      const tags = rawTags
        .map((t) => (typeof t === "object" ? t.name : String(t)))
        .filter(Boolean);

      return {
        date: new Date(exp.date),
        dateStr: formatDateISO(new Date(exp.date)),
        note: exp.note || "",
        tags: tags.length > 0 ? [...tags].sort() : ["Uncategorized"],
        amount: typeof exp.amount === "number" ? exp.amount : parseFloat(exp.amount) || 0,
      };
    });

    let startLabel = "All Time";
    let endLabel = "All Time";
    let startFileStr = "";
    let endFileStr = "";

    if (parsedStartDate && parsedEndDate) {
      startLabel = formatDateDisplay(parsedStartDate);
      endLabel = formatDateDisplay(parsedEndDate);
      startFileStr = formatDateISO(parsedStartDate);
      endFileStr = formatDateISO(parsedEndDate);
    } else if (expensesData.length > 0) {
      startLabel = formatDateDisplay(expensesData[0].date);
      endLabel = formatDateDisplay(expensesData[expensesData.length - 1].date);
      startFileStr = formatDateISO(expensesData[0].date);
      endFileStr = formatDateISO(expensesData[expensesData.length - 1].date);
    } else {
      const now = new Date();
      startLabel = formatDateDisplay(now);
      endLabel = formatDateDisplay(now);
      startFileStr = formatDateISO(now);
      endFileStr = formatDateISO(now);
    }

    let tagLabel = "All";
    if (tagIdsParam.length > 0) {
      const foundTags = await Tag.find({ _id: { $in: tagIdsParam } }).lean();
      tagLabel = foundTags.map((t) => t.name).sort().join(", ") || "All";
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

    // Build Tab 1 ("Expenses") rows
    const expensesRows: (string | number)[][] = [
      ["Budget Tracker — Expense Export", "", "", ""],
      [`Period: ${startLabel} – ${endLabel}`, "", "", ""],
      [`Tags: ${tagLabel}`, "", "", ""],
      [`Generated: ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`, "", "", ""],
      ["", "", "", ""],
      ["Date", "Note", "Tags", "Amount"],
    ];

    for (const exp of expensesData) {
      expensesRows.push([
        exp.dateStr,
        exp.note,
        exp.tags.join(", "),
        exp.amount,
      ]);
    }

    const lastExpenseRow = Math.max(7, expensesRows.length);
    expensesRows.push(["", "", "", ""]); // blank spacer
    expensesRows.push(["", "Total", "", `=SUM(D7:D${lastExpenseRow})`]);

    // Build Tab 2 ("Summary by Tag") rows
    const tagAggregation = new Map<string, { total: number; count: number }>();
    let grandTagSum = 0;

    for (const exp of expensesData) {
      for (const tag of exp.tags) {
        const existing = tagAggregation.get(tag) || { total: 0, count: 0 };
        existing.total += exp.amount;
        existing.count += 1;
        tagAggregation.set(tag, existing);
        grandTagSum += exp.amount;
      }
    }

    const sortedTags = Array.from(tagAggregation.entries())
      .map(([name, stats]) => ({
        tag: name,
        total: stats.total,
        count: stats.count,
        pct: grandTagSum > 0 ? stats.total / grandTagSum : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const summaryRows: (string | number)[][] = [
      ["Spend by Tag", "", "", ""],
      [`Period: ${startLabel} – ${endLabel}`, "", "", ""],
      ["", "", "", ""],
      ["Tag", "Total", "Transactions", "% of Total"],
    ];

    let summaryStartRow = 5;
    for (let i = 0; i < sortedTags.length; i++) {
      const item = sortedTags[i];
      const currentRow = summaryStartRow + i;
      summaryRows.push([
        item.tag,
        item.total,
        item.count,
        `=B${currentRow}/$B$${summaryStartRow + sortedTags.length}`,
      ]);
    }

    const summaryEndRow = Math.max(summaryStartRow, summaryStartRow + sortedTags.length - 1);
    const summaryTotalRow = summaryEndRow + 1;

    summaryRows.push([
      "Total",
      `=SUM(B5:B${summaryEndRow})`,
      `=SUM(C5:C${summaryEndRow})`,
      `=SUM(D5:D${summaryEndRow})`,
    ]);
    summaryRows.push(["", "", "", ""]);
    summaryRows.push([
      "Expenses with more than one tag are counted under each of their tags, so this total may exceed the overall total in the Expenses tab.",
      "",
      "",
      "",
    ]);

    const sheetTitle = `Budget Tracker Export — ${startFileStr} to ${endFileStr}`;

    // Create a new spreadsheet with the exact 2 tabs and structure
    const createRes = await (sheets.spreadsheets.create as any)({
      requestBody: {
        properties: {
          title: sheetTitle,
        },
        sheets: [
          {
            properties: {
              sheetId: 0,
              title: "Expenses",
              tabColor: { red: 0.133, green: 0.773, blue: 0.369 },
              gridProperties: {
                frozenRowCount: 6,
              },
            },
          },
          {
            properties: {
              sheetId: 1,
              title: "Summary by Tag",
              tabColor: { red: 0.133, green: 0.773, blue: 0.369 },
              gridProperties: {
                frozenRowCount: 4,
                hideGridlines: true,
              },
            },
          },
        ],
      },
    });

    const spreadsheetId = createRes.data.spreadsheetId;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Could not create spreadsheet" },
        { status: 500 }
      );
    }

    // Populate data in both tabs
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          {
            range: `'Expenses'!A1:D${expensesRows.length}`,
            values: expensesRows,
          },
          {
            range: `'Summary by Tag'!A1:D${summaryRows.length}`,
            values: summaryRows,
          },
        ],
      },
    });

    // Apply formatting batchUpdate
    // Emerald color: { red: 0.133, green: 0.773, blue: 0.369 }
    const greenColor = { red: 0.133, green: 0.773, blue: 0.369 };
    const whiteColor = { red: 1, green: 1, blue: 1 };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattingRequests: any[] = [
      // --- Expenses Tab Formatting ---
      // Merge Title A1:D1
      {
        mergeCells: {
          range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: "MERGE_ALL",
        },
      },
      // Title text style
      {
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, fontSize: 14, foregroundColor: greenColor },
            },
          },
          fields: "userEnteredFormat.textFormat",
        },
      },
      // Header row styling (row 6: index 5 to 6)
      {
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              backgroundColor: greenColor,
              textFormat: { bold: true, fontSize: 11, foregroundColor: whiteColor },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      },
      // AutoFilter on header row
      {
        setBasicFilter: {
          filter: {
            range: { sheetId: 0, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 4 },
          },
        },
      },
      // Column widths for Expenses (16, 34, 26, 16 in character width ~ 120px, 240px, 180px, 120px)
      {
        updateDimensionProperties: {
          range: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 120 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: 0, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
          properties: { pixelSize: 240 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: 0, dimension: "COLUMNS", startIndex: 2, endIndex: 3 },
          properties: { pixelSize: 180 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: 0, dimension: "COLUMNS", startIndex: 3, endIndex: 4 },
          properties: { pixelSize: 120 },
          fields: "pixelSize",
        },
      },
      // Expenses Amount column number format (D7:D)
      {
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 6, endRowIndex: expensesRows.length, startColumnIndex: 3, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              numberFormat: { type: "CURRENCY", pattern: `"${currencyInfo.symbol}"#,##0.00` },
              horizontalAlignment: "RIGHT",
            },
          },
          fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
        },
      },

      // --- Summary by Tag Tab Formatting ---
      // Merge Title A1:D1
      {
        mergeCells: {
          range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: "MERGE_ALL",
        },
      },
      // Title text style
      {
        repeatCell: {
          range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, fontSize: 14, foregroundColor: greenColor },
            },
          },
          fields: "userEnteredFormat.textFormat",
        },
      },
      // Header row styling (row 4: index 3 to 4)
      {
        repeatCell: {
          range: { sheetId: 1, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              backgroundColor: greenColor,
              textFormat: { bold: true, fontSize: 11, foregroundColor: whiteColor },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      },
      // Column widths for Summary by Tag (22, 16, 14, 12 ~ 160px, 120px, 100px, 90px)
      {
        updateDimensionProperties: {
          range: { sheetId: 1, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 160 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: 1, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
          properties: { pixelSize: 120 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: 1, dimension: "COLUMNS", startIndex: 2, endIndex: 3 },
          properties: { pixelSize: 100 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: 1, dimension: "COLUMNS", startIndex: 3, endIndex: 4 },
          properties: { pixelSize: 90 },
          fields: "pixelSize",
        },
      },
      // Summary Total column currency format (Col B)
      {
        repeatCell: {
          range: { sheetId: 1, startRowIndex: 4, endRowIndex: summaryTotalRow, startColumnIndex: 1, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              numberFormat: { type: "CURRENCY", pattern: `"${currencyInfo.symbol}"#,##0.00` },
              horizontalAlignment: "RIGHT",
            },
          },
          fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
        },
      },
      // Summary % of Total column percent format (Col D)
      {
        repeatCell: {
          range: { sheetId: 1, startRowIndex: 4, endRowIndex: summaryTotalRow, startColumnIndex: 3, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              numberFormat: { type: "PERCENT", pattern: "0.0%" },
              horizontalAlignment: "RIGHT",
            },
          },
          fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
        },
      },
      // Merge Footnote
      {
        mergeCells: {
          range: { sheetId: 1, startRowIndex: summaryRows.length - 1, endRowIndex: summaryRows.length, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: "MERGE_ALL",
        },
      },
      // Footnote text style (italic, muted)
      {
        repeatCell: {
          range: { sheetId: 1, startRowIndex: summaryRows.length - 1, endRowIndex: summaryRows.length, startColumnIndex: 0, endColumnIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { italic: true, fontSize: 9.5, foregroundColor: { red: 0.42, green: 0.45, blue: 0.5 } },
            },
          },
          fields: "userEnteredFormat.textFormat",
        },
      },
    ];

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: formattingRequests,
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
  } catch (error: unknown) {
    console.error("Google Sheets sync error:", error);
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userSession = await getCurrentUser(req);
    const userId = userSession?.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const oldSpreadsheetId = user.sheetsSpreadsheetId;

    // If user has googleAccessToken and an existing spreadsheetId, attempt to delete/trash from Google Drive
    if (oldSpreadsheetId && user.googleAccessToken) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({
          access_token: user.googleAccessToken,
          refresh_token: user.googleRefreshToken || undefined,
        });
        const drive = google.drive({ version: "v3", auth: oauth2Client });
        // Attempt to delete or trash the spreadsheet file
        await drive.files.delete({ fileId: oldSpreadsheetId }).catch(async () => {
          await drive.files.update({
            fileId: oldSpreadsheetId,
            requestBody: { trashed: true },
          }).catch(() => {});
        });
      } catch (driveErr) {
        console.warn("Could not delete file from Google Drive:", driveErr);
      }
    }

    // Reset user sheets state in database
    user.sheetsLinked = false;
    user.sheetsSpreadsheetId = null as any;
    user.sheetsLastSyncedAt = null as any;
    await user.save();

    return NextResponse.json({
      success: true,
      message: "Google Sheet unlinked successfully. You can now start fresh.",
    });
  } catch (error: unknown) {
    console.error("DELETE /api/export/sheets error:", error);
    return NextResponse.json({ error: "Failed to unlink Google Sheet" }, { status: 500 });
  }
}
