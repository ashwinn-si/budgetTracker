import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { Tag } from "@/models/Tag";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const tagIds = searchParams.get("tagIds")?.split(",").filter(Boolean);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = { userId };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    if (tagIds && tagIds.length > 0) {
      filter.tagIds = { $in: tagIds };
    }

    let expensesData: Array<{
      date: string;
      note: string;
      tags: string;
      amount: number;
    }> = [];

    const db = await connectToDatabase();
    if (db) {
      const expenses = await Expense.find(filter)
        .sort({ date: -1 })
        .populate("tagIds")
        .lean();

      expensesData = expenses.map((exp) => {
        const tagNames = (exp.tagIds as any[])
          ?.map((t) => (typeof t === "object" ? t.name : ""))
          .filter(Boolean)
          .join(", ");
        return {
          date: new Date(exp.date).toISOString().split("T")[0],
          note: exp.note || "No note",
          tags: tagNames || "Uncategorized",
          amount: exp.amount,
        };
      });
    } else {
      // Offline / dev fallback sample data for instant excel export testing
      expensesData = [
        { date: "2026-09-18", note: "Organic Market groceries", tags: "Groceries", amount: 84.5 },
        { date: "2026-09-17", note: "Artisan espresso & pastry", tags: "Dining & Coffee", amount: 14.2 },
        { date: "2026-09-15", note: "Fiber broadband & electricity", tags: "Housing & Bills", amount: 145.0 },
        { date: "2026-09-12", note: "Bouldering & gym membership", tags: "Health & Gym", amount: 65.0 },
        { date: "2026-09-08", note: "Transit metro card", tags: "Transport", amount: 32.0 },
      ];
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Budget Tracker";
    workbook.created = new Date();

    // Sheet 1: Expenses List
    const sheet = workbook.addWorksheet("Expenses", {
      views: [{ showGridLines: true }],
    });

    sheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Description", key: "note", width: 34 },
      { header: "Categories", key: "tags", width: 22 },
      { header: "Amount ($)", key: "amount", width: 16 },
    ];

    // Style Header Row in Emerald Theme
    const headerRow = sheet.getRow(1);
    headerRow.height = 28;
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF16A34A" }, // Emerald green
    };
    headerRow.alignment = { vertical: "middle", horizontal: "left" };

    // Add rows
    expensesData.forEach((item) => {
      const row = sheet.addRow(item);
      row.height = 22;
      row.alignment = { vertical: "middle" };
      row.getCell("amount").numFmt = "$#,##0.00";
    });

    // Summary Total Row
    const totalRowIndex = expensesData.length + 2;
    const totalRow = sheet.getRow(totalRowIndex);
    totalRow.height = 24;
    totalRow.getCell(2).value = "Total Spend";
    totalRow.getCell(2).font = { bold: true };
    totalRow.getCell(4).value = {
      formula: `SUM(D2:D${totalRowIndex - 1})`,
      result: expensesData.reduce((acc, curr) => acc + curr.amount, 0),
    };
    totalRow.getCell(4).font = { bold: true, color: { argb: "FF16A34A" } };
    totalRow.getCell(4).numFmt = "$#,##0.00";

    const buffer = await workbook.xlsx.writeBuffer();

    const fileName = `budget-expenses-${new Date().toISOString().split("T")[0]}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    console.error("Excel export error:", error);
    return NextResponse.json({ error: "Failed to generate Excel export" }, { status: 500 });
  }
}
