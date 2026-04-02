/**
 * 843 Teez Orders - SQLite Backup Script
 * --------------------------------------
 * This script creates a timestamped backup of the orders.db file.
 *
 * What it does:
 * - Reads the main database from /db/orders.db
 * - Creates a /backups folder if it doesn't exist
 * - Copies the database into /backups with a timestamped filename
 * - DOES NOT overwrite previous backups
 *
 * Example output:
 * backups/orders-2026-04-02_21-30-00.db
 *
 * How to run:
 * node scripts/backup-db.js
 *
 * Recommended:
 * Run daily using Windows Task Scheduler via backup-db.bat
 */

const fs = require("fs");
const path = require("path");

// Get the root of the project (one level up from /scripts)
const projectRoot = path.resolve(__dirname, "..");

// Path to the live SQLite database
const dbPath = path.join(projectRoot, "db", "orders.db");

// Where backups will be stored
const backupsDir = path.join(projectRoot, "backups");

/**
 * Ensures a directory exists.
 * If it doesn't, it creates it.
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Creates a timestamp string for the backup filename.
 * Format: YYYY-MM-DD_HH-MM-SS
 */
function makeTimestamp() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Main backup function
 */
function runBackup() {
  try {
    // Make sure the database exists before attempting backup
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database not found: ${dbPath}`);
    }

    // Ensure the backups folder exists
    ensureDir(backupsDir);

    // Create a timestamped filename
    const timestamp = makeTimestamp();
    const backupFileName = `orders-${timestamp}.db`;

    // Full path for the backup file
    const backupPath = path.join(backupsDir, backupFileName);

    // Copy the database file
    fs.copyFileSync(dbPath, backupPath);

    console.log(`Backup created: ${backupPath}`);
  } catch (error) {
    console.error("Backup failed:", error.message);
    process.exit(1);
  }
}

// Run the backup when the script is executed
runBackup();