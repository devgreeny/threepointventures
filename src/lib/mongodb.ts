import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME ?? "3ptventures";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
}

function getClient(): MongoClient | null {
  if (!uri) return null;
  if (globalThis._mongoClient) return globalThis._mongoClient;
  const client = new MongoClient(uri);
  globalThis._mongoClient = client;
  return client;
}

/** Server-only MongoDB database. Returns null if MONGODB_URI is not set. */
export function getDb(): Db | null {
  const client = getClient();
  return client ? client.db(dbName) : null;
}
