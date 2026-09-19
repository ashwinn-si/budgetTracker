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
}

export interface LocalSaving {
  _id?: string;
  clientId: string;
  userId: string;
  amount: number;
  type: "deposit" | "withdrawal";
  note: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: "synced" | "pending" | "conflict";
  linkedExpenseId?: string;
}

export interface SyncQueueItem {
  id?: number;
  clientId: string;
  action: "create" | "update" | "delete";
  entity: "expense" | "tag" | "saving";
  payload: Record<string, unknown>;
  createdAt: number;
}

export class BudgetDatabase extends Dexie {
  expenses!: Table<LocalExpense, string>;
  tags!: Table<LocalTag, string>;
  savings!: Table<LocalSaving, string>;
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
      expenses: "clientId, _id, userId, date, syncStatus, *tagIds",
      tags: "_id, userId, name",
      syncQueue: "++id, clientId, entity, action, createdAt",
    });
    // v3: removes isSaving and fromSavings, adds savings table
    this.version(3).stores({
      expenses: "clientId, _id, userId, date, syncStatus, *tagIds",
      tags: "_id, userId, name",
      savings: "clientId, _id, userId, date, syncStatus, linkedExpenseId",
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
    await db.savings.clear();
    await db.syncQueue.clear();
  } catch (err) {
    console.error("Failed to clear local user data:", err);
  }
}


