import type { sheets_v4 } from "googleapis";
import { Expense } from "@/models/Expense";
import { Tag } from "@/models/Tag";
import { ITrip } from "@/models/Trip";
import { IUser } from "@/models/User";
import { getCurrencyInfo } from "@/lib/currency";
import {
  createGoogleClients,
  isNotFoundError,
  quoteSheetTitle,
  tripSpreadsheetTitle,
} from "@/lib/server/googleSheets";
import { GENERAL_TRIP_ID, getVisibleTripIds, tripIdMatchValues, TripLike } from "@/lib/trips";

const TAB_COLOR = { red: 0.133, green: 0.773, blue: 0.369 };
const EXPENSES_TAB_TITLE = "Expenses";
const SUMMARY_TAB_TITLE = "Summary by Tag";

function expensesTabProperties(title: string): sheets_v4.Schema$SheetProperties {
  return { title, tabColor: TAB_COLOR, gridProperties: { frozenRowCount: 6 } };
}

function summaryTabProperties(title: string): sheets_v4.Schema$SheetProperties {
  return { title, tabColor: TAB_COLOR, gridProperties: { frozenRowCount: 4, hideGridlines: true } };
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

export interface SyncTripOptions {
  user: IUser;
  // A hydrated Trip document; its sheet fields are saved as the sync progresses.
  trip: ITrip;
  // All of the user's trips, used to include expenses mirrored into this trip.
  userTrips: (TripLike & { name?: string; emoji?: string })[];
  // Rebuild the trip's tabs from scratch (same file, same link).
  fresh?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  tagIds?: string[];
}

export interface SyncTripResult {
  spreadsheetId: string;
  action: "create" | "update" | "fresh";
  syncedAt: Date;
}

// Writes one trip's expenses into its own spreadsheet ("Budget Tracker - <trip>"), creating it on first sync.
export async function syncTripToSheet({
  user,
  trip,
  userTrips,
  fresh = false,
  startDate = null,
  endDate = null,
  tagIds = [],
}: SyncTripOptions): Promise<SyncTripResult> {
  const tripsById = new Map(userTrips.map((t) => [t.tripId, t]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { userId: String(user._id) };
  const parsedStartDate = startDate ? new Date(startDate) : null;
  const parsedEndDate = endDate ? new Date(endDate) : null;

  if (parsedStartDate || parsedEndDate) {
    filter.date = {};
    if (parsedStartDate) filter.date.$gte = parsedStartDate;
    if (parsedEndDate) {
      const endOfDay = new Date(parsedEndDate);
      endOfDay.setHours(23, 59, 59, 999);
      filter.date.$lte = endOfDay;
    }
  }

  if (tagIds && tagIds.length > 0) {
    filter.tagIds = { $in: tagIds };
  }

  const visibleTripIds = getVisibleTripIds(userTrips, trip.tripId);
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
    const isMirrored = expTripId !== trip.tripId;

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

  if (parsedStartDate && parsedEndDate) {
    startLabel = formatDateDisplay(parsedStartDate);
    endLabel = formatDateDisplay(parsedEndDate);
  } else if (expensesData.length > 0) {
    startLabel = formatDateDisplay(expensesData[0].date);
    endLabel = formatDateDisplay(expensesData[expensesData.length - 1].date);
  } else {
    const now = new Date();
    startLabel = formatDateDisplay(now);
    endLabel = formatDateDisplay(now);
  }

  let tagLabel = "All";
  if (tagIds && tagIds.length > 0) {
    const foundTags = await Tag.find({ _id: { $in: tagIds } }).lean();
    tagLabel = foundTags.map((t) => t.name).sort().join(", ") || "All";
  }

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

  const { sheets, drive } = createGoogleClients(user);
  const spreadsheetTitle = tripSpreadsheetTitle(trip.name);
  const expensesTabTitle = EXPENSES_TAB_TITLE;
  const summaryTabTitle = SUMMARY_TAB_TITLE;

  let spreadsheetId: string | null = trip.sheetsSpreadsheetId || null;
  let existingSheets: sheets_v4.Schema$Sheet[] = [];
  let currentSpreadsheetTitle: string | null = null;

  if (spreadsheetId) {
    try {
      // A file the user trashed in Drive is still reachable through the API, so check for it explicitly.
      const fileRes = await drive.files.get({ fileId: spreadsheetId, fields: "trashed" });
      if (fileRes.data.trashed) {
        spreadsheetId = null;
      } else {
        const existingRes = await sheets.spreadsheets.get({ spreadsheetId });
        existingSheets = existingRes.data.sheets || [];
        currentSpreadsheetTitle = existingRes.data.properties?.title || null;
      }
    } catch (fetchErr: unknown) {
      // The file was deleted from Drive; a new one is created below.
      if (!isNotFoundError(fetchErr)) throw fetchErr;
      spreadsheetId = null;
    }
  }

  let expensesSheetId: number | null = null;
  let summarySheetId: number | null = null;
  // Tabs being updated in place; null when the tab was just added.
  let existingExpSheet: sheets_v4.Schema$Sheet | null = null;
  let existingSumSheet: sheets_v4.Schema$Sheet | null = null;
  let action: SyncTripResult["action"];

  if (!spreadsheetId) {
    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: spreadsheetTitle },
        sheets: [
          { properties: expensesTabProperties(expensesTabTitle) },
          { properties: summaryTabProperties(summaryTabTitle) },
        ],
      },
    });

    spreadsheetId = createRes.data.spreadsheetId || null;
    if (!spreadsheetId) throw new Error("Could not create spreadsheet in Google Drive.");
    currentSpreadsheetTitle = spreadsheetTitle;
    const createdSheets = createRes.data.sheets || [];
    expensesSheetId = createdSheets[0]?.properties?.sheetId ?? null;
    summarySheetId = createdSheets[1]?.properties?.sheetId ?? null;
    action = "create";

    // Record the new file before writing data, so a failure below can't orphan it.
    trip.sheetsSpreadsheetId = spreadsheetId;
    await trip.save();
  } else {
    const findTab = (title: string) =>
      existingSheets.find((sh) => sh.properties?.title?.toLowerCase() === title.toLowerCase()) || null;
    const foundExp = findTab(expensesTabTitle);
    const foundSum = findTab(summaryTabTitle);

    const structureRequests: sheets_v4.Schema$Request[] = [];

    if (fresh) {
      // Rebuild both tabs inside the same file: move the old ones out of the way, add clean ones, then delete
      // the old. Running it as one atomic batch means the spreadsheet is never left without a tab.
      const oldTabs = [foundExp, foundSum].filter((sh): sh is sheets_v4.Schema$Sheet => sh != null);
      for (const old of oldTabs) {
        structureRequests.push({
          updateSheetProperties: {
            properties: { sheetId: old.properties!.sheetId, title: `~resync-${old.properties!.sheetId}` },
            fields: "title",
          },
        });
      }
      structureRequests.push(
        { addSheet: { properties: expensesTabProperties(expensesTabTitle) } },
        { addSheet: { properties: summaryTabProperties(summaryTabTitle) } }
      );
      for (const old of oldTabs) {
        structureRequests.push({ deleteSheet: { sheetId: old.properties!.sheetId } });
      }
      action = "fresh";
    } else {
      existingExpSheet = foundExp;
      existingSumSheet = foundSum;
      if (!foundExp) structureRequests.push({ addSheet: { properties: expensesTabProperties(expensesTabTitle) } });
      if (!foundSum) structureRequests.push({ addSheet: { properties: summaryTabProperties(summaryTabTitle) } });
      expensesSheetId = foundExp?.properties?.sheetId ?? null;
      summarySheetId = foundSum?.properties?.sheetId ?? null;
      action = "update";
    }

    if (structureRequests.length > 0) {
      const structureRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: structureRequests },
      });
      for (const reply of structureRes.data.replies || []) {
        const props = reply.addSheet?.properties;
        if (!props) continue;
        if (props.title === expensesTabTitle) expensesSheetId = props.sheetId ?? null;
        if (props.title === summaryTabTitle) summarySheetId = props.sheetId ?? null;
      }
    }

    // Clear stale rows from tabs updated in place
    const rangesToClear = [
      existingExpSheet ? `${quoteSheetTitle(expensesTabTitle)}!A:Z` : null,
      existingSumSheet ? `${quoteSheetTitle(summaryTabTitle)}!A:Z` : null,
    ].filter((r): r is string => r != null);
    if (rangesToClear.length > 0) {
      await sheets.spreadsheets.values.batchClear({
        spreadsheetId,
        requestBody: { ranges: rangesToClear },
      });
    }
  }

  if (expensesSheetId == null || summarySheetId == null) {
    throw new Error("Could not locate the Expenses and Summary tabs in the trip's spreadsheet.");
  }

  // Populate data in both tabs
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${quoteSheetTitle(expensesTabTitle)}!A1:D${expensesRows.length}`,
          values: expensesRows,
        },
        {
          range: `${quoteSheetTitle(summaryTabTitle)}!A1:D${summaryRows.length}`,
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

  // Keeps the file named after the trip, including after a rename
  if (currentSpreadsheetTitle !== spreadsheetTitle) {
    formattingRequests.push({
      updateSpreadsheetProperties: {
        properties: { title: spreadsheetTitle },
        fields: "title",
      },
    });
  }

  // --- Expenses Tab Formatting ---
  // Check if title A1:D1 is already merged on existing sheet
  const expMergedTitle = existingExpSheet?.merges?.some(
    (m) => m.startRowIndex === 0 && m.endRowIndex === 1 && m.startColumnIndex === 0 && m.endColumnIndex === 4
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
    (m) => m.startRowIndex === 0 && m.endRowIndex === 1 && m.startColumnIndex === 0 && m.endColumnIndex === 4
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
  if (existingSumSheet?.merges) {
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

  const syncedAt = new Date();
  trip.sheetsSpreadsheetId = spreadsheetId;
  trip.sheetsLastSyncedAt = syncedAt;
  await trip.save();
  user.sheetsLinked = true;
  user.sheetsLastSyncedAt = syncedAt;
  await user.save();

  return { spreadsheetId, action, syncedAt };
}
