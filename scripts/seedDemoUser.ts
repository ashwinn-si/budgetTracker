import { connectToDatabase } from "../lib/db";
import { ensureDemoUserSeeded, DEMO_USER_EMAIL, DEMO_USER_PASSWORD } from "../lib/demoUser";

async function main() {
  console.log("Connecting to MongoDB...");
  const db = await connectToDatabase();
  if (!db) {
    console.error("Failed to connect: MONGODB_URI is not set or unreachable.");
    process.exit(1);
  }

  console.log(`Ensuring demo user (${DEMO_USER_EMAIL}) is provisioned...`);
  const user = await ensureDemoUserSeeded();
  if (user) {
    console.log("✅ Demo user provisioned successfully!");
    console.log(`   Email: ${DEMO_USER_EMAIL}`);
    console.log(`   Password: ${DEMO_USER_PASSWORD}`);
    console.log(`   ID: ${user._id}`);
  } else {
    console.error("❌ Failed to provision demo user.");
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error seeding demo user:", err);
  process.exit(1);
});
