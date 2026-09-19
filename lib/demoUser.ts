import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User, IUser } from "@/models/User";
import { Tag } from "@/models/Tag";
import { Expense } from "@/models/Expense";
import { Saving } from "@/models/Saving";

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

  // Clear existing demo data to ensure a fresh seed
  await Expense.deleteMany({ userId });
  await Saving.deleteMany({ userId });

  const now = new Date();
  
  // Seed ~150 expenses over the last 90 days
  const tagsKeys = Object.keys(tagMap);
  const demoExpenses = [];
  const demoSavings = [];
  
  for (let i = 1; i <= 150; i++) {
    const daysAgo = Math.floor(Math.random() * 90);
    const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const tagKey = tagsKeys[Math.floor(Math.random() * tagsKeys.length)];
    const tagId = tagMap[tagKey];
    
    // Vary the amount based on tag
    let amount = 0;
    if (tagKey === "Groceries") amount = 20 + Math.random() * 80;
    if (tagKey === "Dining & Coffee") amount = 5 + Math.random() * 30;
    if (tagKey === "Housing & Bills") amount = 50 + Math.random() * 150;
    if (tagKey === "Health & Gym") amount = 15 + Math.random() * 60;
    if (tagKey === "Transport") amount = 10 + Math.random() * 40;
    if (tagKey === "Entertainment") amount = 20 + Math.random() * 70;
    
    // 20% chance it was paid from Savings
    const isFromSavings = Math.random() < 0.2;
    const expenseClientId = `demo-exp-${i}`;
    
    demoExpenses.push({
      clientId: expenseClientId,
      userId,
      amount: Number(amount.toFixed(2)),
      note: `Random ${tagKey} expense`,
      tagIds: [tagId].filter(Boolean),
      date,
      syncStatus: "synced" as const,
    });
    
    if (isFromSavings) {
      demoSavings.push({
        clientId: `demo-sav-wd-${i}`,
        userId,
        amount: Number(amount.toFixed(2)),
        type: "withdrawal",
        note: `Withdrawal for ${tagKey} expense`,
        date,
        linkedExpenseId: expenseClientId,
        syncStatus: "synced" as const,
      });
    }
  }
  
  // Seed a few large deposits
  for (let i = 1; i <= 10; i++) {
    const daysAgo = Math.floor(Math.random() * 90);
    const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    demoSavings.push({
      clientId: `demo-sav-dep-${i}`,
      userId,
      amount: Number((100 + Math.random() * 400).toFixed(2)),
      type: "deposit",
      note: "Salary / Bonus allocation",
      date,
      syncStatus: "synced" as const,
    });
  }

  await Expense.insertMany(demoExpenses);
  await Saving.insertMany(demoSavings);

  return user;
}
