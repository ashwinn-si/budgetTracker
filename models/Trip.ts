import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITrip extends Document {
  userId: string;
  tripId: string;
  name: string;
  emoji: string;
  colorKey: string;
  isDefault: boolean;
  status: "active" | "completed";
  completedAt: Date | null;
  mirrorToTripIds: string[];
  startDate: Date | null;
  endDate: Date | null;
  isSharingEnabled: boolean;
  shareId?: string;
  shareMode?: "monthly" | "full";
  createdAt: Date;
  updatedAt: Date;
}

const TripSchema = new Schema<ITrip>(
  {
    userId: { type: String, required: true, index: true },
    tripId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    emoji: { type: String, default: "" },
    colorKey: { type: String, default: "#22C55E" },
    isDefault: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
    },
    completedAt: { type: Date, default: null },
    mirrorToTripIds: [{ type: String }],
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    isSharingEnabled: { type: Boolean, default: false },
    shareId: { type: String, unique: true, sparse: true },
    shareMode: { type: String, enum: ["monthly", "full"] },
  },
  { timestamps: true }
);

TripSchema.index({ userId: 1, tripId: 1 }, { unique: true });

export const Trip: Model<ITrip> =
  mongoose.models.Trip || mongoose.model<ITrip>("Trip", TripSchema);
