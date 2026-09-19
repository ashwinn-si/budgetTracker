import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { Expense } from "@/models/Expense";
import { Saving } from "@/models/Saving";
import { Tag } from "@/models/Tag";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const { shareId } = await params; // Next.js dynamic routes context
    if (!shareId) {
      return NextResponse.json({ error: "shareId is required" }, { status: 400 });
    }

    await connectToDatabase();

    // 1. Find user by shareId
    const user = await User.findOne({ shareId });
    if (!user) {
      return NextResponse.json({ error: "Shared dashboard not found" }, { status: 404 });
    }

    if (!user.isSharingEnabled) {
      return NextResponse.json({ error: "Sharing is disabled for this user" }, { status: 403 });
    }

    const userId = user._id.toString();

    // 2. Compute date range
    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month");
    const yearParam = url.searchParams.get("year");

    const now = new Date();
    const targetYear = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
    const targetMonth = monthParam ? parseInt(monthParam, 10) - 1 : now.getMonth();

    const startOfMonth = new Date(targetYear, targetMonth, 1);
    const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    // 3. Aggregate Monthly Expenses
    const monthlyExpensesResult = await Expense.aggregate([
      {
        $match: {
          userId,
          date: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);
    const totalSpentThisMonth = monthlyExpensesResult[0]?.total || 0;

    // 4. Aggregate Net Savings (All Time)
    const savingsResult = await Saving.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalDeposits: {
            $sum: { $cond: [{ $eq: ["$type", "deposit"] }, "$amount", 0] },
          },
          totalWithdrawals: {
            $sum: { $cond: [{ $eq: ["$type", "withdrawal"] }, "$amount", 0] },
          },
        },
      },
    ]);

    const totalSavings = savingsResult.length > 0 
      ? savingsResult[0].totalDeposits - savingsResult[0].totalWithdrawals 
      : 0;

    // 5. Category Breakdown (Current Month)
    const categoryBreakdown = await Expense.aggregate([
      {
        $match: {
          userId,
          date: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      { $unwind: { path: "$tagIds", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$tagIds",
          total: { $sum: "$amount" },
        },
      },
      { $sort: { total: -1 } },
    ]);

    // Fetch tag details for the breakdown
    const tagIds = categoryBreakdown.map((b) => b._id);
    const tags = await Tag.find({ _id: { $in: tagIds } }).lean();
    
    const tagMap = new Map();
    tags.forEach((tag: unknown) => {
      const t = tag as { _id: { toString: () => string }, name: string, colorKey: string };
      tagMap.set(t._id.toString(), t);
    });

    const enrichedCategoryBreakdown = categoryBreakdown.map((b) => {
      const tag = tagMap.get(b._id.toString());
      return {
        tagId: b._id,
        tagName: tag ? tag.name : "Unknown",
        colorKey: tag ? tag.colorKey : "#888888",
        total: b.total,
        percentage: totalSpentThisMonth > 0 ? ((b.total / totalSpentThisMonth) * 100).toFixed(1) : 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        userName: user.name,
        currency: user.currency || "INR",
        totalSpentThisMonth,
        totalSavings,
        categoryBreakdown: enrichedCategoryBreakdown,
        month: now.toLocaleString('default', { month: 'long' }),
        year: now.getFullYear(),
      }
    });

  } catch (error: unknown) {
    console.error("Error fetching shared dashboard:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
