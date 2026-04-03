/**
 * File: public/app.js
 * Project: 843Teez Orders
 * Purpose: Frontend logic for loading jobs, rendering the board, and handling status movement
 * Notes:
 * - Ultra-compact cards
 * - Expandable details
 * - Tiny quick-move arrows always visible
 * - Aging indicator uses business days + quantity/workflow logic
 * - Ready and Complete jobs do not age visually
 * - Aging badge is color-coded
 * - Stuck job detection added
 * - Quick flags added to compact card
 * - Mobile + tablet + desktop friendly
 */

// =====================
// Constants
// =====================
const STATUSES = [
  "in_the_hole",
  "on_deck",
  "at_the_plate",
  "ready",
  "complete",
];

// =====================
// Aging Logic
// Purpose:
// - Use business days instead of hours
// - Base expectations on quantity + workflow
// - Warning = at expected turnaround
// - Danger = 2+ business days past expected
// - Ready / Complete do not age visually
// =====================
const AGING_DANGER_BUFFER_DAYS = 2;

// =====================
// Stuck Job Logic
// Purpose:
// - Detect jobs sitting too long in a specific stage
// - Uses business days
// =====================
const STUCK_STAGE_THRESHOLDS = {
  in_the_hole: 4,
  on_deck: 3,
  at_the_plate: 2,
  ready: null,
  complete: null,
};

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getBusinessDaysBetween(startDateInput, endDateInput = new Date()) {
  const start = new Date(startDateInput);
  const end = new Date(endDateInput);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const current = startOfDay(start);
  const endDay = startOfDay(end);

  if (current >= endDay) {
    return 0;
  }

  let businessDays = 0;

  while (current < endDay) {
    const day = current.getDay();

    if (day !== 0 && day !== 6) {
      businessDays += 1;
    }

    current.setDate(current.getDate() + 1);
  }

  return businessDays;
}

function getProductionDaysByQuantity(quantity) {
  const qty = Number(quantity) || 1;

  if (qty <= 10) return 1;
  if (qty <= 24) return 2;
  if (qty <= 60) return 3;
  if (qty <= 100) return 4;
  return 5;
}

function getExpectedBusinessDays(job) {
  const qty = Number(job.quantity) || 1;
  let days = 0;

  if (!job.blanks_received) {
    if (job.blanks_ordered) {
      days += 4;
    } else {
      days += 2;
    }
  }

  if (job.print_type === "DTF") {
    const useArmourInk =
      job.dtf_source === "armour_ink" ||
      (!job.dtf_source && qty >= 10);

    const useInHouse =
      job.dtf_source === "in_house" ||
      (!job.dtf_source && qty < 10);

    if (!job.dtf_ready) {
      if (useArmourInk) {
        days += 5;
      } else if (useInHouse) {
        days += qty <= 10 ? 2 : 3;
      }
    }
  }

  if (job.print_type === "Screen Print") {
    days += 2;
  }

  days += getProductionDaysByQuantity(qty);

  return Math.max(days, 1);
}

function getElapsedBusinessDays(job) {
  if (!job?.created_at) return null;
  return getBusinessDaysBetween(job.created_at, new Date());
}

function isAgingTrackedStatus(status) {
  return status !== "ready" && status !== "complete";
}

function getAgingLevel(job) {
  if (!isAgingTrackedStatus(job.status)) return "";

  const elapsedDays = getElapsedBusinessDays(job);
  if (elapsedDays == null) return "";

  const expectedDays = getExpectedBusinessDays(job);

  if (elapsedDays >= expectedDays + AGING_DANGER_BUFFER_DAYS) {
    return "aging-danger";
  }

  if (elapsedDays >= expectedDays) {
    return "aging-warning";
  }

  return "aging-normal";
}

function getAgeLabel(job) {
  if (!isAgingTrackedStatus(job.status)) return "";

  const elapsedDays = getElapsedBusinessDays(job);
  if (elapsedDays == null) return "";

  const expectedDays = getExpectedBusinessDays(job);

  return `${elapsedDays}/${expectedDays}d`;
}

