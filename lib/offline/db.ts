import Dexie, { Table } from "dexie";

export interface LocalTag {
  _id: string;
  userId: string;
  name: string;
  colorKey: string;
  createdAt?: string;
  tripId?: string;
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
  syncStatus: "synced" | "syncing" | "pending" | "conflict";
  tripId?: string;
}

export interface LocalTrip {
  tripId: string;
  _id?: string;
  userId: string;
  name: string;
  emoji: string;
  colorKey: string;
  isDefault: boolean;
  status: "active" | "completed";
  completedAt?: string | null;
  mirrorToTripIds: string[];
  startDate?: string | null;
  endDate?: string | null;
  isSharingEnabled?: boolean;
  shareId?: string | null;
  shareMode?: "monthly" | "full";
  createdAt?: string;
  updatedAt?: string;
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
  syncStatus: "synced" | "syncing" | "pending" | "conflict";
  linkedExpenseId?: string;
}

export interface LocalDeleteLog {
  id: string; // unique UUID or timestamp-based ID
  _id?: string; // MongoDB ObjectId if synced
  userId: string;
  entityType: "expense" | "saving" | "tag" | "trip";
  entityId: string;
  title: string;
  details?: string;
  data: Record<string, unknown>;
  deletedAt: string; // ISO string
  syncStatus?: "synced" | "syncing" | "pending";
}

export interface SyncQueueItem {
  id?: number;
  clientId: string;
  action: "create" | "update" | "delete";
  entity: "expense" | "tag" | "saving" | "trip";
  payload: Record<string, unknown>;
  createdAt: number;
}

export class BudgetDatabase extends Dexie {
  expenses!: Table<LocalExpense, string>;
  tags!: Table<LocalTag, string>;
  savings!: Table<LocalSaving, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  deleteLogs!: Table<LocalDeleteLog, string>;
  trips!: Table<LocalTrip, string>;

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
    // v4: adds deleteLogs table for soft delete / recovery history
    this.version(4).stores({
      expenses: "clientId, _id, userId, date, syncStatus, *tagIds",
      tags: "_id, userId, name",
      savings: "clientId, _id, userId, date, syncStatus, linkedExpenseId",
      syncQueue: "++id, clientId, entity, action, createdAt",
      deleteLogs: "id, userId, entityType, deletedAt",
    });
    // v5: adds trips table and tripId indexes on expenses/tags for Trip mode
    this.version(5)
      .stores({
        expenses: "clientId, _id, userId, tripId, date, syncStatus, *tagIds",
        tags: "_id, userId, tripId, name, [tripId+name]",
        savings: "clientId, _id, userId, date, syncStatus, linkedExpenseId",
        syncQueue: "++id, clientId, entity, action, createdAt",
        deleteLogs: "id, userId, entityType, deletedAt",
        trips: "tripId, userId, status",
      })
      .upgrade(async (tx) => {
        await tx
          .table("expenses")
          .toCollection()
          .modify((exp: LocalExpense) => {
            if (!exp.tripId) exp.tripId = "general";
          });
        await tx
          .table("tags")
          .toCollection()
          .modify((tag: LocalTag) => {
            if (!tag.tripId) tag.tripId = "general";
          });
        await tx
          .table("syncQueue")
          .toCollection()
          .modify((item: SyncQueueItem) => {
            if (
              (item.entity === "expense" || item.entity === "tag") &&
              item.payload &&
              !item.payload.tripId
            ) {
              item.payload.tripId = "general";
            }
          });
      });

    // v6: adds entityId index on deleteLogs for deduplication and soft-delete queries
    this.version(6).stores({
      deleteLogs: "id, userId, entityType, entityId, deletedAt",
    });
  }
}

export const db = new BudgetDatabase();

// Clean up any legacy default tags (e.g. tag_groceries) that were previously pre-seeded
export async function cleanUpLegacyDefaultTags() {
  if (typeof window === "undefined") return;
  try {
    const legacyIds = new Set([
      "tag_groceries",
      "tag_dining",
      "tag_housing",
      "tag_wellness",
      "tag_transport",
      "tag_leisure",
    ]);

    const allTags = await db.tags.toArray();
    const legacyTags = allTags.filter((t) => legacyIds.has(t._id));
    if (legacyTags.length === 0) return;

    // Build map of non-legacy tags by normalized name
    const legitimateTagsByName = new Map<string, LocalTag>();
    for (const t of allTags) {
      if (!legacyIds.has(t._id)) {
        legitimateTagsByName.set(t.name.trim().toLowerCase(), t);
      }
    }

    const allExpenses = await db.expenses.toArray();
    const queueItems = await db.syncQueue.toArray();

    for (const lTag of legacyTags) {
      const normName = lTag.name.trim().toLowerCase();
      const existingReal = legitimateTagsByName.get(normName);

      if (existingReal) {
        // Remap expenses from legacy ID to the real tag's ObjectId
        for (const exp of allExpenses) {
          if (Array.isArray(exp.tagIds) && exp.tagIds.includes(lTag._id)) {
            exp.tagIds = exp.tagIds.map((id) => (id === lTag._id ? existingReal._id : id));
            await db.expenses.put(exp);
          }
        }
        // Remap syncQueue items
        for (const q of queueItems) {
          if (q.entity === "expense" && Array.isArray(q.payload?.tagIds)) {
            const pIds = q.payload.tagIds as string[];
            if (pIds.includes(lTag._id)) {
              q.payload.tagIds = pIds.map((id) => (id === lTag._id ? existingReal._id : id));
              await db.syncQueue.put(q);
            }
          }
        }
      }

      // Delete the legacy fake tag record from Dexie
      await db.tags.delete(lTag._id);
    }
  } catch (err) {
    console.error("[cleanUpLegacyDefaultTags] Error:", err);
  }
}

// Kept for backward compatibility: runs cleanup rather than seeding hardcoded fake tags
export async function seedInitialDataIfEmpty() {
  if (typeof window === "undefined") return;
  await cleanUpLegacyDefaultTags();
}

// Clear all local user expenses, tags, savings, and syncQueue (used on logout or user switch)
export async function clearLocalUserData() {
  if (typeof window === "undefined") return;
  try {
    await db.expenses.clear();
    await db.tags.clear();
    await db.savings.clear();
    await db.syncQueue.clear();
    await db.deleteLogs.clear();
    await db.trips.clear();
  } catch (err) {
    console.error("Failed to clear local user data:", err);
  }
}

// Ensure the built-in General trip exists locally (protects users created before a pull completes)
export async function ensureLocalGeneralTrip(userId: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = await db.trips.get("general");
    if (existing) return;
    const generalTrip: LocalTrip = {
      tripId: "general",
      userId,
      name: "General",
      emoji: "",
      colorKey: "#22C55E",
      isDefault: true,
      status: "active",
      mirrorToTripIds: [],
    };
    await db.trips.put(generalTrip);
  } catch (err) {
    console.error("Failed to ensure local General trip:", err);
  }
}



