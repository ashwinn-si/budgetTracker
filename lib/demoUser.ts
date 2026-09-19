import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User, IUser } from "@/models/User";
import { Tag } from "@/models/Tag";
import { Expense } from "@/models/Expense";

export const DEMO_USER_EMAIL = "user@gmail.com";
export const DEMO_USER_PASSWORD = "root";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureDemoUserSeeded(): Promise<any> {
  const email = DEMO_USER_EMAIL.toLowerCase();

  // Find or create demo user
  let user = await User.findOne({ email });
  const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 10);

  if (!user) {
    user = await User.create({
      name: "Demo User",
      email,
      passwordHash,
      currency: "USD",
    });
  } else {
    // Ensure password is always valid for "root"
    const isValid = await bcrypt.compare(DEMO_USER_PASSWORD, user.passwordHash || "");
    if (!isValid) {
      user.passwordHash = passwordHash;
      await user.save();
    }
  }

  const userId = user._id.toString();

  // Ensure default demo tags exist for this demo user
  const defaultTagDefs = [
    { name: "Groceries", colorKey: "#22C55E" },
    { name: "Dining & Coffee", colorKey: "#F59E0B" },
    { name: "Housing & Bills", colorKey: "#3B82F6" },
    { name: "Health & Gym", colorKey: "#EC4899" },
    { name: "Transport", colorKey: "#14B8A6" },
    { name: "Entertainment", colorKey: "#8B5CF6" },
  ];

  const tagMap: Record<string, mongoose.Types.ObjectId> = {};

  for (const def of defaultTagDefs) {
    let tag = await Tag.findOne({ userId, name: def.name });
    if (!tag) {
      tag = await Tag.create({
        userId,
        name: def.name,
        colorKey: def.colorKey,
      });
    }
    tagMap[def.name] = tag._id as mongoose.Types.ObjectId;
  }

  // Ensure the 6 demo sample expenses exist for this user alone
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const demoExpenses = [
    {
      clientId: "demo-exp-1",
      userId,
      amount: 84.5,
      note: "Organic Market groceries & produce",
      tagIds: [tagMap["Groceries"]].filter(Boolean),
      date: new Date(currentYear, currentMonth, Math.max(1, now.getDate() - 1)),
      syncStatus: "synced" as const,
    },
    {
      clientId: "demo-exp-2",
      userId,
      amount: 14.2,
      note: "Espresso & matcha at artisan roastery",
      tagIds: [tagMap["Dining & Coffee"]].filter(Boolean),
      date: new Date(currentYear, currentMonth, now.getDate()),
      syncStatus: "synced" as const,
    },
    {
      clientId: "demo-exp-3",
      userId,
      amount: 145.0,
      note: "Electricity & gigabit fiber broadband",
      tagIds: [tagMap["Housing & Bills"]].filter(Boolean),
      date: new Date(currentYear, currentMonth, 3),
      syncStatus: "synced" as const,
    },
    {
      clientId: "demo-exp-4",
      userId,
      amount: 65.0,
      note: "Monthly bouldering & fitness pass",
      tagIds: [tagMap["Health & Gym"]].filter(Boolean),
      date: new Date(currentYear, currentMonth, 5),
      syncStatus: "synced" as const,
    },
    {
      clientId: "demo-exp-5",
      userId,
      amount: 32.0,
      note: "Metro transit card reload",
      tagIds: [tagMap["Transport"]].filter(Boolean),
      date: new Date(currentYear, currentMonth, 8),
      syncStatus: "synced" as const,
    },
    {
      clientId: "demo-exp-6",
      userId,
      amount: 18.99,
      note: "Streaming subscription",
      tagIds: [tagMap["Entertainment"]].filter(Boolean),
      date: new Date(currentYear, currentMonth, 10),
      syncStatus: "synced" as const,
    },
  ];

  for (const exp of demoExpenses) {
    const existing = await Expense.findOne({ clientId: exp.clientId, userId });
    if (!existing) {
      await Expense.create(exp);
    }
  }

  return user;
}