function getStuckLevel(job) {
  const threshold = STUCK_STAGE_THRESHOLDS[job.status];

  if (!threshold) return "";

  const elapsedDays = getElapsedBusinessDays(job);
  if (elapsedDays == null) return "";

  if (elapsedDays >= threshold) {
    return "stuck";
  }

  return "";
}

function getStuckLabel(job) {
  const threshold = STUCK_STAGE_THRESHOLDS[job.status];

  if (!threshold) return "";

  const elapsedDays = getElapsedBusinessDays(job);
  if (elapsedDays == null) return "";

  if (elapsedDays >= threshold) {
    return "Stuck";
  }

  return "";
}

// =====================
// DOM Elements
// =====================
const boardEl = document.querySelector(".board");
const showCompleteToggle = document.getElementById("show-complete-toggle");
const completeColumn = document.getElementById("complete-column");

const newOrderBtn = document.getElementById("new-order-btn");
const modalBackdrop = document.getElementById("job-modal-backdrop");
const modalEl = document.getElementById("job-modal");
const closeModalBtn = document.getElementById("close-modal-btn");
const cancelModalBtn = document.getElementById("cancel-modal-btn");
const newJobForm = document.getElementById("new-job-form");
const saveJobBtn = document.getElementById("save-job-btn");

// =====================
// Helpers
// =====================
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openModal() {
  modalBackdrop.classList.remove("hidden");
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
  newJobForm.reset();
  newJobForm.quantity.value = 1;
  newJobForm.status.value = "in_the_hole";
}

function showApiError(prefix, error) {
  const message = error?.message ? `${prefix}: ${error.message}` : prefix;
  alert(message);
}

function validateNewJobForm() {
  const orderNumber = newJobForm.order_number.value.trim();
  const customerName = newJobForm.customer_name.value.trim();
  const quantity = Number(newJobForm.quantity.value || 1);

  if (!orderNumber) {
    throw new Error("Order number is required");
  }

  if (!customerName) {
    throw new Error("Customer name is required");
  }

  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error("Quantity must be at least 1");
  }
}

function buildMetaPill(label, value) {
  return `<span class="meta-pill">${escapeHtml(label)}: ${escapeHtml(value)}</span>`;
}

function scrollToColumn(status) {
  const column = document.querySelector(`.column[data-status="${status}"]`);
  if (!column) return;

  column.scrollIntoView({
    behavior: "smooth",
    inline: "center",
    block: "nearest",
  });
}

function formatPrintType(printType) {
  if (!printType) return "";
  return printType;
}

// =====================
// Flag Builder
// =====================
function getFlags(job) {
  const flags = [];

  if (job.blanks_ordered) flags.push("Blanks Ordered");
  if (job.blanks_received) flags.push("Blanks Received");

  if (job.print_type === "DTF") {
    if (job.dtf_source === "in_house") flags.push("DTF In House");
    if (job.dtf_source === "armour_ink") flags.push("DTF Armour Ink");
    if (job.dtf_ready) flags.push("DTF Ready");
  }

  if (job.print_type === "Screen Print") {
    if (job.screens_made) flags.push("Screens Made");
    if (job.ink_on_hand) flags.push("Ink On Hand");
    if (job.ink_ordered) flags.push("Ink Ordered");
  }

  return flags;
}

function getQuickFlags(job) {
  const quickFlags = [];

  quickFlags.push({
    key: "blanks_ordered",
    label: "Ordered",
    active: Boolean(job.blanks_ordered),
  });

  quickFlags.push({
    key: "blanks_received",
    label: "Received",
    active: Boolean(job.blanks_received),
  });

  if (job.print_type === "DTF") {
    quickFlags.push({
      key: "dtf_ready",
      label: "DTF Ready",
      active: Boolean(job.dtf_ready),
    });
  }

  if (job.print_type === "Screen Print") {
    quickFlags.push({
      key: "screens_made",
      label: "Screens",
      active: Boolean(job.screens_made),
    });

    quickFlags.push({
      key: "ink_on_hand",
      label: "Ink",
      active: Boolean(job.ink_on_hand),
    });
  }

  return quickFlags;
}

// =====================
// API Calls
// =====================
async function parseApiResponse(response, fallbackMessage) {
  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || fallbackMessage);
  }

  return data;
}

