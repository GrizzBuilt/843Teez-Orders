/**
 * File: server.js
 * Project: 843Teez Orders
 * Purpose: Main Express server, API routes, and SQLite database setup
 * Notes:
 * - Runs on the GrizzBuilt headless PC
 * - Serves both the API and frontend files
 * - Stores production jobs for the 843 Teez shop board
 * - Auto-moves jobs from In the Hole to On Deck when required materials/prep are ready
 * - Aging remains based on created_at
 * - Due date support added for promised job deadlines
 * - Edit Job route added for full board-based job updates
 * - Board refresh support added with /api/jobs/last-updated
 */

// =====================
// /server.js
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
      due_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);

  // =====================
  // Database Migration - Safe Column Adds
  // Purpose:
  // - Safely adds missing columns to existing live databases
  // - Prevents breaking older installs
  // =====================
  db.all(`PRAGMA table_info(jobs)`, [], (pragmaErr, columns) => {
    if (pragmaErr) {
      console.error("Error reading jobs table schema:", pragmaErr.message);
      return;
    }

    const hasDueDate = columns.some((column) => column.name === "due_date");
    const hasUpdatedAt = columns.some((column) => column.name === "updated_at");
    const hasCompletedAt = columns.some((column) => column.name === "completed_at");
    const hasAtPlateRemaining = columns.some(
      (column) => column.name === "at_plate_remaining"
    );

    if (!hasDueDate) {
      db.run(`ALTER TABLE jobs ADD COLUMN due_date TEXT`, (alterErr) => {
        if (alterErr) {
          console.error("Error adding due_date column:", alterErr.message);
        } else {
          console.log("Added due_date column to jobs table.");
        }
      });
    }

    if (!hasUpdatedAt) {
      db.run(
        `ALTER TABLE jobs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
        (alterErr) => {
          if (alterErr) {
            console.error("Error adding updated_at column:", alterErr.message);
          } else {
            console.log("Added updated_at column to jobs table.");

            db.run(
              `
                UPDATE jobs
                SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
              `,
              (seedErr) => {
                if (seedErr) {
                  console.error("Error seeding updated_at values:", seedErr.message);
                } else {
                  console.log("Seeded updated_at values for existing jobs.");
                }
              }
            );
          }
        }
      );
    }

    if (!hasCompletedAt) {
      db.run(`ALTER TABLE jobs ADD COLUMN completed_at DATETIME`, (alterErr) => {
        if (alterErr) {
          console.error("Error adding completed_at column:", alterErr.message);
        } else {
          console.log("Added completed_at column to jobs table.");
        }
      });
    }

    if (!hasAtPlateRemaining) {
      db.run(`ALTER TABLE jobs ADD COLUMN at_plate_remaining INTEGER`, (alterErr) => {
        if (alterErr) {
          console.error("Error adding at_plate_remaining column:", alterErr.message);
        } else {
          console.log("Added at_plate_remaining column to jobs table.");
        }
      });
    }
  });
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
// Helpers - Due Date
// Purpose:
// - Stores due dates in YYYY-MM-DD format
// - Accepts blank / missing values
// =====================
function normalizeDueDate(value) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();

  if (!trimmed) {
    return null;
  }

  const isValidDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);

  return isValidDateOnly ? trimmed : null;
}

// =====================
// Helpers - Job Validation / Normalization
// Purpose:
// - Keep create/edit routes consistent
// - Preserve manual status movement
// =====================
function getValidStatuses() {
  return [
    "in_the_hole",
    "on_deck",
    "at_the_plate",
    "ready",
    "complete",
  ];
}

function normalizeStatus(value, fallback = "in_the_hole") {
  const validStatuses = getValidStatuses();
  return validStatuses.includes(value) ? value : fallback;
}

function normalizePrintType(value) {
  if (!value) return "";

  const trimmed = String(value).trim();

  if (trimmed === "DTF") return "DTF";
  if (trimmed === "Screen Print") return "Screen Print";

  return "";
}

function normalizeDtfSource(value, printType) {
  if (printType !== "DTF") {
    return "";
  }

  const trimmed = String(value || "").trim();

  if (trimmed === "in_house" || trimmed === "armour_ink") {
    return trimmed;
  }

  return "";
}

function buildNormalizedJobPayload(input, options = {}) {
  const {
    existingJob = null,
    defaultStatus = "in_the_hole",
  } = options;

  const printType = normalizePrintType(input.print_type);

  const normalized = {
    order_number: String(input.order_number || "").trim(),
    customer_name: String(input.customer_name || "").trim(),
    items_summary: String(input.items_summary || "").trim(),
    quantity: Math.max(1, Number(input.quantity) || 1),
    print_type: printType,
    status: normalizeStatus(input.status, existingJob?.status || defaultStatus),
    blanks_ordered: normalizeBoolean(input.blanks_ordered),
    blanks_received: normalizeBoolean(input.blanks_received),
    dtf_source: normalizeDtfSource(input.dtf_source, printType),
    dtf_ready: normalizeBoolean(input.dtf_ready),
    screens_made: normalizeBoolean(input.screens_made),
    ink_on_hand: normalizeBoolean(input.ink_on_hand),
    ink_ordered: normalizeBoolean(input.ink_ordered),
    ready_for_pickup: normalizeBoolean(input.ready_for_pickup),
    notes: String(input.notes || "").trim(),
    due_date: normalizeDueDate(input.due_date),
  };

  if (printType !== "DTF") {
    normalized.dtf_source = "";
    normalized.dtf_ready = 0;
  }

  if (printType !== "Screen Print") {
    normalized.screens_made = 0;
    normalized.ink_on_hand = 0;
    normalized.ink_ordered = 0;
  }

  return normalized;
}

function getCompletedAtForStatusChange(newStatus, existingCompletedAt) {
  if (newStatus === "complete") {
    return existingCompletedAt || new Date().toISOString();
  }

  return null;
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
// Routes - Last Updated
// Purpose:
// - Returns the latest updated_at timestamp for the current board view
// - Supports smart frontend auto-refresh that only reloads when data changed
// =====================
app.get("/api/jobs/last-updated", (req, res) => {
  const showComplete = req.query.showComplete === "true";

  let sql = `
    SELECT MAX(updated_at) AS lastUpdated
    FROM jobs
  `;

  if (!showComplete) {
    sql += ` WHERE status != 'complete' `;
  }

  db.get(sql, [], (err, row) => {
    if (err) {
      console.error("Error fetching last updated timestamp:", err.message);
      return res.status(500).json({ error: "Failed to fetch last updated timestamp" });
    }

    res.json({
      lastUpdated: row?.lastUpdated || null,
    });
  });
});

// =====================
// Routes - Create Job
// Purpose:
// - Adds a new production job to the board
// - Defaults new jobs to In the Hole unless another status is provided
// - Keeps aging based on created_at
// - Stores optional due_date for promised deadline tracking
// =====================
app.post("/api/jobs", (req, res) => {
  const normalizedJob = buildNormalizedJobPayload(req.body, {
    defaultStatus: "in_the_hole",
  });

  if (!normalizedJob.order_number || !normalizedJob.customer_name) {
    return res
      .status(400)
      .json({ error: "Order number and customer name are required" });
  }

  const completedAt =
    normalizedJob.status === "complete" ? new Date().toISOString() : null;

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
        due_date,
        completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizedJob.order_number,
      normalizedJob.customer_name,
      normalizedJob.items_summary,
      normalizedJob.quantity,
      normalizedJob.print_type,
      normalizedJob.status,
      normalizedJob.blanks_ordered,
      normalizedJob.blanks_received,
      normalizedJob.dtf_source,
      normalizedJob.dtf_ready,
      normalizedJob.screens_made,
      normalizedJob.ink_on_hand,
      normalizedJob.ink_ordered,
      normalizedJob.ready_for_pickup,
      normalizedJob.notes,
      normalizedJob.due_date,
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
// Routes - Edit Job
// Purpose:
// - Updates a full job from the board edit modal
// - Preserves manual movement logic
// - Does NOT auto-move backward when flags are unchecked
// - Updates completed_at if status changes to/from complete
// =====================
app.patch("/api/jobs/:id", (req, res) => {
  const jobId = req.params.id;

  db.get(`SELECT * FROM jobs WHERE id = ?`, [jobId], (loadErr, existingJob) => {
    if (loadErr) {
      console.error("Error loading job for edit:", loadErr.message);
      return res.status(500).json({ error: "Failed to load job" });
    }

    if (!existingJob) {
      return res.status(404).json({ error: "Job not found" });
    }

    const normalizedJob = buildNormalizedJobPayload(req.body, {
      existingJob,
      defaultStatus: existingJob.status || "in_the_hole",
    });

    if (!normalizedJob.order_number || !normalizedJob.customer_name) {
      return res
        .status(400)
        .json({ error: "Order number and customer name are required" });
    }

    const completedAt = getCompletedAtForStatusChange(
      normalizedJob.status,
      existingJob.completed_at
    );

    db.run(
      `
        UPDATE jobs
        SET order_number = ?,
            customer_name = ?,
            items_summary = ?,
            quantity = ?,
            print_type = ?,
            status = ?,
            blanks_ordered = ?,
            blanks_received = ?,
            dtf_source = ?,
            dtf_ready = ?,
            screens_made = ?,
            ink_on_hand = ?,
            ink_ordered = ?,
            ready_for_pickup = ?,
            notes = ?,
            due_date = ?,
            updated_at = CURRENT_TIMESTAMP,
            completed_at = ?
        WHERE id = ?
      `,
      [
        normalizedJob.order_number,
        normalizedJob.customer_name,
        normalizedJob.items_summary,
        normalizedJob.quantity,
        normalizedJob.print_type,
        normalizedJob.status,
        normalizedJob.blanks_ordered,
        normalizedJob.blanks_received,
        normalizedJob.dtf_source,
        normalizedJob.dtf_ready,
        normalizedJob.screens_made,
        normalizedJob.ink_on_hand,
        normalizedJob.ink_ordered,
        normalizedJob.ready_for_pickup,
        normalizedJob.notes,
        normalizedJob.due_date,
        completedAt,
        jobId,
      ],
      function (updateErr) {
        if (updateErr) {
          console.error("Error updating job:", updateErr.message);
          return res.status(500).json({ error: "Failed to update job" });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: "Job not found" });
        }

        res.json({
          ok: true,
          id: Number(jobId),
          status: normalizedJob.status,
        });
      }
    );
  });
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
          updatedJob[field] =
            updatedJob.print_type === "DTF"
              ? normalizeDtfSource(req.body[field], updatedJob.print_type)
              : "";
        } else {
          updatedJob[field] = normalizeBoolean(req.body[field]);
        }
      }
    });

    if (updatedJob.print_type !== "DTF") {
      updatedJob.dtf_source = "";
      updatedJob.dtf_ready = 0;
    }

    if (updatedJob.print_type !== "Screen Print") {
      updatedJob.screens_made = 0;
      updatedJob.ink_on_hand = 0;
      updatedJob.ink_ordered = 0;
    }

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

        if (this.changes === 0) {
          return res.status(404).json({ error: "Job not found" });
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

  const validStatuses = getValidStatuses();

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  db.get(`SELECT * FROM jobs WHERE id = ?`, [jobId], (loadErr, existingJob) => {
    if (loadErr) {
      console.error("Error loading job for status update:", loadErr.message);
      return res.status(500).json({ error: "Failed to load job" });
    }

    if (!existingJob) {
      return res.status(404).json({ error: "Job not found" });
    }

    const completedAt = getCompletedAtForStatusChange(
      status,
      existingJob.completed_at
    );

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
