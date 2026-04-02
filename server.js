/**
 * File: server.js
 * Project: 843Teez Orders
 * Purpose: Main Express server, API routes, and SQLite database setup
 * Notes:
 * - Runs on the GrizzBuilt headless PC
 * - Serves both the API and frontend files
 * - Stores production jobs for the 843 Teez shop board
 * - Auto-moves jobs from In the Hole to On Deck when required materials/prep are ready
 */

// =====================
// Dependencies
// =====================
const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

// =====================
// App Config
// =====================
const app = express();
const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, "db");
const DB_PATH = path.join(DB_DIR, "orders.db");

// =====================
// Database Setup
// =====================
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      items_summary TEXT,
      quantity INTEGER DEFAULT 1,
      print_type TEXT,
      status TEXT NOT NULL DEFAULT 'in_the_hole',
      blanks_ordered INTEGER NOT NULL DEFAULT 0,
      blanks_received INTEGER NOT NULL DEFAULT 0,
      dtf_source TEXT,
      dtf_ready INTEGER NOT NULL DEFAULT 0,
      screens_made INTEGER NOT NULL DEFAULT 0,
      ink_on_hand INTEGER NOT NULL DEFAULT 0,
      ink_ordered INTEGER NOT NULL DEFAULT 0,
      ready_for_pickup INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);
});

// =====================
// Middleware
// =====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// =====================
// Helpers - Auto Move Logic
// Purpose:
// - Only auto-moves from In the Hole -> On Deck
// - Everything else stays manual
// =====================
function shouldMoveToOnDeck(job) {
  if (job.status !== "in_the_hole") {
    return false;
  }

  if (job.print_type === "DTF") {
    return Number(job.blanks_received) === 1 && Number(job.dtf_ready) === 1;
  }

  if (job.print_type === "Screen Print") {
    return (
      Number(job.blanks_received) === 1 &&
      Number(job.screens_made) === 1 &&
      Number(job.ink_on_hand) === 1
    );
  }

  return false;
}

function normalizeBoolean(value) {
  return value ? 1 : 0;
}

// =====================
// Routes - Health Check
// =====================
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// =====================
// Routes - Get Jobs
// Purpose:
// - Returns all active jobs by default
// - Complete jobs are hidden unless showComplete=true
// =====================
app.get("/api/jobs", (req, res) => {
  const showComplete = req.query.showComplete === "true";

  let sql = `
    SELECT *
    FROM jobs
  `;

  if (!showComplete) {
    sql += ` WHERE status != 'complete' `;
  }

  sql += ` ORDER BY created_at ASC, id ASC`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Error fetching jobs:", err.message);
      return res.status(500).json({ error: "Failed to fetch jobs" });
    }

    res.json(rows);
  });
});

