import Dexie, { Table } from "dexie";

export interface LocalTag {
  _id: string;
  userId: string;
  name: string;
  colorKey: string;
  createdAt?: string;
}

export interface LocalExpense {
  _id?: string;
  clientId: string;
  userId: string;
  amount: number;
  note: string;
  tagIds: string[];
  date: string; // ISO date string (YYYY-MM-DD or full ISO)
  createdAt: string;
  updatedAt: string;
  syncStatus: "synced" | "pending" | "conflict";
  /** True when this entry adds money to the savings balance */
  isSaving?: boolean;
  /** True when this expense was paid out of the savings balance */
  fromSavings?: boolean;
}

export interface SyncQueueItem {
  id?: number;
  clientId: string;
  action: "create" | "update" | "delete";
  entity: "expense" | "tag";
  payload: Record<string, unknown>;
  createdAt: number;
}

export class BudgetDatabase extends Dexie {
  expenses!: Table<LocalExpense, string>;
  tags!: Table<LocalTag, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super("BudgetTrackerDB");
    this.version(1).stores({
      expenses: "clientId, _id, userId, date, syncStatus, *tagIds",
      tags: "_id, userId, name",
      syncQueue: "++id, clientId, entity, action, createdAt",
    });
    // v2: adds isSaving and fromSavings boolean columns
    this.version(2).stores({
      expenses: "clientId, _id, userId, date, syncStatus, *tagIds, isSaving, fromSavings",
      tags: "_id, userId, name",
      syncQueue: "++id, clientId, entity, action, createdAt",
    });
  }
}

export const db = new BudgetDatabase();

// Pre-seeded initial tags with curated harmonious glassmorphism colors
export const DEFAULT_TAGS: LocalTag[] = [
  { _id: "tag_groceries", userId: "local_user", name: "Groceries", colorKey: "#22C55E" },
  { _id: "tag_dining", userId: "local_user", name: "Dining & Coffee", colorKey: "#F59E0B" },
  { _id: "tag_housing", userId: "local_user", name: "Housing & Bills", colorKey: "#3B82F6" },
  { _id: "tag_wellness", userId: "local_user", name: "Health & Gym", colorKey: "#EC4899" },
  { _id: "tag_transport", userId: "local_user", name: "Transport", colorKey: "#14B8A6" },
  { _id: "tag_leisure", userId: "local_user", name: "Entertainment", colorKey: "#8B5CF6" },
];

// Helper to seed initial tags if empty
export async function seedInitialDataIfEmpty() {
  if (typeof window === "undefined") return;

  const tagCount = await db.tags.count();
  if (tagCount === 0) {
    await db.tags.bulkPut(DEFAULT_TAGS);
  }
  // Note: We DO NOT auto-seed sample expenses for general users.
  // General users start with a clean ledger.
}

// Clear all local user expenses and syncQueue (used on logout or user switch)
export async function clearLocalUserData() {
  if (typeof window === "undefined") return;
  try {
    await db.expenses.clear();
    await db.syncQueue.clear();
  } catch (err) {
    console.error("Failed to clear local user data:", err);
  }
}

// Dedicated seed helper ONLY for demo user (user@gmail.com)
export async function seedDemoExpensesForUser(userId: string = "demo_user") {
  if (typeof window === "undefined") return;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const sampleExpenses: LocalExpense[] = [
    {
      clientId: "demo-exp-1",
      userId,
      amount: 84.5,
      note: "Organic Market groceries & produce",
      tagIds: ["tag_groceries"],
      date: new Date(currentYear, currentMonth, Math.max(1, now.getDate() - 1)).toISOString().split("T")[0],
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      syncStatus: "synced",
    },
    {
      clientId: "demo-exp-2",
      userId,
      amount: 14.2,
      note: "Espresso & matcha at artisan roastery",
      tagIds: ["tag_dining"],
      date: new Date(currentYear, currentMonth, now.getDate()).toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: "synced",
    },
    {
      clientId: "demo-exp-3",
      userId,
      amount: 145.0,
      note: "Electricity & gigabit fiber broadband",
      tagIds: ["tag_housing"],
      date: new Date(currentYear, currentMonth, 3).toISOString().split("T")[0],
      createdAt: new Date(currentYear, currentMonth, 3).toISOString(),
      updatedAt: new Date(currentYear, currentMonth, 3).toISOString(),
      syncStatus: "synced",
    },
    {
      clientId: "demo-exp-4",
      userId,
      amount: 65.0,
      note: "Monthly bouldering & fitness pass",
      tagIds: ["tag_wellness"],
      date: new Date(currentYear, currentMonth, 5).toISOString().split("T")[0],
      createdAt: new Date(currentYear, currentMonth, 5).toISOString(),
      updatedAt: new Date(currentYear, currentMonth, 5).toISOString(),
      syncStatus: "synced",
    },
    {
      clientId: "demo-exp-5",
      userId,
      amount: 32.0,
      note: "Metro transit card reload",
      tagIds: ["tag_transport"],
      date: new Date(currentYear, currentMonth, 8).toISOString().split("T")[0],
      createdAt: new Date(currentYear, currentMonth, 8).toISOString(),
      updatedAt: new Date(currentYear, currentMonth, 8).toISOString(),
      syncStatus: "synced",
    },
    {
      clientId: "demo-exp-6",
      userId,
      amount: 18.99,
      note: "Streaming subscription",
      tagIds: ["tag_leisure"],
      date: new Date(currentYear, currentMonth, 10).toISOString().split("T")[0],
      createdAt: new Date(currentYear, currentMonth, 10).toISOString(),
      updatedAt: new Date(currentYear, currentMonth, 10).toISOString(),
      syncStatus: "synced",
    },
  ];

  await db.expenses.bulkPut(sampleExpenses);
}
