/**
 * File: scripts/export-public-status.js
 * Purpose:
 * - Read public order status data from the private SQLite DB
 * - Map internal statuses to customer-friendly labels
 * - Write a public JSON file into the 843 Teez website repo
 *
 * Usage:
 *   node scripts/export-public-status.js
 *
 * Optional environment variables:
 *   WEBSITE_REPO_PATH=/workspaces/843teez-website
 *   RECENT_COMPLETE_LIMIT=12
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

const RECENT_COMPLETE_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.RECENT_COMPLETE_LIMIT || "12", 10) || 12
);

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

function getPublicCustomerName(customerName) {
  const trimmed = String(customerName || "").trim();
  return trimmed || "Customer";
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

    return orderA.localeCompare(orderB, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function getSafeDateValue(value) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function normalizeJob(job) {
  return {
    orderNumber: String(job.order_number || "").trim(),
    customer: getPublicCustomerName(job.customer_name),
    status: mapStatusToPublicLabel(job.status),
    createdAt: job.created_at || null,
    updatedAt: job.updated_at || null,
    completedAt: job.completed_at || null,
  };
}

function buildExportPayload(rows) {
  const normalizedJobs = rows.map(normalizeJob);

  const activeOrders = normalizedJobs.filter((job) => job.status !== "Completed");

  const recentlyCompleted = normalizedJobs
    .filter((job) => job.status === "Completed")
    .sort((a, b) => {
      const aTime =
        getSafeDateValue(a.completedAt) ??
        getSafeDateValue(a.updatedAt) ??
        getSafeDateValue(a.createdAt) ??
        0;

      const bTime =
        getSafeDateValue(b.completedAt) ??
        getSafeDateValue(b.updatedAt) ??
        getSafeDateValue(b.createdAt) ??
        0;

      return bTime - aTime;
    })
    .slice(0, RECENT_COMPLETE_LIMIT);

  return {
    generatedAt: new Date().toISOString(),
    count: activeOrders.length,
    completedCount: recentlyCompleted.length,
    orders: sortOrdersForPublicBoard(activeOrders),
    recentlyCompleted,
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

  const sql = `
    SELECT
      order_number,
      customer_name,
      status,
      created_at,
      updated_at,
      completed_at,
      id
    FROM jobs
    ORDER BY created_at ASC, id ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Error reading jobs:", err.message);
      db.close();
      process.exit(1);
    }

    try {
      const payload = buildExportPayload(rows);

      ensureDirectoryExists(OUTPUT_PATH);
      fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(payload, null, 2) + "\n",
        "utf8"
      );

      console.log("Export complete.");
      console.log(`Active orders exported: ${payload.count}`);
      console.log(`Recently completed exported: ${payload.completedCount}`);
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
