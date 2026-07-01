import fs from "fs";
import path from "path";
import { sqlite } from "../db";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "finkoll.db");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

// Retention per label group. Safety backups (preupdate/presql) are kept
// separately so routine daily backups can never evict them.
const RETENTION: Record<string, number> = {
  daily: 7,
  weekly: 7,
  manual: 7,
  preupdate: 20,
  presql: 20,
  preimport: 20,
};
const DEFAULT_RETENTION = 7;

export type BackupLabel = "daily" | "weekly" | "manual" | "preupdate" | "presql" | "preimport";

export interface BackupEntry {
  filename: string;
  label: string;
  createdAt: string; // ISO
  sizeBytes: number;
}

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Create a backup by copying the database file.
 *
 * NOTE: we deliberately do NOT use SQLite's online backup API
 * (`sqlite.backup()`). With better-sqlite3-multiple-ciphers the source DB is
 * encrypted, and the online backup API creates a fresh, default target which
 * is cipher-incompatible — it throws "backup is not supported with
 * incompatible source and target databases". A plain file copy preserves the
 * encrypted bytes exactly (same key restores cleanly). We checkpoint the WAL
 * first so the copied main file is fully consistent.
 */
export async function createBackup(label: BackupLabel = "manual"): Promise<BackupEntry> {
  ensureBackupDir();

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const filename = `finkoll-${label}-${ts}.db`;
  const dest = path.join(BACKUP_DIR, filename);

  // Flush the WAL fully into the main DB file, then copy ONLY the main file.
  // After a TRUNCATE checkpoint the WAL is empty, so the main file is a
  // complete, self-contained snapshot. We must NOT copy the -wal/-shm sidecars
  // alongside it: a copied -shm carries the source connection's shared-memory
  // index and makes SQLite read an inconsistent (apparently empty) snapshot
  // when the backup is reopened.
  try {
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
  } catch (err) {
    console.error("[backup] WAL checkpoint before copy failed (continuing):", err);
  }

  fs.copyFileSync(DB_PATH, dest);

  const stat = fs.statSync(dest);
  pruneBackups();

  return {
    filename,
    label,
    createdAt: now.toISOString(),
    sizeBytes: stat.size,
  };
}

/**
 * Backup the raw DB file before migrations run, by direct file copy.
 * Called at startup BEFORE the schema can change, so there is always a
 * pre-update snapshot. Uses a plain copy because it runs before any query
 * and must not depend on the connection being healthy. No-op if no DB yet.
 */
export function backupBeforeMigrate(): string | null {
  if (!fs.existsSync(DB_PATH)) return null; // brand-new install, nothing to back up
  ensureBackupDir();
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const filename = `finkoll-preupdate-${ts}.db`;
  const dest = path.join(BACKUP_DIR, filename);
  fs.copyFileSync(DB_PATH, dest);
  // Copy WAL + SHM sidecar files too, so the snapshot is fully consistent
  for (const ext of ["-wal", "-shm"]) {
    if (fs.existsSync(DB_PATH + ext)) fs.copyFileSync(DB_PATH + ext, dest + ext);
  }
  pruneBackups();
  return filename;
}

/** List backups newest-first. */
export function listBackups(): BackupEntry[] {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db"));

  return files
    .map((filename) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, filename));
      // Parse label from filename: finkoll-<label>-<ts>.db
      const parts = filename.replace(/\.db$/, "").split("-");
      const label = parts[1] ?? "manual";
      return {
        filename,
        label,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Restore from a backup. Replaces the live DB file and reopens the connection. */
export function restoreBackup(filename: string): void {
  // Sanitise — no path traversal
  const safe = path.basename(filename);
  if (!safe.endsWith(".db") || !safe.startsWith("finkoll-")) {
    throw new Error("Invalid backup filename");
  }

  const src = path.join(BACKUP_DIR, safe);
  if (!fs.existsSync(src)) throw new Error("Backup not found");

  // Close the current connection (checkpoints + releases the live WAL/SHM)
  sqlite.close();

  // Remove the live WAL/SHM sidecars BEFORE swapping the file. Otherwise the
  // stale WAL from the pre-restore database would be applied on top of the
  // restored file on reopen — silently reverting or corrupting the restore.
  for (const ext of ["-wal", "-shm"]) {
    if (fs.existsSync(DB_PATH + ext)) fs.unlinkSync(DB_PATH + ext);
  }

  // Overwrite the live DB with the backup
  fs.copyFileSync(src, DB_PATH);

  // If the backup carries its own sidecars (e.g. a pre-migrate snapshot copied
  // before a checkpoint), restore them too so the snapshot stays consistent.
  for (const ext of ["-wal", "-shm"]) {
    if (fs.existsSync(src + ext)) fs.copyFileSync(src + ext, DB_PATH + ext);
  }

  // Reopen — reimport the db module so it re-encrypts with the same key
  // We signal the process to restart cleanly
  console.log(`Restored from ${safe}. Restarting process…`);
  process.exit(0); // Docker / nodemon will restart automatically
}

/** Download path for a backup file */
export function backupFilePath(filename: string): string {
  const safe = path.basename(filename);
  if (!safe.endsWith(".db") || !safe.startsWith("finkoll-")) {
    throw new Error("Invalid backup filename");
  }
  const full = path.join(BACKUP_DIR, safe);
  if (!fs.existsSync(full)) throw new Error("Backup not found");
  return full;
}

/** Keep only the newest N files per label group (safety backups retained longer). */
function pruneBackups() {
  ensureBackupDir();
  const byLabel = new Map<string, { f: string; mtime: number }[]>();

  for (const f of fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db"))) {
    const label = f.replace(/\.db$/, "").split("-")[1] ?? "manual";
    const mtime = fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime();
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label)!.push({ f, mtime });
  }

  for (const [label, files] of byLabel) {
    const keep = RETENTION[label] ?? DEFAULT_RETENTION;
    files.sort((a, b) => b.mtime - a.mtime);
    files.slice(keep).forEach(({ f }) => {
      // Remove the .db and any WAL/SHM sidecars
      for (const ext of ["", "-wal", "-shm"]) {
        const p = path.join(BACKUP_DIR, f + ext);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    });
  }
}
