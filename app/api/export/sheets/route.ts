import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { Tag } from "@/models/Tag";
import { User } from "@/models/User";
import { getCurrentUser } from "@/lib/auth";
import { getCurrencyInfo } from "@/lib/currency";
import { listTripsSorted } from "@/lib/server/trips";
import { GENERAL_TRIP_ID, getVisibleTripIds, tripIdMatchValues } from "@/lib/trips";

function sanitizeSheetTitle(title: string): string {
  return title.replace(/[[\]*?/\\:]/g, "").slice(0, 100);
}

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
    let isFresh = false;
    let tripIdParam = GENERAL_TRIP_ID;

    try {
      const body = await req.json();
      if (body) {
        startDateParam = body.startDate || null;
        endDateParam = body.endDate || null;
        if (Array.isArray(body.tagIds)) {
          tagIdsParam = body.tagIds;
        }
        if (typeof body.tripId === "string" && body.tripId.trim()) {
          tripIdParam = body.tripId.trim();
        }
        if (body.action === "fresh" || body.reset === true || body.fresh === true) {
          isFresh = true;
        }
      }
    } catch {
      // Body may be empty
    }

    const url = new URL(req.url);
    if (!startDateParam || !endDateParam) {
      startDateParam = startDateParam || url.searchParams.get("startDate");
      endDateParam = endDateParam || url.searchParams.get("endDate");
      if (tagIdsParam.length === 0) {
        const qTagIds = url.searchParams.get("tagIds")?.split(",").filter(Boolean);
        if (qTagIds) tagIdsParam = qTagIds;
      }
    }
    if (tripIdParam === GENERAL_TRIP_ID) {
      const qTripId = url.searchParams.get("tripId")?.trim();
      if (qTripId) tripIdParam = qTripId;
    }
    if (!isFresh) {
      const qAction = url.searchParams.get("action");
      const qReset = url.searchParams.get("reset");
      if (qAction === "fresh" || qReset === "true") {
        isFresh = true;
      }
    }

    const userTrips = await listTripsSorted(userId);
    const tripsById = new Map(userTrips.map((t) => [t.tripId, t]));
    const activeTripDoc = tripsById.get(tripIdParam);
    const isGeneralTrip = tripIdParam === GENERAL_TRIP_ID;
    const activeTripName = activeTripDoc?.name || (isGeneralTrip ? "General" : "Trip");

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

    const visibleTripIds = getVisibleTripIds(userTrips, tripIdParam);
    filter.tripId = { $in: tripIdMatchValues(visibleTripIds) };

    // Fetch user's expenses sorted oldest first
    const expenses = await Expense.find(filter)
      .sort({ date: 1 })
      .populate("tagIds")
      .lean();

    const currencyInfo = getCurrencyInfo(user?.currency);

    // Prepare expenses data; mirrored rows are labelled "From <trip>" and grouped
    // under the source trip for the Summary tab, matching the dashboard's behaviour.
    const expensesData = expenses.map((exp) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawTags: any[] = (exp.tagIds as any[]) || [];
      const tags = rawTags
        .map((t) => (typeof t === "object" ? t.name : String(t)))
        .filter(Boolean);

      const expTripId = (exp.tripId as string) || GENERAL_TRIP_ID;
      const isMirrored = expTripId !== tripIdParam;

      if (isMirrored) {
        const sourceTrip = tripsById.get(expTripId);
        const sourceName = sourceTrip?.name || "Trip";
        const groupLabel = sourceTrip?.emoji ? `${sourceTrip.emoji} ${sourceName}` : `✈ ${sourceName}`;
        return {
          date: new Date(exp.date),
          dateStr: formatDateISO(new Date(exp.date)),
          note: exp.note || "",
          tags: [`From ${sourceName}`, ...tags].sort(),
          groupTags: [groupLabel],
          amount: typeof exp.amount === "number" ? exp.amount : parseFloat(exp.amount) || 0,
        };
      }

      return {
        date: new Date(exp.date),
        dateStr: formatDateISO(new Date(exp.date)),
        note: exp.note || "",
        tags: tags.length > 0 ? [...tags].sort() : ["Uncategorized"],
        groupTags: tags.length > 0 ? tags : ["Uncategorized"],
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

    // Automatically persist refreshed tokens back to database
    oauth2Client.on("tokens", async (tokens) => {
      try {
        let changed = false;
        if (tokens.access_token && tokens.access_token !== user.googleAccessToken) {
          user.googleAccessToken = tokens.access_token;
          changed = true;
        }
        if (tokens.refresh_token && tokens.refresh_token !== user.googleRefreshToken) {
          user.googleRefreshToken = tokens.refresh_token;
          changed = true;
        }
        if (changed) {
          await user.save();
        }
      } catch (tokenErr) {
        console.warn("Failed to update refreshed Google OAuth tokens:", tokenErr);
      }
    });

    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

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
      for (const tag of exp.groupTags) {
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

    const summaryStartRow = 5;
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
    const expensesTabTitle = isGeneralTrip
      ? "Expenses"
      : sanitizeSheetTitle(`Expenses — ${activeTripName}`);
    const summaryTabTitle = isGeneralTrip
      ? "Summary by Tag"
      : sanitizeSheetTitle(`Summary — ${activeTripName}`);

    let spreadsheetId = user.sheetsSpreadsheetId || null;
    let expensesSheetId: number | null = null;
    let summarySheetId: number | null = null;
    let isUpdate = false;

    // If user requested a fresh sync, delete the old file from Google Drive first
    if (isFresh && spreadsheetId) {
      try {
        await drive.files.delete({ fileId: spreadsheetId }).catch(async () => {
          await drive.files.update({
            fileId: spreadsheetId!,
            requestBody: { trashed: true },
          }).catch(() => {});
        });
      } catch (driveErr) {
        console.warn("Could not delete old spreadsheet from Google Drive:", driveErr);
      }
      spreadsheetId = null;
    }

    let existingExpSheet: any = null;
    let existingSumSheet: any = null;

    // If not fresh and we have an existing spreadsheetId, verify it still exists in Google Drive
    if (!isFresh && spreadsheetId) {
      try {
        const existingRes = await sheets.spreadsheets.get({ spreadsheetId });
        const existingSheets = existingRes.data.sheets || [];

        existingExpSheet = existingSheets.find(
          (s) => s.properties?.title === expensesTabTitle
        );
        existingSumSheet = existingSheets.find(
          (s) => s.properties?.title === summaryTabTitle
        );

        if (existingExpSheet?.properties?.sheetId != null) {
          expensesSheetId = existingExpSheet.properties.sheetId;
        }
        if (existingSumSheet?.properties?.sheetId != null) {
          summarySheetId = existingSumSheet.properties.sheetId;
        }

        // If tabs are missing from the existing sheet, add them (letting Google assign real sheetIds)
        const addSheetRequests: any[] = [];
        if (!existingExpSheet) {
          addSheetRequests.push({
            addSheet: {
              properties: {
                title: expensesTabTitle,
                tabColor: { red: 0.133, green: 0.773, blue: 0.369 },
                gridProperties: { frozenRowCount: 6 },
              },
            },
          });
        }
        if (!existingSumSheet) {
          addSheetRequests.push({
            addSheet: {
              properties: {
                title: summaryTabTitle,
                tabColor: { red: 0.133, green: 0.773, blue: 0.369 },
                gridProperties: { frozenRowCount: 4, hideGridlines: true },
              },
            },
          });
        }

        if (addSheetRequests.length > 0) {
          const addRes = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: addSheetRequests },
          });
          const replies = addRes.data.replies || [];
          for (const reply of replies) {
            const props = reply.addSheet?.properties;
            if (!props) continue;
            if (props.title === expensesTabTitle) expensesSheetId = props.sheetId ?? expensesSheetId;
            if (props.title === summaryTabTitle) summarySheetId = props.sheetId ?? summarySheetId;
          }
        }

        // Clear existing data ranges so stale entries are removed (only this trip's tabs)
        await sheets.spreadsheets.values.batchClear({
          spreadsheetId,
          requestBody: {
            ranges: [`'${expensesTabTitle}'!A:Z`, `'${summaryTabTitle}'!A:Z`],
          },
        });

        isUpdate = true;
      } catch (fetchErr: any) {
        // If 404 or sheet not accessible, fall back to creating a new one
        if (fetchErr?.code === 404 || fetchErr?.status === 404) {
          spreadsheetId = null;
        } else {
          throw fetchErr;
        }
      }
    }

    // If we don't have a spreadsheet (either was fresh, didn't exist, or was deleted/404)
    if (!spreadsheetId) {
      expensesSheetId = 0;
      summarySheetId = 1;

      const createRes = await (sheets.spreadsheets.create as any)({
        requestBody: {
          properties: {
            title: sheetTitle,
          },
          sheets: [
            {
              properties: {
                sheetId: expensesSheetId,
                title: expensesTabTitle,
                tabColor: { red: 0.133, green: 0.773, blue: 0.369 },
                gridProperties: {
                  frozenRowCount: 6,
                },
              },
            },
            {
              properties: {
                sheetId: summarySheetId,
                title: summaryTabTitle,
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

      spreadsheetId = createRes.data.spreadsheetId;
    }

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Could not create or locate spreadsheet in Google Drive." },
        { status: 500 }
      );
    }

    // Safety fallback: should always be set by the lookup/create paths above
    if (expensesSheetId == null) expensesSheetId = 0;
    if (summarySheetId == null) summarySheetId = 1;

    // Populate data in both tabs
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          {
            range: `'${expensesTabTitle}'!A1:D${expensesRows.length}`,
            values: expensesRows,
          },
          {
            range: `'${summaryTabTitle}'!A1:D${summaryRows.length}`,
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
    const formattingRequests: any[] = [];

    // If updating an existing sheet, update its title to reflect current export period
    if (isUpdate) {
      formattingRequests.push({
        updateSpreadsheetProperties: {
          properties: {
            title: sheetTitle,
          },
          fields: "title",
        },
      });
    }

    // --- Expenses Tab Formatting ---
    // Check if title A1:D1 is already merged on existing sheet
    const expMergedTitle = existingExpSheet?.merges?.some(
      (m: any) => m.startRowIndex === 0 && m.endRowIndex === 1 && m.startColumnIndex === 0 && m.endColumnIndex === 4
    );
    if (!expMergedTitle) {
      formattingRequests.push({
        mergeCells: {
          range: { sheetId: expensesSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: "MERGE_ALL",
        },
      });
    }

    formattingRequests.push(
      // Title text style
      {
        repeatCell: {
          range: { sheetId: expensesSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
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
          range: { sheetId: expensesSheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              backgroundColor: greenColor,
              textFormat: { bold: true, fontSize: 11, foregroundColor: whiteColor },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      }
    );

    // AutoFilter on header row (only set if not already present on existing sheet)
    if (!existingExpSheet?.basicFilter) {
      formattingRequests.push({
        setBasicFilter: {
          filter: {
            range: { sheetId: expensesSheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 4 },
          },
        },
      });
    }

    formattingRequests.push(
      // Column widths for Expenses
      {
        updateDimensionProperties: {
          range: { sheetId: expensesSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 120 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: expensesSheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
          properties: { pixelSize: 240 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: expensesSheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 },
          properties: { pixelSize: 180 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: expensesSheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 },
          properties: { pixelSize: 120 },
          fields: "pixelSize",
        },
      },
      // Expenses Amount column number format (D7:D)
      {
        repeatCell: {
          range: { sheetId: expensesSheetId, startRowIndex: 6, endRowIndex: expensesRows.length, startColumnIndex: 3, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              numberFormat: { type: "CURRENCY", pattern: `"${currencyInfo.symbol}"#,##0.00` },
              horizontalAlignment: "RIGHT",
            },
          },
          fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
        },
      }
    );

    // --- Summary by Tag Tab Formatting ---
    // Check if title A1:D1 is already merged on summary sheet
    const sumMergedTitle = existingSumSheet?.merges?.some(
      (m: any) => m.startRowIndex === 0 && m.endRowIndex === 1 && m.startColumnIndex === 0 && m.endColumnIndex === 4
    );
    if (!sumMergedTitle) {
      formattingRequests.push({
        mergeCells: {
          range: { sheetId: summarySheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: "MERGE_ALL",
        },
      });
    }

    // Unmerge old footnote on Summary tab if updating
    if (isUpdate && existingSumSheet?.merges) {
      for (const m of existingSumSheet.merges) {
        if (m.startRowIndex != null && m.startRowIndex >= 4) {
          formattingRequests.push({
            unmergeCells: {
              range: {
                sheetId: summarySheetId,
                startRowIndex: m.startRowIndex,
                endRowIndex: m.endRowIndex,
                startColumnIndex: m.startColumnIndex,
                endColumnIndex: m.endColumnIndex,
              },
            },
          });
        }
      }
    }

    formattingRequests.push(
      // Title text style
      {
        repeatCell: {
          range: { sheetId: summarySheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
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
          range: { sheetId: summarySheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              backgroundColor: greenColor,
              textFormat: { bold: true, fontSize: 11, foregroundColor: whiteColor },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      },
      // Column widths for Summary by Tag
      {
        updateDimensionProperties: {
          range: { sheetId: summarySheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 160 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: summarySheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
          properties: { pixelSize: 120 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: summarySheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 },
          properties: { pixelSize: 100 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: summarySheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 },
          properties: { pixelSize: 90 },
          fields: "pixelSize",
        },
      },
      // Summary Total column currency format (Col B)
      {
        repeatCell: {
          range: { sheetId: summarySheetId, startRowIndex: 4, endRowIndex: summaryTotalRow, startColumnIndex: 1, endColumnIndex: 2 },
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
          range: { sheetId: summarySheetId, startRowIndex: 4, endRowIndex: summaryTotalRow, startColumnIndex: 3, endColumnIndex: 4 },
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
          range: { sheetId: summarySheetId, startRowIndex: summaryRows.length - 1, endRowIndex: summaryRows.length, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: "MERGE_ALL",
        },
      },
      // Footnote text style (italic, muted)
      {
        repeatCell: {
          range: { sheetId: summarySheetId, startRowIndex: summaryRows.length - 1, endRowIndex: summaryRows.length, startColumnIndex: 0, endColumnIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { italic: true, fontSize: 9.5, foregroundColor: { red: 0.42, green: 0.45, blue: 0.5 } },
            },
          },
          fields: "userEnteredFormat.textFormat",
        },
      }
    );

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: formattingRequests,
        },
      });
    } catch (fmtErr) {
      console.warn("Sheet styling warning (data was written successfully):", fmtErr);
    }

    user.sheetsLinked = true;
    user.sheetsSpreadsheetId = spreadsheetId;
    user.sheetsLastSyncedAt = new Date();
    await user.save();

    return NextResponse.json({
      success: true,
      action: isFresh ? "fresh" : isUpdate ? "update" : "create",
      spreadsheetId,
      lastSyncedAt: user.sheetsLastSyncedAt,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      message: isFresh
        ? "Deleted previous Google Sheet and synced a brand-new sheet with all transactions."
        : isUpdate
        ? "Updated your existing Google Sheet with the latest transactions."
        : "Exported your transactions to a new Google Sheet.",
    });
  } catch (error: unknown) {
    console.error("Google Sheets sync error:", error);
    let message = error instanceof Error ? error.message : "Sync failed";
    if (message.includes("invalid_grant") || message.includes("401")) {
      message = "Google authorization expired. Please sign out and sign in with Google again.";
    }
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
