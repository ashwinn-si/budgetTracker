import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITag extends Document {
  userId: string;
  name: string;
  colorKey: string;
  clientId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TagSchema = new Schema<ITag>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    colorKey: { type: String, required: true, default: "#22C55E" },
    clientId: { type: String, index: true },
  },
  { timestamps: true }
);

// Compound unique index on { userId, name }
TagSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Tag: Model<ITag> =
  mongoose.models.Tag || mongoose.model<ITag>("Tag", TagSchema);
