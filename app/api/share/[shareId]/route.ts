import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { Expense } from "@/models/Expense";
import { Saving } from "@/models/Saving";
import { Trip, ITrip } from "@/models/Trip";
import { ensureGeneralTrip } from "@/lib/server/trips";
import { GENERAL_TRIP_ID, getVisibleTripIds, getSourceTripIds, tripIdMatchValues } from "@/lib/trips";

interface CategoryBreakdownEntry {
  tagId: string;
  tagName: string;
  colorKey: string;
  total: number;
  isMirrored?: boolean;
  sourceTripId?: string;
  sourceTripName?: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const { shareId } = await params;
    if (!shareId) {
      return NextResponse.json({ error: "shareId is required" }, { status: 400 });
    }

    await connectToDatabase();

    let trip: ITrip | null = await Trip.findOne({ shareId });
    let ownerUserId: string;

    if (trip) {
      if (!trip.isSharingEnabled) {
        return NextResponse.json({ error: "Sharing is disabled for this trip" }, { status: 404 });
      }
      ownerUserId = trip.userId;
    } else {
      // Legacy fallback: pre-migration user-level share links.
      const legacyUser = await User.findOne({ shareId, isSharingEnabled: true });
      if (!legacyUser) {
        return NextResponse.json({ error: "Shared dashboard not found" }, { status: 404 });
      }
      ownerUserId = legacyUser._id.toString();
      const generalTrip = await ensureGeneralTrip(ownerUserId);
      // Once the General trip has any shareId of its own, sharing is managed per-trip
      // going forward, so the old user-level link is no longer authoritative.
      if (generalTrip.shareId) {
        return NextResponse.json({ error: "Shared dashboard not found" }, { status: 404 });
      }
      trip = generalTrip;
    }

    const user = await User.findById(ownerUserId);
    if (!user) {
      return NextResponse.json({ error: "Shared dashboard not found" }, { status: 404 });
    }

    const userTrips = await Trip.find({ userId: ownerUserId }).lean();
    const tripsById = new Map(userTrips.map((t) => [t.tripId, t]));
    const visibleTripIds = getVisibleTripIds(userTrips, trip.tripId);
    const sourceTripIds = new Set(getSourceTripIds(userTrips, trip.tripId));
    const matchValues = tripIdMatchValues(visibleTripIds);

    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month");
    const yearParam = url.searchParams.get("year");

    const now = new Date();
    const targetYear = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
    const targetMonth = monthParam ? parseInt(monthParam, 10) - 1 : now.getMonth();

    const startOfMonth = new Date(targetYear, targetMonth, 1);
    const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    const expenses = await Expense.find({
      userId: ownerUserId,
      tripId: { $in: matchValues },
      date: { $gte: startOfMonth, $lte: endOfMonth },
    })
      .populate("tagIds")
      .sort({ date: -1 })
      .lean();

    const toAmount = (v: unknown): number =>
      typeof v === "number" ? v : parseFloat(String(v)) || 0;

    const totalSpentThisMonth = expenses.reduce((sum, e) => sum + toAmount(e.amount), 0);

    let totalSavings: number | null = null;
    if (trip.tripId === GENERAL_TRIP_ID) {
      const savingsResult = await Saving.aggregate([
        { $match: { userId: ownerUserId } },
        {
          $group: {
            _id: null,
            totalDeposits: { $sum: { $cond: [{ $eq: ["$type", "deposit"] }, "$amount", 0] } },
            totalWithdrawals: { $sum: { $cond: [{ $eq: ["$type", "withdrawal"] }, "$amount", 0] } },
          },
        },
      ]);
      totalSavings =
        savingsResult.length > 0
          ? savingsResult[0].totalDeposits - savingsResult[0].totalWithdrawals
          : 0;
    }

    const breakdownMap = new Map<string, CategoryBreakdownEntry>();

    for (const exp of expenses) {
      const expTripId = (exp.tripId as string) || GENERAL_TRIP_ID;
      const amount = toAmount(exp.amount);
      const isOwn = expTripId === trip.tripId;

      if (isOwn) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawTags: any[] = (exp.tagIds as any[]) || [];
        for (const t of rawTags) {
          if (typeof t !== "object" || !t) continue;
          const tagId = t._id?.toString?.() || String(t._id);
          const key = `tag:${tagId}`;
          const entry = breakdownMap.get(key) || {
            tagId,
            tagName: t.name || "Unknown",
            colorKey: t.colorKey || "#888888",
            total: 0,
          };
          entry.total += amount;
          breakdownMap.set(key, entry);
        }
      } else if (sourceTripIds.has(expTripId)) {
        const sourceTrip = tripsById.get(expTripId);
        const key = `trip:${expTripId}`;
        const tripName = sourceTrip?.name || "Trip";
        const tagName = sourceTrip?.emoji ? `${sourceTrip.emoji} ${tripName}` : `✈ ${tripName}`;
        const entry = breakdownMap.get(key) || {
          tagId: key,
          tagName,
          colorKey: sourceTrip?.colorKey || "#22C55E",
          total: 0,
          isMirrored: true,
          sourceTripId: expTripId,
          sourceTripName: tripName,
        };
        entry.total += amount;
        breakdownMap.set(key, entry);
      }
    }

    const combinedTotal = Array.from(breakdownMap.values()).reduce((s, b) => s + b.total, 0);
    const categoryBreakdown = Array.from(breakdownMap.values())
      .sort((a, b) => b.total - a.total)
      .map((b) => ({
        ...b,
        percentage: combinedTotal > 0 ? ((b.total / combinedTotal) * 100).toFixed(1) : "0",
      }));

    const recentExpenses = expenses.slice(0, 50).map((exp) => {
      const expTripId = (exp.tripId as string) || GENERAL_TRIP_ID;
      const isOwn = expTripId === trip!.tripId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawTags: any[] = isOwn ? ((exp.tagIds as any[]) || []) : [];
      const tags = rawTags
        .filter((t) => typeof t === "object" && t)
        .map((t) => ({ name: t.name as string, colorKey: t.colorKey as string }));
      const sourceTrip = !isOwn ? tripsById.get(expTripId) : null;

      return {
        date: exp.date,
        note: exp.note || "",
        amount: toAmount(exp.amount),
        tags,
        sourceTrip: sourceTrip
          ? {
              tripId: sourceTrip.tripId,
              name: sourceTrip.name,
              emoji: sourceTrip.emoji,
              colorKey: sourceTrip.colorKey,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        userName: user.name,
        currency: user.currency || "INR",
        totalSpentThisMonth,
        totalSavings,
        categoryBreakdown,
        recentExpenses,
        trip: {
          tripId: trip.tripId,
          name: trip.name,
          emoji: trip.emoji,
          colorKey: trip.colorKey,
          status: trip.status,
          startDate: trip.startDate,
          endDate: trip.endDate,
        },
        month: new Date(targetYear, targetMonth, 1).toLocaleString("default", { month: "long" }),
        year: targetYear,
      },
    });
  } catch (error: unknown) {
    console.error("Error fetching shared dashboard:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
