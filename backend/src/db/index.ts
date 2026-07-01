import Database from "better-sqlite3-multiple-ciphers";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, "finkoll.db");
const encKey = process.env.DB_ENCRYPTION_KEY;

if (!encKey) {
  console.error("FATAL: DB_ENCRYPTION_KEY environment variable is not set.");
  process.exit(1);
}

const sqlite = new Database(dbPath);
sqlite.pragma(`key='${encKey}'`);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
export { sqlite };
