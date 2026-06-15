import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath =
  process.env.DB_PATH || path.join(process.cwd(), "data", "ai-town.db");

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db: Database.Database = new Database(dbPath);

// WAL mode for better concurrent read performance, foreign keys for CASCADE
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export { db };