// =====================
// Routes - Create Job
// Purpose:
// - Adds a new production job to the board
// - Defaults new jobs to In the Hole unless another status is provided
// =====================
app.post("/api/jobs", (req, res) => {
  const {
    order_number,
    customer_name,
    items_summary,
    quantity,
    print_type,
    status,
    blanks_ordered,
    blanks_received,
    dtf_source,
    dtf_ready,
    screens_made,
    ink_on_hand,
    ink_ordered,
    ready_for_pickup,
    notes,
  } = req.body;

  if (!order_number || !customer_name) {
    return res
      .status(400)
      .json({ error: "Order number and customer name are required" });
  }

  const validStatuses = [
    "in_the_hole",
    "on_deck",
    "at_the_plate",
    "ready",
    "complete",
  ];

  const finalStatus = validStatuses.includes(status) ? status : "in_the_hole";
  const completedAt = finalStatus === "complete" ? new Date().toISOString() : null;

  db.run(
    `
      INSERT INTO jobs (
        order_number,
        customer_name,
        items_summary,
        quantity,
        print_type,
        status,
        blanks_ordered,
        blanks_received,
        dtf_source,
        dtf_ready,
        screens_made,
        ink_on_hand,
        ink_ordered,
        ready_for_pickup,
        notes,
        completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      order_number,
      customer_name,
      items_summary || "",
      Number(quantity) || 1,
      print_type || "",
      finalStatus,
      normalizeBoolean(blanks_ordered),
      normalizeBoolean(blanks_received),
      dtf_source || "",
      normalizeBoolean(dtf_ready),
      normalizeBoolean(screens_made),
      normalizeBoolean(ink_on_hand),
      normalizeBoolean(ink_ordered),
      normalizeBoolean(ready_for_pickup),
      notes || "",
      completedAt,
    ],
    function (err) {
      if (err) {
        console.error("Error creating job:", err.message);
        return res.status(500).json({ error: "Failed to create job" });
      }

      res.status(201).json({
        ok: true,
        id: this.lastID,
      });
    }
  );
});

// =====================
// Routes - Update Job Flags
// Purpose:
// - Updates production/prep flags directly from a card
// - Auto-moves job from In the Hole to On Deck if requirements are met
// =====================
app.patch("/api/jobs/:id/flags", (req, res) => {
  const jobId = req.params.id;
  const allowedFields = [
    "blanks_ordered",
    "blanks_received",
    "dtf_source",
    "dtf_ready",
    "screens_made",
    "ink_on_hand",
    "ink_ordered",
    "ready_for_pickup",
  ];

  db.get(`SELECT * FROM jobs WHERE id = ?`, [jobId], (err, existingJob) => {
    if (err) {
      console.error("Error loading job for flag update:", err.message);
      return res.status(500).json({ error: "Failed to load job" });
    }

    if (!existingJob) {
      return res.status(404).json({ error: "Job not found" });
    }

    const updatedJob = { ...existingJob };

    allowedFields.forEach((field) => {
      if (field in req.body) {
        if (field === "dtf_source") {
          updatedJob[field] = req.body[field] || "";
        } else {
          updatedJob[field] = normalizeBoolean(req.body[field]);
        }
      }
    });

    if (shouldMoveToOnDeck(updatedJob)) {
      updatedJob.status = "on_deck";
    }

    db.run(
      `
        UPDATE jobs
        SET blanks_ordered = ?,
            blanks_received = ?,
            dtf_source = ?,
            dtf_ready = ?,
            screens_made = ?,
            ink_on_hand = ?,
            ink_ordered = ?,
            ready_for_pickup = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        updatedJob.blanks_ordered,
        updatedJob.blanks_received,
        updatedJob.dtf_source,
        updatedJob.dtf_ready,
        updatedJob.screens_made,
        updatedJob.ink_on_hand,
        updatedJob.ink_ordered,
        updatedJob.ready_for_pickup,
        updatedJob.status,
        jobId,
      ],
      function (updateErr) {
        if (updateErr) {
          console.error("Error updating job flags:", updateErr.message);
          return res.status(500).json({ error: "Failed to update job flags" });
        }

        res.json({
          ok: true,
          id: Number(jobId),
          status: updatedJob.status,
        });
      }
    );
  });
});

// =====================
// Routes - Update Job Status
// Purpose:
// - Moves a job left/right across board columns
// - Sets completed_at when moved to complete
// =====================
app.patch("/api/jobs/:id/status", (req, res) => {
  const jobId = req.params.id;
  const { status } = req.body;

  const validStatuses = [
    "in_the_hole",
    "on_deck",
    "at_the_plate",
    "ready",
    "complete",
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const completedAt = status === "complete" ? new Date().toISOString() : null;

  db.run(
    `
      UPDATE jobs
      SET status = ?,
          updated_at = CURRENT_TIMESTAMP,
          completed_at = ?
      WHERE id = ?
    `,
    [status, completedAt, jobId],
    function (err) {
      if (err) {
        console.error("Error updating job status:", err.message);
        return res.status(500).json({ error: "Failed to update job status" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json({ ok: true, id: Number(jobId), status });
    }
  );
});

// =====================
// Routes - Frontend Entry
// =====================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =====================
// Server Start
// =====================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`843Teez Orders running on port ${PORT}`);
});