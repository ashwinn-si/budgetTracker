export interface CategoryBreakdown {
  tagId: string;
  tagName: string;
  colorKey: string;
  total: number;
  percentage: string;
  isMirrored?: boolean;
  sourceTripId?: string;
  sourceTripName?: string;
}

export interface RecentExpenseTag {
  name: string;
  colorKey: string;
}

export interface RecentExpenseSourceTrip {
  tripId: string;
  name: string;
  emoji: string;
  colorKey: string;
}

export interface RecentExpense {
  date: string;
  note: string;
  amount: number;
  tags: RecentExpenseTag[];
  sourceTrip: RecentExpenseSourceTrip | null;
}

export interface TripInfo {
  tripId: string;
  name: string;
  emoji: string;
  colorKey: string;
  status: "active" | "completed";
  startDate: string | null;
  endDate: string | null;
}

export interface CombinedTripOption {
  tripId: string;
  name: string;
  emoji: string;
  colorKey: string;
  status: "active" | "completed";
}

export interface CombinedInfo {
  trips: CombinedTripOption[];
  selectedTripId: string;
}

export interface SharedData {
  userName: string;
  currency: string;
  mode: "monthly" | "full";
  totalSpent: number;
  totalSpentThisMonth: number;
  totalSavings: number | null;
  categoryBreakdown: CategoryBreakdown[];
  recentExpenses: RecentExpense[];
  expenseCount: number;
  range: { from: string | null; to: string | null } | null;
  dailyAverage: number | null;
  trip: TripInfo;
  month: string;
  year: number;
  combined?: CombinedInfo | null;
}
