import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISaving extends Document {
  userId: string;
  amount: number;
  type: "deposit" | "withdrawal";
  note: string;
  date: Date;
  clientId?: string;
  linkedExpenseId?: string;
  syncStatus: "synced" | "pending" | "conflict";
  createdAt: Date;
  updatedAt: Date;
}

const SavingSchema = new Schema<ISaving>(
  {
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ["deposit", "withdrawal"], required: true },
    note: { type: String, default: "", trim: true },
    date: { type: Date, required: true, index: true },
    clientId: { type: String, index: true },
    linkedExpenseId: { type: String, index: true },
    syncStatus: {
      type: String,
      enum: ["synced", "pending", "conflict"],
      default: "synced",
    },
  },
  { timestamps: true }
);

SavingSchema.index({ userId: 1, date: -1 });

export const Saving: Model<ISaving> =
  mongoose.models.Saving || mongoose.model<ISaving>("Saving", SavingSchema);
