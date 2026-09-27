import mongoose from "mongoose";
import { connectToDatabase } from "../../lib/db";
import { User } from "../../models/User";
import { Trip } from "../../models/Trip";
import { GENERAL_TRIP_ID } from "../../lib/trips";
import { renameSpreadsheet, tripSpreadsheetTitle } from "../../lib/server/googleSheets";
import { syncTripToSheet } from "../../lib/server/sheetsSync";

const isDryRun = process.argv.includes("--dry-run");

const LEGACY_SHEET_TITLE = "Budget Tracker (old)";
// Pause between trip syncs to stay well under the Sheets API per-user write quota.
const DELAY_BETWEEN_TRIPS_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  console.log(`Running migrate-27-09 ${isDryRun ? "(dry run)" : ""}`);
  const db = await connectToDatabase();
  if (!db) {
    console.error("Failed to connect: MONGODB_URI is not set or unreachable.");
    process.exit(1);
  }
  printTarget();

  // Step 1: backfill the per-trip Google Sheets fields
  let fieldsBackfilled = 0;
  for (const field of ["sheetsSpreadsheetId", "sheetsLastSyncedAt"]) {
    const filter = { [field]: { $exists: false } };
    if (isDryRun) {
      fieldsBackfilled += await Trip.countDocuments(filter);
    } else {
      const result = await Trip.updateMany(filter, { $set: { [field]: null } });
      fieldsBackfilled += result.modifiedCount;
    }
  }
  // Tab-id fields from an unreleased per-tab design; raw collection so the schema doesn't strip the $unset.
  const staleTabFilter = {
    $or: [{ sheetsExpensesTabId: { $exists: true } }, { sheetsSummaryTabId: { $exists: true } }],
  };
  let staleTabFieldsRemoved = 0;
  if (isDryRun) {
    staleTabFieldsRemoved = await Trip.collection.countDocuments(staleTabFilter);
  } else {
    const result = await Trip.collection.updateMany(staleTabFilter, {
      $unset: { sheetsExpensesTabId: "", sheetsSummaryTabId: "" },
    });
    staleTabFieldsRemoved = result.modifiedCount;
  }
  console.log(
    `Step 1: trip sheet fields backfilled: ${fieldsBackfilled}, stale tab-id fields removed: ${staleTabFieldsRemoved}`
  );

  // Step 2: split each legacy combined spreadsheet into one "Budget Tracker - <trip>" sheet per trip,
  // built from the database, then rename the old file to "Budget Tracker (old)". Nothing is deleted.
  const legacyUsers = await User.find({
    sheetsSpreadsheetId: { $nin: [null, ""] },
    googleAccessToken: { $nin: [null, ""] },
  });

  let usersSplit = 0;
  let usersSkipped = 0;
  let tripSheetsCreated = 0;
  let legacyFilesRenamed = 0;

  for (const user of legacyUsers) {
    const userId = user._id.toString();
    const legacySpreadsheetId = user.sheetsSpreadsheetId!;

    // General first, then by creation time, matching listTripsSorted (without its General upsert side effect).
    const trips = (await Trip.find({ userId })).sort((a, b) => {
      if (a.tripId === GENERAL_TRIP_ID) return -1;
      if (b.tripId === GENERAL_TRIP_ID) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const pending = trips.filter((t) => !t.sheetsSpreadsheetId);

    console.log(
      `  user ${userId}: ${pending.length} of ${trips.length} trip(s) need a sheet; legacy sheet ${legacySpreadsheetId}`
    );

    if (isDryRun) {
      for (const trip of pending) console.log(`    would create "${tripSpreadsheetTitle(trip.name)}"`);
      console.log(`    would rename legacy sheet to "${LEGACY_SHEET_TITLE}"`);
      tripSheetsCreated += pending.length;
      usersSplit++;
      continue;
    }

    let failed = false;
    for (const trip of pending) {
      try {
        const result = await syncTripToSheet({ user, trip, userTrips: trips });
        tripSheetsCreated++;
        console.log(`    created "${tripSpreadsheetTitle(trip.name)}" (${result.spreadsheetId})`);
      } catch (err) {
        failed = true;
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`    failed on trip "${trip.name}" (${trip.tripId}): ${reason}`);
        break;
      }
      await sleep(DELAY_BETWEEN_TRIPS_MS);
    }

    // Keep the legacy id on failure so a rerun retries; trips that already got a sheet are skipped then.
    if (failed) {
      usersSkipped++;
      continue;
    }

    if (await renameSpreadsheet(user, legacySpreadsheetId, LEGACY_SHEET_TITLE)) {
      legacyFilesRenamed++;
      user.sheetsSpreadsheetId = null;
      await user.save();
      usersSplit++;
    } else {
      console.warn(`    could not rename legacy sheet ${legacySpreadsheetId}; will retry on next run`);
      usersSkipped++;
    }
  }

  console.log(
    `Step 2: users with a legacy sheet: ${legacyUsers.length}, split: ${usersSplit}, skipped: ${usersSkipped}, ` +
      `trip sheets created: ${tripSheetsCreated}, legacy sheets renamed: ${legacyFilesRenamed}`
  );

  console.log("Migration complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error running migrate-27-09:", err);
  process.exit(1);
});
