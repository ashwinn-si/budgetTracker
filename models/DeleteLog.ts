import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDeleteLog extends Document {
  userId: string;
  entityType: "expense" | "saving" | "tag";
  entityId: string;
  title: string;
  details?: string;
  data: Record<string, unknown>;
  deletedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeleteLogSchema = new Schema<IDeleteLog>(
  {
    userId: { type: String, required: true, index: true },
    entityType: {
      type: String,
      enum: ["expense", "saving", "tag"],
      required: true,
      index: true,
    },
    entityId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    details: { type: String, default: "", trim: true },
    data: { type: Schema.Types.Mixed, required: true },
    deletedAt: { type: Date, default: Date.now, index: -1 },
  },
  { timestamps: true }
);

DeleteLogSchema.index({ userId: 1, deletedAt: -1 });

export const DeleteLog: Model<IDeleteLog> =
  mongoose.models.DeleteLog ||
  mongoose.model<IDeleteLog>("DeleteLog", DeleteLogSchema);
