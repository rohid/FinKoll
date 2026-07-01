import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "./index";
import path from "path";

migrate(db, { migrationsFolder: path.resolve(__dirname, "migrations") });

console.log("Migrations applied successfully.");
sqlite.close();
