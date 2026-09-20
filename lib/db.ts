import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null };
}

export async function connectToDatabase(): Promise<typeof mongoose | null> {
  if (!MONGODB_URI) {
    // In dev without MongoDB URI, return null gracefully so caller can handle offline/mock mode
    return null;
  }

  // If connection exists and is ready, reuse it
  if (cached!.conn && cached!.conn.connection.readyState === 1) {
    return cached!.conn;
  }

  // If connection is not active or readyState is disconnected (0), reset and reconnect
  if (!cached!.promise || (cached!.conn && cached!.conn.connection.readyState !== 1)) {
    cached!.conn = null;
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 20000,
    };

    cached!.promise = mongoose.connect(MONGODB_URI, opts).then((m) => {
      return m;
    });
  }

  try {
    cached!.conn = await cached!.promise;
  } catch (e) {
    cached!.promise = null;
    cached!.conn = null;
    console.error("MongoDB connection error:", e);
    // Return null instead of throwing so callers' `if (!db)` guard fires
    // correctly — throwing here caused routes to return 500 instead of
    // handling the offline/DB-unavailable case gracefully.
    return null;
  }

  return cached!.conn;
}
