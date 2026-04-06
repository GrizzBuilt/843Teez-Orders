/**
 * File: scripts/export-public-status.js
 * Purpose:
 * - Read safe order status data from the private SQLite DB
 * - Map internal statuses to customer-friendly labels
 * - Write a public JSON file into the 843 Teez website repo
 *
 * Run with:
 *   node scripts/export-public-status.js
 */

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// =====================
// CONFIG
// =====================

// Private orders DB (inside the Order MVP repo)
const DB_PATH = path.join(__dirname, "..", "db", "orders.db");

// Website repo location on the same machine
// CHANGE THIS to the real folder path of your 843 Teez website repo
const WEBSITE_REPO_PATH = "C:\\Users\\Todd\\Documents\\GrizzBuilt\\843teez-website";

// Public export file inside website repo
const OUTPUT_PATH = path.join(
  WEBSITE_REPO_PATH,
  "order-status",
  "data",
  "order-status.json"
);

// If true, include completed jobs in the export.
// For public dashboard v1, I recommend false.
const INCLUDE_COMPLETE = false;

// =====================
// HELPERS
// =====================

function mapStatusToPublicLabel(status) {
  const statusMap = {
    in_the_hole: "Order Received",
    on_deck: "In Queue",
    at_the_plate: "In Production",
    ready: "Ready for Pickup",
    complete: "Completed",
  };

  return statusMap[status] || "Order Received";
}

function getSafeCustomerName(fullName) {
  const trimmed = String(fullName || "").trim();

  if (!trimmed) {
    return "Customer";
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);

  // Last name only if possible
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }

  // Single-word fallback
  return parts[0];
}

function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildExportPayload(rows) {
  const exportedOrders = rows.map((job) => ({
    orderNumber: job.order_number,
    customer: getSafeCustomerName(job.customer_name),
    status: mapStatusToPublicLabel(job.status),
  }));

  return {
    generatedAt: new Date().toISOString(),
    count: exportedOrders.length,
    orders: exportedOrders,
  };
}

// =====================
// MAIN
// =====================

function exportPublicStatus() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error("Error opening database:", err.message);
      process.exit(1);
    }
  });

  let sql = `
    SELECT
      order_number,
      customer_name,
      status,
      updated_at
    FROM jobs
  `;

  if (!INCLUDE_COMPLETE) {
    sql += ` WHERE status != 'complete' `;
  }

  sql += ` ORDER BY created_at ASC, id ASC `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Error reading jobs:", err.message);
      db.close();
      process.exit(1);
    }

    try {
      const payload = buildExportPayload(rows);

      ensureDirectoryExists(OUTPUT_PATH);
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");

      console.log(`Export complete.`);
      console.log(`Orders exported: ${payload.count}`);
      console.log(`Output file: ${OUTPUT_PATH}`);
    } catch (writeErr) {
      console.error("Error writing export file:", writeErr.message);
      db.close();
      process.exit(1);
    }

    db.close((closeErr) => {
      if (closeErr) {
        console.error("Error closing database:", closeErr.message);
        process.exit(1);
      }
    });
  });
}

exportPublicStatus();