async function updateJobStatus(jobId, newStatus) {
  const response = await fetch(`/api/jobs/${jobId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: newStatus }),
  });

  return parseApiResponse(response, "Failed to update job status");
}

async function createJob(payload) {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseApiResponse(response, "Failed to create job");
}

async function updateJobFlags(jobId, payload) {
  const response = await fetch(`/api/jobs/${jobId}/flags`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseApiResponse(response, "Failed to update job flags");
}

// =====================
// UI Rendering
// =====================
function createJobCard(job) {
  const article = document.createElement("article");
  article.className = "order-card";
  article.dataset.status = job.status;

  const agingLevel = getAgingLevel(job);
  const ageLabel = getAgeLabel(job);
  const stuckLevel = getStuckLevel(job);
  const stuckLabel = getStuckLabel(job);

  if (agingLevel) {
    article.classList.add(agingLevel);
  }

  if (stuckLevel) {
    article.classList.add(stuckLevel);
  }

  const flags = getFlags(job);
  const quickFlags = getQuickFlags(job);
  const currentIndex = STATUSES.indexOf(job.status);
  const canMoveLeft = currentIndex > 0;
  const canMoveRight = currentIndex < STATUSES.length - 1;

  const qtyPill = buildMetaPill("Qty", job.quantity || 0);
  const printTypePill = job.print_type
    ? buildMetaPill("Type", formatPrintType(job.print_type))
    : "";

  article.innerHTML = `
    <!-- Compact header -->
    <div class="card-top compact-card-top">
      <div class="card-top-left">
        <strong>#${escapeHtml(job.order_number)}</strong>
        ${ageLabel ? `<span class="age-badge ${escapeHtml(agingLevel)}">${escapeHtml(ageLabel)}</span>` : ""}
        ${stuckLabel ? `<span class="stuck-badge">${escapeHtml(stuckLabel)}</span>` : ""}
      </div>

      <div class="card-top-actions">
        <button
          type="button"
          class="mini-move-btn move-left-compact"
          ${!canMoveLeft ? "disabled" : ""}
          aria-label="Move job left"
          title="Move left"
        >
          ←
        </button>

        <button
          type="button"
          class="mini-move-btn move-right-compact"
          ${!canMoveRight ? "disabled" : ""}
          aria-label="Move job right"
          title="Move right"
        >
          →
        </button>
      </div>
    </div>

    <h3>${escapeHtml(job.customer_name)}</h3>

    ${
      quickFlags.length
        ? `<div class="quick-flags">
            ${quickFlags
              .map(
                (flag) => `
                  <button
                    type="button"
                    class="quick-flag-btn ${flag.active ? "active" : ""}"
                    data-flag-key="${escapeHtml(flag.key)}"
                    aria-pressed="${flag.active ? "true" : "false"}"
                    title="${escapeHtml(flag.label)}"
                  >
                    ${escapeHtml(flag.label)}
                  </button>
                `
              )
              .join("")}
          </div>`
        : ""
    }

    <button type="button" class="toggle-flags-btn">Details</button>

    <!-- Expanded details -->
    <div class="card-details hidden">
      <p class="card-items">${escapeHtml(job.items_summary || "")}</p>

      <div class="card-meta">
        ${qtyPill}
        ${printTypePill}
      </div>

      ${
        flags.length
          ? `<div class="flags">
              ${flags.map((f) => `<span class="flag">${escapeHtml(f)}</span>`).join("")}
            </div>`
          : ""
      }

      ${job.notes ? `<p class="notes">${escapeHtml(job.notes)}</p>` : ""}
    </div>
  `;

  const toggleBtn = article.querySelector(".toggle-flags-btn");
  const detailsEl = article.querySelector(".card-details");
  const compactMoveLeftBtn = article.querySelector(".move-left-compact");
  const compactMoveRightBtn = article.querySelector(".move-right-compact");
  const quickFlagButtons = article.querySelectorAll(".quick-flag-btn");

  toggleBtn.addEventListener("click", () => {
    const isHidden = detailsEl.classList.toggle("hidden");
    toggleBtn.textContent = isHidden ? "Details" : "Hide";
  });

  async function handleMove(newStatus, clickedButton) {
    try {
      if (clickedButton) clickedButton.disabled = true;
      await updateJobStatus(job.id, newStatus);
      await loadJobs();
      scrollToColumn(newStatus);
    } catch (error) {
      console.error(error);
      showApiError("Could not move job", error);
    }
  }

  async function handleQuickFlagToggle(flagKey, button) {
    try {
      button.disabled = true;
      const currentValue = Boolean(job[flagKey]);
      await updateJobFlags(job.id, { [flagKey]: !currentValue });
      await loadJobs();
      scrollToColumn(job.status);
    } catch (error) {
      console.error(error);
      showApiError("Could not update quick flag", error);
    }
  }

  if (canMoveLeft) {
    compactMoveLeftBtn.addEventListener("click", async () => {
      const newStatus = STATUSES[currentIndex - 1];
      await handleMove(newStatus, compactMoveLeftBtn);
    });
  }

  if (canMoveRight) {
    compactMoveRightBtn.addEventListener("click", async () => {
      const newStatus = STATUSES[currentIndex + 1];
      await handleMove(newStatus, compactMoveRightBtn);
    });
  }

  quickFlagButtons.forEach((button) => {
    const flagKey = button.dataset.flagKey;
    if (!flagKey) return;

    button.addEventListener("click", async () => {
      await handleQuickFlagToggle(flagKey, button);
    });
  });

  return article;
}

// =====================
// Column Helpers
// =====================
function resetColumns() {
  document.querySelectorAll(".column").forEach((column) => {
    const cardList = column.querySelector(".card-list");
    const countEl = column.querySelector(".count");

    if (cardList) cardList.innerHTML = "";
    if (countEl) countEl.textContent = "0";
  });
}

function updateColumnCounts() {
  document.querySelectorAll(".column").forEach((column) => {
    const countEl = column.querySelector(".count");
    const cards = column.querySelectorAll(".order-card");
    const cardList = column.querySelector(".card-list");

    if (countEl) countEl.textContent = String(cards.length);

    if (cardList && !cards.length) {
      cardList.innerHTML = `<p class="empty-state">No jobs here.</p>`;
    }
  });
}

// =====================
// Load Jobs
// =====================
async function loadJobs() {
  const showComplete = showCompleteToggle.checked;

  completeColumn.hidden = !showComplete;
  boardEl.classList.toggle("show-complete", showComplete);

  resetColumns();

  try {
    const response = await fetch(`/api/jobs?showComplete=${showComplete}`);
    const jobs = await parseApiResponse(response, "Failed to load jobs");

    jobs.forEach((job) => {
      const column = document.querySelector(`.column[data-status="${job.status}"]`);
      if (!column) return;

      const cardList = column.querySelector(".card-list");
      const emptyState = cardList.querySelector(".empty-state");

      if (emptyState) emptyState.remove();

      cardList.appendChild(createJobCard(job));
    });

    updateColumnCounts();
  } catch (error) {
    console.error("Failed to load jobs:", error);
  }
}

// =====================
// Save New Job
// =====================
async function handleSaveJob() {
  try {
    validateNewJobForm();

    const formData = new FormData(newJobForm);
    const payload = Object.fromEntries(formData.entries());

    payload.quantity = Number(payload.quantity || 1);

    saveJobBtn.disabled = true;
    await createJob(payload);
    closeModal();
    await loadJobs();
  } catch (err) {
    console.error(err);
    showApiError("Could not save job", err);
  } finally {
    saveJobBtn.disabled = false;
  }
}

// =====================
// Form Safety
// =====================
newJobForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

newJobForm.addEventListener("keydown", (event) => {
  const tagName = event.target.tagName.toLowerCase();

  if (event.key === "Enter" && tagName !== "textarea") {
    event.preventDefault();
  }
});

// =====================
// Modal Safety
// =====================
modalEl.addEventListener("click", (event) => {
  event.stopPropagation();
});

modalEl.addEventListener("mousedown", (event) => {
  event.stopPropagation();
});

// =====================
// Modal Events
// =====================
newOrderBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
cancelModalBtn.addEventListener("click", closeModal);
saveJobBtn.addEventListener("click", handleSaveJob);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalBackdrop.classList.contains("hidden")) {
    closeModal();
  }
});

// =====================
// Init
// =====================
showCompleteToggle.addEventListener("change", loadJobs);
loadJobs();