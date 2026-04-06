/**
 * File: scripts/export-public-status.js
 * Purpose:
 * - Read safe order status data from the private SQLite DB
 * - Map internal statuses to customer-friendly labels
 * - Write a public JSON file into the 843 Teez website repo
 *
 * Usage:
 *   node scripts/export-public-status.js
 *
 * Optional environment variables:
 *   WEBSITE_REPO_PATH=/workspaces/843teez-website
 *   INCLUDE_COMPLETE=true
 */

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "..", "db", "orders.db");

const WEBSITE_REPO_PATH =
  process.env.WEBSITE_REPO_PATH || "C:\\Users\\Todd\\Documents\\GrizzBuilt\\843Teez";

const OUTPUT_PATH = path.join(
  WEBSITE_REPO_PATH,
  "order-status",
  "data",
  "order-status.json"
);

const INCLUDE_COMPLETE = String(process.env.INCLUDE_COMPLETE || "false").toLowerCase() === "true";

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

  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }

  const first = parts[0];

  if (!first) {
    return "Customer";
  }

  return `${first.charAt(0).toUpperCase()}.`;
}

function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sortOrdersForPublicBoard(orders) {
  return orders.sort((a, b) => {
    const orderA = String(a.orderNumber || "");
    const orderB = String(b.orderNumber || "");

    return orderA.localeCompare(orderB, undefined, { numeric: true, sensitivity: "base" });
  });
}

function buildExportPayload(rows) {
  const exportedOrders = rows.map((job) => ({
    orderNumber: String(job.order_number || "").trim(),
    customer: getSafeCustomerName(job.customer_name),
    status: mapStatusToPublicLabel(job.status),
  }));

  return {
    generatedAt: new Date().toISOString(),
    count: exportedOrders.length,
    orders: sortOrdersForPublicBoard(exportedOrders),
  };
}

function exportPublicStatus() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(WEBSITE_REPO_PATH)) {
    console.error(`Website repo path not found: ${WEBSITE_REPO_PATH}`);
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
      updated_at,
      created_at,
      id
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
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

      console.log("Export complete.");
      console.log(`Orders exported: ${payload.count}`);
      console.log(`Include completed: ${INCLUDE_COMPLETE}`);
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