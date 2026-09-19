const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Load .env.local or .env
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      if (typeof process.loadEnvFile === "function") {
        try {
          process.loadEnvFile(fullPath);
          return;
        } catch {
          // Fall back to manual parsing
        }
      }
      const content = fs.readFileSync(fullPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
      return;
    }
  }
}

async function clearDatabase() {
  loadEnv();

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ Error: MONGODB_URI is not set in environment or .env.local");
    process.exit(1);
  }

  console.log("🔗 Connecting to MongoDB...");
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    console.log(`Connected to database: "${db.databaseName}"`);

    const collections = await db.listCollections().toArray();
    if (collections.length === 0) {
      console.log("ℹ️ No collections found in the database.");
      await mongoose.disconnect();
      return;
    }

    console.log(`\n🧹 Clearing ${collections.length} collection(s)...`);
    let totalDeleted = 0;

    for (const col of collections) {
      const name = col.name;
      // Skip system collections if any
      if (name.startsWith("system.")) continue;

      const result = await db.collection(name).deleteMany({});
      console.log(`  ✓ Cleared "${name}": ${result.deletedCount} document(s) deleted`);
      totalDeleted += result.deletedCount;
    }

    console.log(`\n✨ Successfully cleared entire database! Total documents deleted: ${totalDeleted}\n`);
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to clear database:", error);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  }
}

clearDatabase();
