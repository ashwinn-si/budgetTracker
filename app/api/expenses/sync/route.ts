import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { Tag } from "@/models/Tag";
import { getCurrentUser } from "@/lib/auth";

interface SyncItem {
  clientId: string;
  action: "create" | "update" | "delete";
  entity: "expense" | "tag";
  payload: Record<string, unknown>;
  createdAt: number;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const userId = user?.userId || "local_user";

    const { items } = (await req.json()) as { items: SyncItem[] };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    const db = await connectToDatabase();
    if (!db) {
      // Offline / DB not connected: acknowledge receipt for local Dexie
      return NextResponse.json({
        success: true,
        processed: items.length,
        offlineMode: true,
      });
    }

    let processedCount = 0;

    for (const item of items) {
      if (item.entity === "expense") {
        const payload = item.payload;

        if (item.action === "create" || item.action === "update") {
          const filter: any = item.clientId
            ? { clientId: item.clientId, userId }
            : { _id: payload._id, userId };

          const updateDoc = {
            userId,
            clientId: item.clientId,
            amount: Number(payload.amount) || 0,
            note: (payload.note as string) || "",
            tagIds: Array.isArray(payload.tagIds) ? payload.tagIds : [],
            date: payload.date ? new Date(payload.date as string) : new Date(),
            syncStatus: "synced",
            isSaving: Boolean(payload.isSaving),
            fromSavings: Boolean(payload.fromSavings),
            ...(payload.updatedAt ? { updatedAt: new Date(payload.updatedAt as string) } : {}),
          };

          await Expense.findOneAndUpdate(
            filter,
            { $set: updateDoc },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          processedCount++;
        } else if (item.action === "delete") {
          const deleteFilter: any = { userId };
          if (item.clientId && payload.id) {
            deleteFilter.$or = [{ clientId: item.clientId }, { _id: payload.id }];
          } else if (item.clientId) {
            deleteFilter.clientId = item.clientId;
          } else if (payload.id) {
            deleteFilter._id = payload.id;
          }
          await Expense.deleteOne(deleteFilter);
          processedCount++;
        }
      } else if (item.entity === "tag") {
        const payload = item.payload;
        if (item.action === "create" || item.action === "update") {
          const filter: any = item.clientId
            ? { _id: item.clientId, userId }
            : { name: payload.name as string, userId };
          await Tag.findOneAndUpdate(
            filter,
            {
              $set: {
                userId,
                name: payload.name as string,
                colorKey: (payload.colorKey as string) || "#22C55E",
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          processedCount++;
        } else if (item.action === "delete") {
          await Tag.deleteOne({ _id: item.clientId, userId });
          processedCount++;
        }
      }
    }

    return NextResponse.json({ success: true, processed: processedCount });
  } catch (error: unknown) {
    console.error("POST /api/expenses/sync error:", error);
    return NextResponse.json({ error: "Failed to sync items" }, { status: 500 });
  }
}
