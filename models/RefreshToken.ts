import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRefreshToken extends Document {
  userId: string;
  tokenHash: string;
  deviceInfo?: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true },
    deviceInfo: { type: String, default: "web" },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const RefreshToken: Model<IRefreshToken> =
  mongoose.models.RefreshToken ||
  mongoose.model<IRefreshToken>("RefreshToken", RefreshTokenSchema);
