import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User, IUser } from "@/models/User";
import { Expense } from "@/models/Expense";
import { Saving } from "@/models/Saving";
import { Trip } from "@/models/Trip";
import { ensureGeneralTrip } from "@/lib/server/trips";
import {
  GENERAL_TRIP_ID,
  getVisibleTripIds,
  getSourceTripIds,
  tripIdMatchValues,
  getEffectiveShareMode,
  sortTripsForCombinedShare,
} from "@/lib/trips";
import { differenceInCalendarDays } from "date-fns";

interface CategoryBreakdownEntry {
  tagId: string;
  tagName: string;
  colorKey: string;
  total: number;
  isMirrored?: boolean;
  sourceTripId?: string;
  sourceTripName?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ShareTrip = any;

async function buildSharePayload(params: {
  trip: ShareTrip;
  ownerUserId: string;
  user: IUser;
  userTrips: ShareTrip[];
  monthParam: string | null;
  yearParam: string | null;
}) {
  const { trip, ownerUserId, user, userTrips, monthParam, yearParam } = params;

  const tripsById = new Map(userTrips.map((t) => [t.tripId, t]));
  const visibleTripIds = getVisibleTripIds(userTrips, trip.tripId);
  const sourceTripIds = new Set(getSourceTripIds(userTrips, trip.tripId));
  const matchValues = tripIdMatchValues(visibleTripIds);

  const mode = getEffectiveShareMode(trip);

  const now = new Date();
  const targetYear = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
  const targetMonth = monthParam ? parseInt(monthParam, 10) - 1 : now.getMonth();

  const startOfMonth = new Date(targetYear, targetMonth, 1);
  const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

  const dateFilter =
    mode === "full" ? {} : { date: { $gte: startOfMonth, $lte: endOfMonth } };

  const expenses = await Expense.find({
    userId: ownerUserId,
    tripId: { $in: matchValues },
    ...dateFilter,
  })
    .populate("tagIds")
    .sort({ date: -1 })
    .lean();

  const toAmount = (v: unknown): number =>
    typeof v === "number" ? v : parseFloat(String(v)) || 0;

  const totalSpentThisMonth = expenses.reduce((sum, e) => sum + toAmount(e.amount), 0);

  let range: { from: string | null; to: string | null } = { from: null, to: null };
  let dailyAverage = 0;
  if (mode === "full") {
    if (trip.startDate && trip.endDate) {
      range = { from: trip.startDate.toISOString(), to: trip.endDate.toISOString() };
    } else if (expenses.length > 0) {
      const dates = expenses.map((e) => new Date(e.date).getTime());
      range = {
        from: new Date(Math.min(...dates)).toISOString(),
        to: new Date(Math.max(...dates)).toISOString(),
      };
    }
    if (range.from && range.to) {
      const days = Math.max(1, differenceInCalendarDays(new Date(range.to), new Date(range.from)) + 1);
      dailyAverage = totalSpentThisMonth / days;
    }
  }

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

  const recentExpenses = expenses.slice(0, mode === "full" ? 500 : 200).map((exp) => {
    const expTripId = (exp.tripId as string) || GENERAL_TRIP_ID;
    const isOwn = expTripId === trip.tripId;
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

  return {
    userName: user.name,
    currency: user.currency || "INR",
    mode,
    totalSpent: totalSpentThisMonth,
    totalSpentThisMonth,
    totalSavings,
    categoryBreakdown,
    recentExpenses,
    expenseCount: expenses.length,
    range: mode === "full" ? range : null,
    dailyAverage: mode === "full" ? dailyAverage : null,
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
  };
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

    let trip: ShareTrip = await Trip.findOne({ shareId });
    let ownerUserId: string;
    let isCombinedMode = false;

    if (trip) {
      if (!trip.isSharingEnabled) {
        return NextResponse.json({ error: "Sharing is disabled for this trip" }, { status: 404 });
      }
      ownerUserId = trip.userId;
    } else {
      const combinedUser = await User.findOne({
        combinedShareId: shareId,
        isCombinedSharingEnabled: true,
      });
      if (combinedUser) {
        ownerUserId = combinedUser._id.toString();
        isCombinedMode = true;
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
    }

    const user = await User.findById(ownerUserId);
    if (!user) {
      return NextResponse.json({ error: "Shared dashboard not found" }, { status: 404 });
    }

    const userTrips = await Trip.find({ userId: ownerUserId }).lean();

    let combinedInfo: {
      trips: { tripId: string; name: string; emoji: string; colorKey: string; status: string }[];
      selectedTripId: string;
    } | null = null;

    if (isCombinedMode) {
      const included = sortTripsForCombinedShare(userTrips.filter((t) => t.isSharingEnabled));
      if (included.length === 0) {
        return NextResponse.json({ error: "Shared dashboard not found" }, { status: 404 });
      }
      const url = new URL(request.url);
      const tripIdParam = url.searchParams.get("tripId");
      const selected = (tripIdParam && included.find((t) => t.tripId === tripIdParam)) || included[0];
      trip = selected;
      combinedInfo = {
        trips: included.map((t) => ({
          tripId: t.tripId,
          name: t.name,
          emoji: t.emoji,
          colorKey: t.colorKey,
          status: t.status,
        })),
        selectedTripId: selected.tripId,
      };
    }

    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month");
    const yearParam = url.searchParams.get("year");

    const data = await buildSharePayload({ trip, ownerUserId, user, userTrips, monthParam, yearParam });

    return NextResponse.json({
      success: true,
      data: { ...data, combined: combinedInfo },
    });
  } catch (error: unknown) {
    console.error("Error fetching shared dashboard:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
