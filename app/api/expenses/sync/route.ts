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

        if (item.action === "create") {
          // Check for existing expense by clientId (server deduplication)
          const existing = await Expense.findOne({ clientId: item.clientId, userId });
          if (!existing) {
            await Expense.create({
              userId,
              clientId: item.clientId,
              amount: Number(payload.amount) || 0,
              note: (payload.note as string) || "",
              tagIds: Array.isArray(payload.tagIds) ? payload.tagIds : [],
              date: payload.date ? new Date(payload.date as string) : new Date(),
              syncStatus: "synced",
            });
          } else {
            // Conflict resolution: last-write-wins based on updatedAt
            const serverUpdated = new Date(existing.updatedAt).getTime();
            const clientUpdated = payload.updatedAt
              ? new Date(payload.updatedAt as string).getTime()
              : item.createdAt;

            if (clientUpdated > serverUpdated) {
              existing.amount = Number(payload.amount) || existing.amount;
              existing.note = (payload.note as string) || existing.note;
              existing.tagIds = Array.isArray(payload.tagIds)
                ? (payload.tagIds as any)
                : existing.tagIds;
              if (payload.date) existing.date = new Date(payload.date as string);
              existing.syncStatus = "synced";
              await existing.save();
            }
          }
          processedCount++;
        } else if (item.action === "update") {
          const updateFilter: any = { userId };
          if (item.clientId) {
            updateFilter.$or = [{ clientId: item.clientId }, { _id: payload._id }];
          } else if (payload._id) {
            updateFilter._id = payload._id;
          }
          const existing: any = await Expense.findOne(updateFilter);
          if (existing) {
            existing.amount = Number(payload.amount) || existing.amount;
            existing.note = (payload.note as string) || existing.note;
            existing.tagIds = Array.isArray(payload.tagIds)
              ? (payload.tagIds as any)
              : existing.tagIds;
            if (payload.date) existing.date = new Date(payload.date as string);
            existing.syncStatus = "synced";
            await existing.save();
          }
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
        if (item.action === "create") {
          const existing = await Tag.findOne({
            userId,
            name: (payload.name as string)?.trim(),
          });
          if (!existing) {
            await Tag.create({
              userId,
              name: (payload.name as string)?.trim(),
              colorKey: (payload.colorKey as string) || "#22C55E",
            });
          }
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
