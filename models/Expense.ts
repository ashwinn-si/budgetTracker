import mongoose, { Schema, Document, Model } from "mongoose";

export interface IExpense extends Document {
  userId: string;
  amount: number;
  note: string;
  tagIds: mongoose.Types.ObjectId[];
  date: Date;
  clientId?: string;
  syncStatus: "synced" | "pending" | "conflict";
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: "", trim: true },
    tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
    date: { type: Date, required: true, index: true },
    clientId: { type: String, index: true },
    syncStatus: {
      type: String,
      enum: ["synced", "pending", "conflict"],
      default: "synced",
    },
  },
  { timestamps: true }
);

// Indexes for high performance analytics queries
ExpenseSchema.index({ userId: 1, date: -1 });
ExpenseSchema.index({ userId: 1, tagIds: 1 });

export const Expense: Model<IExpense> =
  mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);
