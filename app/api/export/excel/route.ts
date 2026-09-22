import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { Tag } from "@/models/Tag";
import { Saving } from "@/models/Saving";
import { User } from "@/models/User";
import { getCurrentUser } from "@/lib/auth";
import { getExcelCurrencyFormat } from "@/lib/currency";
import { listTripsSorted } from "@/lib/server/trips";
import { GENERAL_TRIP_ID, getVisibleTripIds, tripIdMatchValues } from "@/lib/trips";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function formatDateDisplay(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatDateForFilename(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: NextRequest) {
  try {
    const userSession = await getCurrentUser(req);
    const userId = userSession?.userId || "local_user";

    let userCurrency = "INR";
    let dbConnected = false;
    let activeTripName = "General";
    let activeTripEmoji = "";
    let isGeneralTrip = true;

    const { searchParams } = new URL(req.url);
    const tripIdParam = searchParams.get("tripId")?.trim() || GENERAL_TRIP_ID;

    try {
      const db = await connectToDatabase();
      if (db) {
        dbConnected = true;
        if (userSession?.userId) {
          const dbUser = await User.findById(userSession.userId).lean();
          if (dbUser?.currency) userCurrency = dbUser.currency;
        }
      }
    } catch (err) {
      console.warn("DB connection warning during export:", err);
    }

    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const tagIdsParam = searchParams.get("tagIds")?.split(",").filter(Boolean);
    const tagNamesParam = searchParams.get("tagNames")?.split(",").filter(Boolean);

    // Build DB filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = { userId };
    let parsedStartDate: Date | null = startDateParam ? new Date(startDateParam) : null;
    let parsedEndDate: Date | null = endDateParam ? new Date(endDateParam) : null;

    if (parsedStartDate || parsedEndDate) {
      filter.date = {};
      if (parsedStartDate) {
        filter.date.$gte = parsedStartDate;
      }
      if (parsedEndDate) {
        // Include full day of endDate
        const endOfDay = new Date(parsedEndDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.date.$lte = endOfDay;
      }
    }

    if (tagIdsParam && tagIdsParam.length > 0) {
      filter.tagIds = { $in: tagIdsParam };
    }

    interface ProcessedExpense {
      date: Date;
      note: string;
      tags: string[];
      groupTags: string[];
      amount: number;
      isSaving?: boolean;
      fromSavings?: boolean;
    }

    let expensesData: ProcessedExpense[] = [];
    let resolvedTagNames: string[] = tagNamesParam || [];

    if (dbConnected) {
      const userTrips = userSession?.userId ? await listTripsSorted(userId) : [];
      const activeTripDoc = userTrips.find((t) => t.tripId === tripIdParam);
      isGeneralTrip = tripIdParam === GENERAL_TRIP_ID;
      activeTripName = activeTripDoc?.name || (isGeneralTrip ? "General" : "Trip");
      activeTripEmoji = activeTripDoc?.emoji || "";
      const tripsById = new Map(userTrips.map((t) => [t.tripId, t]));

      if (userTrips.length > 0) {
        const visibleTripIds = getVisibleTripIds(userTrips, tripIdParam);
        filter.tripId = { $in: tripIdMatchValues(visibleTripIds) };
      }

      // Fetch user's expenses sorted oldest first as required by spec
      const expenses = await Expense.find(filter)
        .sort({ date: 1 })
        .populate("tagIds")
        .lean();

      expensesData = expenses.map((exp) => {
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
            note: exp.note || "No note",
            tags: [`From ${sourceName}`, ...tags],
            groupTags: [groupLabel],
            amount: typeof exp.amount === "number" ? exp.amount : parseFloat(exp.amount) || 0,
          };
        }

        return {
          date: new Date(exp.date),
          note: exp.note || "No note",
          tags: tags.length > 0 ? tags : ["Uncategorized"],
          groupTags: tags.length > 0 ? tags : ["Uncategorized"],
          amount: typeof exp.amount === "number" ? exp.amount : parseFloat(exp.amount) || 0,
        };
      });

      const savingFilter: any = { userId };
      if (filter.date) {
        savingFilter.date = filter.date;
      }
      const savings = isGeneralTrip ? await Saving.find(savingFilter).sort({ date: 1 }).lean() : [];

      const savingsData = savings.map((sav) => {
        return {
          date: new Date(sav.date),
          note: sav.note || "No note",
          tags: [], // Savings don't have tags natively in the new schema
          groupTags: [],
          amount: typeof sav.amount === "number" ? sav.amount : parseFloat(sav.amount as any) || 0,
          isSaving: sav.type === "deposit",
          fromSavings: sav.type === "withdrawal",
        };
      });

      // Combine and sort oldest first
      expensesData = [...expensesData, ...savingsData].sort((a, b) => a.date.getTime() - b.date.getTime());

      // If specific tagIds were requested and tagNames weren't provided in query, fetch tag names
      if (tagIdsParam && tagIdsParam.length > 0 && resolvedTagNames.length === 0) {
        const foundTags = await Tag.find({ _id: { $in: tagIdsParam } }).lean();
        resolvedTagNames = foundTags.map((t) => t.name);
      }
    } else if (userId === "demo_user" || userSession?.email === "user@gmail.com") {
      // Offline / dev fallback sample data for demo user (sorted oldest first)
      expensesData = [
        { date: new Date("2026-09-08"), note: "Transit metro card", tags: ["Transport"], groupTags: ["Transport"], amount: 32.0 },
        { date: new Date("2026-09-12"), note: "Bouldering & gym membership", tags: ["Health & Gym"], groupTags: ["Health & Gym"], amount: 65.0 },
        { date: new Date("2026-09-15"), note: "Fiber broadband & electricity", tags: ["Housing & Bills"], groupTags: ["Housing & Bills"], amount: 145.0 },
        { date: new Date("2026-09-17"), note: "Artisan espresso & pastry", tags: ["Dining & Coffee"], groupTags: ["Dining & Coffee"], amount: 14.2 },
        { date: new Date("2026-09-18"), note: "Organic Market groceries", tags: ["Groceries"], groupTags: ["Groceries"], amount: 84.5 },
      ];
    }

    // Determine period labels
    let startLabel = "All Time";
    let endLabel = "All Time";
    let startFileStr = "";
    let endFileStr = "";

    if (parsedStartDate && parsedEndDate) {
      startLabel = formatDateDisplay(parsedStartDate);
      endLabel = formatDateDisplay(parsedEndDate);
      startFileStr = formatDateForFilename(parsedStartDate);
      endFileStr = formatDateForFilename(parsedEndDate);
    } else if (expensesData.length > 0) {
      const earliest = expensesData[0].date;
      const latest = expensesData[expensesData.length - 1].date;
      startLabel = formatDateDisplay(earliest);
      endLabel = formatDateDisplay(latest);
      startFileStr = formatDateForFilename(earliest);
      endFileStr = formatDateForFilename(latest);
    } else {
      const now = new Date();
      startLabel = formatDateDisplay(now);
      endLabel = formatDateDisplay(now);
      startFileStr = formatDateForFilename(now);
      endFileStr = formatDateForFilename(now);
    }

    // Determine tags label
    const tagLabel =
      resolvedTagNames.length > 0
        ? [...resolvedTagNames].sort().join(", ")
        : "All";

    const currencyNumFmt = getExcelCurrencyFormat(userCurrency);

    // ==========================================
    // Initialize ExcelJS Workbook
    // ==========================================
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Budget Tracker";
    workbook.created = new Date();

    // ------------------------------------------
    // TAB 1: Expenses
    // ------------------------------------------
    const expensesSheet = workbook.addWorksheet("Expenses", {
      properties: { tabColor: { argb: "FF22C55E" } },
      views: [{ state: "frozen", ySplit: 6, showGridLines: true }],
    });

    // Row 1: Merged Title
    expensesSheet.mergeCells("A1:D1");
    const titleCell = expensesSheet.getCell("A1");
    titleCell.value = "Budget Tracker — Expense Export";
    titleCell.font = { bold: true, size: 14, color: { argb: "FF22C55E" }, name: "Calibri" };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    expensesSheet.getRow(1).height = 24;

    // Rows 2–4: Metadata
    const r2 = expensesSheet.getCell("A2");
    r2.value = `Period: ${startLabel} – ${endLabel}`;
    r2.font = { size: 10.5, name: "Calibri", color: { argb: "FF374151" } };

    const r3 = expensesSheet.getCell("A3");
    r3.value = `Tags: ${tagLabel}`;
    r3.font = { size: 10.5, name: "Calibri", color: { argb: "FF374151" } };

    const r4 = expensesSheet.getCell("A4");
    r4.value = `Generated: ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`;
    r4.font = { size: 10.5, name: "Calibri", color: { argb: "FF6B7280" } };

    // Row 5: Trip metadata (was a blank spacer; header row alignment is unaffected)
    const r5 = expensesSheet.getCell("A5");
    r5.value = `Trip: ${activeTripEmoji ? `${activeTripEmoji} ` : ""}${activeTripName}`;
    r5.font = { size: 10.5, name: "Calibri", color: { argb: "FF374151" } };
    expensesSheet.getRow(5).height = 16;

    // Row 6: Frozen Column Headers
    const headerRow = expensesSheet.getRow(6);
    headerRow.values = ["Date", "Note", "Tags", "Amount", "Type"];
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF22C55E" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
    headerRow.getCell(4).alignment = { vertical: "middle", horizontal: "right" };
    headerRow.getCell(5).alignment = { vertical: "middle", horizontal: "center" };

    // Define column widths
    expensesSheet.columns = [
      { key: "date", width: 16 },
      { key: "note", width: 34 },
      { key: "tags", width: 26 },
      { key: "amount", width: 16 },
      { key: "type", width: 16 },
    ];

    // Rows 7…n: One row per expense (sorted oldest first)
    let rowIndex = 7;
    for (const exp of expensesData) {
      const row = expensesSheet.getRow(rowIndex++);
      const sortedTags = [...exp.tags].sort().join(", ");
      const typeLabel = exp.isSaving ? "🏦 Saving" : exp.fromSavings ? "💸 From Savings" : "Expense";
      row.values = [exp.date, exp.note, sortedTags, exp.amount, typeLabel];
      row.height = 20;

      const dateCell = row.getCell(1);
      dateCell.numFmt = "dd mmm yyyy";
      dateCell.alignment = { vertical: "middle", horizontal: "left" };
      dateCell.font = { size: 10.5, name: "Calibri" };

      const noteCell = row.getCell(2);
      noteCell.alignment = { vertical: "middle", horizontal: "left" };
      noteCell.font = { size: 10.5, name: "Calibri" };

      const tagCell = row.getCell(3);
      tagCell.alignment = { vertical: "middle", horizontal: "left" };
      tagCell.font = { size: 10.5, name: "Calibri" };

      const amtCell = row.getCell(4);
      amtCell.numFmt = currencyNumFmt;
      amtCell.alignment = { vertical: "middle", horizontal: "right" };
      amtCell.font = { size: 10.5, name: "Calibri" };
      // Colour savings rows
      if (exp.isSaving) {
        amtCell.font = { size: 10.5, name: "Calibri", color: { argb: "FF0D9488" } }; // teal
      } else if (exp.fromSavings) {
        amtCell.font = { size: 10.5, name: "Calibri", color: { argb: "FFF59E0B" } }; // amber
      }

      const typeCell = row.getCell(5);
      typeCell.alignment = { vertical: "middle", horizontal: "center" };
      typeCell.font = { size: 10.5, name: "Calibri" };
    }

    // AutoFilter on header row
    expensesSheet.autoFilter = { from: "A6", to: "E6" };

    // Row n+1: Blank spacer
    expensesSheet.getRow(rowIndex).height = 12;

    // Row n+2: Total row
    const totalRowIndex = rowIndex + 1;
    const totalRow = expensesSheet.getRow(totalRowIndex);
    totalRow.height = 24;

    totalRow.getCell(2).value = "Total Expenses";
    totalRow.getCell(2).font = { bold: true, size: 10.5, name: "Calibri" };
    totalRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };

    const lastExpenseRow = Math.max(7, rowIndex - 1);
    const totalAmountCell = totalRow.getCell(4);
    totalAmountCell.value = {
      formula: `SUMIF(E7:E${lastExpenseRow},"Expense",D7:D${lastExpenseRow})`,
      result: expensesData.filter((e) => !e.isSaving && !e.fromSavings).reduce((sum, e) => sum + e.amount, 0),
    };
    totalAmountCell.font = { bold: true, size: 10.5, name: "Calibri" };
    totalAmountCell.numFmt = currencyNumFmt;
    totalAmountCell.alignment = { vertical: "middle", horizontal: "right" };
    totalAmountCell.border = { top: { style: "thin" } };

    // Savings summary row
    const savingsRowIndex = totalRowIndex + 1;
    const savingsRow = expensesSheet.getRow(savingsRowIndex);
    savingsRow.height = 22;
    savingsRow.getCell(2).value = "Total Saved";
    savingsRow.getCell(2).font = { size: 10.5, name: "Calibri", color: { argb: "FF0D9488" } };
    savingsRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
    const savedCell = savingsRow.getCell(4);
    savedCell.value = expensesData.filter((e) => e.isSaving).reduce((sum, e) => sum + e.amount, 0);
    savedCell.numFmt = currencyNumFmt;
    savedCell.font = { size: 10.5, name: "Calibri", color: { argb: "FF0D9488" } };
    savedCell.alignment = { vertical: "middle", horizontal: "right" };

    const fromSavingsRowIndex = savingsRowIndex + 1;
    const fromSavingsRow = expensesSheet.getRow(fromSavingsRowIndex);
    fromSavingsRow.height = 22;
    fromSavingsRow.getCell(2).value = "Withdrawn from Savings";
    fromSavingsRow.getCell(2).font = { size: 10.5, name: "Calibri", color: { argb: "FFF59E0B" } };
    fromSavingsRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
    const fromSavedCell = fromSavingsRow.getCell(4);
    fromSavedCell.value = expensesData.filter((e) => e.fromSavings).reduce((sum, e) => sum + e.amount, 0);
    fromSavedCell.numFmt = currencyNumFmt;
    fromSavedCell.font = { size: 10.5, name: "Calibri", color: { argb: "FFF59E0B" } };
    fromSavedCell.alignment = { vertical: "middle", horizontal: "right" };

    // ------------------------------------------
    // TAB 2: Summary by Tag
    // ------------------------------------------
    const summarySheet = workbook.addWorksheet("Summary by Tag", {
      properties: { tabColor: { argb: "FF22C55E" } },
      views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    });

    // Row 1: Merged Title
    summarySheet.mergeCells("A1:D1");
    const sumTitleCell = summarySheet.getCell("A1");
    sumTitleCell.value = "Spend by Tag";
    sumTitleCell.font = { bold: true, size: 14, color: { argb: "FF22C55E" }, name: "Calibri" };
    sumTitleCell.alignment = { vertical: "middle", horizontal: "left" };
    summarySheet.getRow(1).height = 24;

    // Row 2: Period line
    const sumPeriodCell = summarySheet.getCell("A2");
    sumPeriodCell.value = isGeneralTrip
      ? `Period: ${startLabel} – ${endLabel}`
      : `Period: ${startLabel} – ${endLabel}  •  Trip: ${activeTripName}`;
    sumPeriodCell.font = { size: 10.5, name: "Calibri", color: { argb: "FF374151" } };

    // Row 3: Blank spacer
    summarySheet.getRow(3).height = 12;

    // Row 4: Column headers
    const sumHeaderRow = summarySheet.getRow(4);
    sumHeaderRow.values = ["Tag", "Total", "Transactions", "% of Total"];
    sumHeaderRow.height = 26;
    sumHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF22C55E" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
    sumHeaderRow.getCell(2).alignment = { vertical: "middle", horizontal: "right" };
    sumHeaderRow.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
    sumHeaderRow.getCell(4).alignment = { vertical: "middle", horizontal: "right" };

    summarySheet.columns = [
      { key: "tag", width: 22 },
      { key: "total", width: 16 },
      { key: "transactions", width: 14 },
      { key: "pct", width: 12 },
    ];

    // Compute aggregation by tag
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

    // Sort by Total descending
    const sortedTagsList = Array.from(tagAggregation.entries())
      .map(([tagName, stats]) => ({
        tag: tagName,
        total: stats.total,
        count: stats.count,
        pct: grandTagSum > 0 ? stats.total / grandTagSum : 0,
      }))
      .sort((a, b) => b.total - a.total);

    let sumRowIndex = 5;
    const startTagRow = 5;

    for (const item of sortedTagsList) {
      const row = summarySheet.getRow(sumRowIndex++);
      row.values = [item.tag, item.total, item.count, item.pct];
      row.height = 20;

      const tagCell = row.getCell(1);
      tagCell.font = { size: 10.5, name: "Calibri" };
      tagCell.alignment = { vertical: "middle", horizontal: "left" };

      const totalCell = row.getCell(2);
      totalCell.font = { size: 10.5, name: "Calibri" };
      totalCell.numFmt = currencyNumFmt;
      totalCell.alignment = { vertical: "middle", horizontal: "right" };

      const countCell = row.getCell(3);
      countCell.font = { size: 10.5, name: "Calibri" };
      countCell.numFmt = "#,##0";
      countCell.alignment = { vertical: "middle", horizontal: "center" };

      const pctCell = row.getCell(4);
      pctCell.font = { size: 10.5, name: "Calibri" };
      pctCell.numFmt = "0.0%";
      pctCell.alignment = { vertical: "middle", horizontal: "right" };
    }

    const lastTagRow = Math.max(startTagRow, sumRowIndex - 1);

    // Row n+1: Summary Total row
    const sumTotalRow = summarySheet.getRow(sumRowIndex);
    sumTotalRow.height = 24;

    const stTagCell = sumTotalRow.getCell(1);
    stTagCell.value = "Total";
    stTagCell.font = { bold: true, size: 10.5, name: "Calibri" };
    stTagCell.alignment = { vertical: "middle", horizontal: "left" };

    const stTotalCell = sumTotalRow.getCell(2);
    stTotalCell.value = {
      formula: `SUM(B${startTagRow}:B${lastTagRow})`,
      result: grandTagSum,
    };
    stTotalCell.font = { bold: true, size: 10.5, name: "Calibri" };
    stTotalCell.numFmt = currencyNumFmt;
    stTotalCell.border = { top: { style: "thin" } };
    stTotalCell.alignment = { vertical: "middle", horizontal: "right" };

    const stCountCell = sumTotalRow.getCell(3);
    stCountCell.value = {
      formula: `SUM(C${startTagRow}:C${lastTagRow})`,
      result: sortedTagsList.reduce((acc, curr) => acc + curr.count, 0),
    };
    stCountCell.font = { bold: true, size: 10.5, name: "Calibri" };
    stCountCell.numFmt = "#,##0";
    stCountCell.border = { top: { style: "thin" } };
    stCountCell.alignment = { vertical: "middle", horizontal: "center" };

    const stPctCell = sumTotalRow.getCell(4);
    stPctCell.value = sortedTagsList.length > 0 ? 1 : 0;
    stPctCell.font = { bold: true, size: 10.5, name: "Calibri" };
    stPctCell.numFmt = "0.0%";
    stPctCell.border = { top: { style: "thin" } };
    stPctCell.alignment = { vertical: "middle", horizontal: "right" };

    // Row n+2: Blank spacer
    summarySheet.getRow(sumRowIndex + 1).height = 12;

    // Row n+3: Footnote
    const footnoteRowIndex = sumRowIndex + 2;
    summarySheet.mergeCells(`A${footnoteRowIndex}:D${footnoteRowIndex}`);
    const footnoteCell = summarySheet.getCell(`A${footnoteRowIndex}`);
    footnoteCell.value =
      "Expenses with more than one tag are counted under each of their tags, so this total may exceed the overall total in the Expenses tab.";
    footnoteCell.font = { italic: true, size: 9.5, color: { argb: "FF6B7280" }, name: "Calibri" };
    footnoteCell.alignment = { vertical: "middle", horizontal: "left" };

    // Conditional format data bar on Total column
    if (sortedTagsList.length > 0) {
      summarySheet.addConditionalFormatting({
        ref: `B${startTagRow}:B${lastTagRow}`,
        rules: [
          {
            type: "dataBar",
            cfvo: [{ type: "min" }, { type: "max" }],
            color: { argb: "FF22C55E" },
          } as any,
        ],
      });
    }

    // Write buffer and stream
    const buffer = await workbook.xlsx.writeBuffer();

    // File name format: budget-tracker-export-{startDate}-to-{endDate}.xlsx
    const tripSlug = !isGeneralTrip ? `-${slugify(activeTripName)}` : "";
    const fileName = `budget-tracker-export${tripSlug}-${startFileStr}-to-${endFileStr}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    console.error("Excel export error:", error);
    return NextResponse.json(
      { error: "Failed to generate Excel export" },
      { status: 500 }
    );
  }
}
