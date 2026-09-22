import mongoose from "mongoose";
import { connectToDatabase } from "../../lib/db";
import { User } from "../../models/User";
import { Expense } from "../../models/Expense";
import { Tag } from "../../models/Tag";
import { Trip } from "../../models/Trip";
import { GENERAL_TRIP_ID } from "../../lib/trips";

const isDryRun = process.argv.includes("--dry-run");

function printTarget() {
  const uri = process.env.MONGODB_URI || "";
  try {
    const url = new URL(uri);
    console.log(`Target: ${url.host} (connection.name=${mongoose.connection.name})`);
  } catch {
    console.log(`Target: connection.name=${mongoose.connection.name}`);
  }
}

async function main() {
  console.log(`Running migrate-22-09 ${isDryRun ? "(dry run)" : ""}`);
  const db = await connectToDatabase();
  if (!db) {
    console.error("Failed to connect: MONGODB_URI is not set or unreachable.");
    process.exit(1);
  }
  printTarget();

  // Step 1: create General trips for every distinct userId
  const userIds = new Set<string>();
  const userDocs = await User.find({}, { _id: 1 }).lean();
  userDocs.forEach((u) => userIds.add(u._id.toString()));
  (await Expense.distinct("userId")).forEach((id: string) => userIds.add(id));
  (await Tag.distinct("userId")).forEach((id: string) => userIds.add(id));

  let tripsCreated = 0;
  if (isDryRun) {
    for (const userId of userIds) {
      const existing = await Trip.countDocuments({ userId, tripId: GENERAL_TRIP_ID });
      if (existing === 0) tripsCreated++;
    }
  } else {
    for (const userId of userIds) {
      const result = await Trip.updateOne(
        { userId, tripId: GENERAL_TRIP_ID },
        {
          $setOnInsert: {
            userId,
            tripId: GENERAL_TRIP_ID,
            name: "General",
            isDefault: true,
            status: "active",
            colorKey: "#22C55E",
            mirrorToTripIds: [],
          },
        },
        { upsert: true }
      );
      if (result.upsertedCount) tripsCreated++;
    }
  }
  console.log(`Step 1: General trips created: ${tripsCreated} (users seen: ${userIds.size})`);

  // Step 2: backfill tripId on expenses and tags
  let expensesBackfilled = 0;
  let tagsBackfilled = 0;
  const expenseFilter = { $or: [{ tripId: { $exists: false } }, { tripId: null }] };
  const tagFilter = { $or: [{ tripId: { $exists: false } }, { tripId: null }] };
  if (isDryRun) {
    expensesBackfilled = await Expense.countDocuments(expenseFilter);
    tagsBackfilled = await Tag.countDocuments(tagFilter);
  } else {
    const expenseResult = await Expense.updateMany(expenseFilter, { $set: { tripId: GENERAL_TRIP_ID } });
    expensesBackfilled = expenseResult.modifiedCount;
    const tagResult = await Tag.updateMany(tagFilter, { $set: { tripId: GENERAL_TRIP_ID } });
    tagsBackfilled = tagResult.modifiedCount;
  }
  console.log(`Step 2: expenses backfilled: ${expensesBackfilled}, tags backfilled: ${tagsBackfilled}`);

  // Step 3: move sharing from user to General trip
  let sharingMoved = 0;
  const usersWithShare = await User.collection
    .find({ shareId: { $exists: true, $ne: null } })
    .toArray();
  for (const u of usersWithShare) {
    const userId = u._id.toString();
    const generalTrip = await Trip.findOne({ userId, tripId: GENERAL_TRIP_ID });
    if (!generalTrip || generalTrip.shareId) continue;
    if (isDryRun) {
      sharingMoved++;
      continue;
    }
    generalTrip.shareId = u.shareId;
    generalTrip.isSharingEnabled = !!u.isSharingEnabled;
    await generalTrip.save();
    sharingMoved++;
  }
  console.log(`Step 3: sharing moved to General trip: ${sharingMoved}`);

  // Step 4: swap the tag index, then sync indexes
  if (isDryRun) {
    const indexes = await Tag.collection.indexes();
    const hasOldIndex = indexes.some((idx) => idx.name === "userId_1_name_1");
    console.log(`Step 4 (dry run): old Tag index userId_1_name_1 present: ${hasOldIndex}. Would create missing indexes on Trip, Tag, Expense.`);
  } else {
    const indexes = await Tag.collection.indexes();
    const hasOldIndex = indexes.some((idx) => idx.name === "userId_1_name_1");
    if (hasOldIndex) {
      await Tag.collection.dropIndex("userId_1_name_1");
      console.log("Step 4: dropped old Tag index userId_1_name_1");
    } else {
      console.log("Step 4: old Tag index userId_1_name_1 not present, skipping drop");
    }
    // createIndexes (not syncIndexes) so indexes added outside the schema are never dropped
    await Trip.createIndexes();
    await Tag.createIndexes();
    await Expense.createIndexes();
    console.log("Step 4: ensured indexes on Trip, Tag, Expense");
  }

  console.log("Migration complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error running migrate-22-09:", err);
  process.exit(1);
});
