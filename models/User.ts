import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash?: string | null;
  googleId?: string | null;
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
  sheetsLinked: boolean;
  sheetsSpreadsheetId?: string | null;
  sheetsLastSyncedAt?: Date | null;
  currency?: string;
  isSharingEnabled?: boolean;
  shareId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    googleId: { type: String, default: null },
    googleAccessToken: { type: String, default: null },
    googleRefreshToken: { type: String, default: null },
    sheetsLinked: { type: Boolean, default: false },
    sheetsSpreadsheetId: { type: String, default: null },
    sheetsLastSyncedAt: { type: Date, default: null },
    currency: { type: String, default: "INR" },
    isSharingEnabled: { type: Boolean, default: false },
    shareId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
