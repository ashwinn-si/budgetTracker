import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { Tag } from "@/models/Tag";
import { Trip } from "@/models/Trip";
import { getCurrentUser } from "@/lib/auth";
import { GENERAL_TRIP_ID, getVisibleTripIds, tripIdMatchValues } from "@/lib/trips";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const tagIds = searchParams.get("tagIds")?.split(",").filter(Boolean);
    const tripId = searchParams.get("tripId") || GENERAL_TRIP_ID;

    const now = new Date();
    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
    const endDate = endDateParam ? new Date(endDateParam) : now;

    // Previous period for comparison (last month equivalent)
    const periodDuration = endDate.getTime() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - periodDuration);
    const prevEndDate = new Date(startDate.getTime());

    const db = await connectToDatabase();
    if (!db) {
      // Local fallback
      return NextResponse.json({
        totalSpend: 359.69,
        previousPeriodSpend: 420.0,
        spendChangePercentage: -14.36,
        trend: [],
        byTag: [],
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentMatch: any = {
      userId,
      date: { $gte: startDate, $lte: endDate },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevMatch: any = {
      userId,
      date: { $gte: prevStartDate, $lte: prevEndDate },
    };

    const userTrips = await Trip.find({ userId }).lean();
    const visibleTripIds = tripIdMatchValues(getVisibleTripIds(userTrips, tripId));
    currentMatch.tripId = { $in: visibleTripIds };
    prevMatch.tripId = { $in: visibleTripIds };

    if (tagIds && tagIds.length > 0) {
      // Cast valid 24-hex ids to ObjectId — tagIds is stored as ObjectId in Expense.tagIds,
      // so a raw string $in match here silently matched nothing.
      const tagObjectIds = tagIds
        .filter((tid) => mongoose.Types.ObjectId.isValid(tid) && /^[a-f\d]{24}$/i.test(tid))
        .map((tid) => new mongoose.Types.ObjectId(tid));
      if (tagObjectIds.length > 0) {
        currentMatch.tagIds = { $in: tagObjectIds };
        prevMatch.tagIds = { $in: tagObjectIds };
      }
    }

    // 1. Current period total
    const currentTotalRes = await Expense.aggregate([
      { $match: currentMatch },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalSpend = currentTotalRes[0]?.total || 0;

    // 2. Previous period total
    const prevTotalRes = await Expense.aggregate([
      { $match: prevMatch },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const previousPeriodSpend = prevTotalRes[0]?.total || 0;

    // Spend change percentage
    let spendChangePercentage = 0;
    if (previousPeriodSpend > 0) {
      spendChangePercentage =
        ((totalSpend - previousPeriodSpend) / previousPeriodSpend) * 100;
    }

    // 3. Trend by day
    const trendRes = await Expense.aggregate([
      { $match: currentMatch },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$date" },
          },
          amount: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const trend = trendRes.map((item) => ({
      date: item._id,
      amount: item.amount,
    }));

    // 4. By-tag breakdown
    const byTagRes = await Expense.aggregate([
      { $match: currentMatch },
      { $unwind: "$tagIds" },
      {
        $group: {
          _id: "$tagIds",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const tags = await Tag.find({ userId }).lean();
    const tagMap = new Map(tags.map((t) => [t._id.toString(), t]));

    const byTag = byTagRes.map((bt) => {
      const tag = tagMap.get(bt._id.toString());
      const percentage = totalSpend > 0 ? (bt.total / totalSpend) * 100 : 0;
      return {
        tagId: bt._id.toString(),
        name: tag?.name || "Other",
        colorKey: tag?.colorKey || "#22C55E",
        total: bt.total,
        count: bt.count,
        percentage: Math.round(percentage * 10) / 10,
      };
    });

    return NextResponse.json({
      totalSpend,
      previousPeriodSpend,
      spendChangePercentage,
      trend,
      byTag,
    });
  } catch (error: unknown) {
    console.error("GET /api/analytics error:", error);
    return NextResponse.json({ error: "Failed to generate analytics" }, { status: 500 });
  }
}
