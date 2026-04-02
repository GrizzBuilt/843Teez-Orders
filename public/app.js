/**
 * File: public/app.js
 * Project: 843Teez Orders
 * Purpose: Frontend logic for loading jobs, rendering the board, and handling status movement
 * Notes:
 * - Pulls jobs from the API
 * - Renders cards into the correct workflow column
 * - Handles left/right status movement
 * - Handles creating new jobs from the modal form
 * - Handles toggling production flags directly on cards
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

function formatPrintType(printType) {
  if (!printType) return "";
  return printType;
}

function buildMetaPill(label, value) {
  return `<span class="meta-pill">${escapeHtml(label)}: ${escapeHtml(value)}</span>`;
}

// =====================
// Card Flag Builder
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
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: newStatus }),
  });

  return parseApiResponse(response, "Failed to update job status");
}

async function createJob(payload) {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseApiResponse(response, "Failed to create job");
}

async function updateJobFlags(jobId, payload) {
  const response = await fetch(`/api/jobs/${jobId}/flags`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseApiResponse(response, "Failed to update job flags");
}

// =====================
// UI Rendering
// =====================
function createCheckboxToggle(labelText, checked, onChange) {
  const label = document.createElement("label");
  label.className = "flag-toggle";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.addEventListener("change", () => onChange(input.checked));

  const text = document.createElement("span");
  text.textContent = labelText;

  label.appendChild(input);
  label.appendChild(text);

  return label;
}

function createDtfSourceToggle(job, onChange) {
  const label = document.createElement("label");
  label.className = "flag-toggle";

  const text = document.createElement("span");
  text.textContent = "DTF Source";

  const select = document.createElement("select");
  select.innerHTML = `
    <option value="">None / N/A</option>
    <option value="in_house">In House</option>
    <option value="armour_ink">Armour Ink</option>
  `;
  select.value = job.dtf_source || "";
  select.addEventListener("change", () => onChange(select.value));

  label.appendChild(text);
  label.appendChild(select);

  return label;
}

function createJobCard(job) {
  const article = document.createElement("article");
  article.className = "order-card";
  article.dataset.status = job.status;

  const flags = getFlags(job);
  const printBadgeClass =
    job.print_type === "Screen Print" ? "badge screen" : "badge";

  const currentIndex = STATUSES.indexOf(job.status);
  const canMoveLeft = currentIndex > 0;
  const canMoveRight = currentIndex >= 0 && currentIndex < STATUSES.length - 1;

  const qtyPill = buildMetaPill("Qty", job.quantity || 0);
  const printTypePill = job.print_type
    ? buildMetaPill("Type", formatPrintType(job.print_type))
    : "";

  article.innerHTML = `
    <div class="card-top">
      <strong>#${escapeHtml(job.order_number)}</strong>
      ${
        job.print_type
          ? `<span class="${printBadgeClass}">${escapeHtml(job.print_type)}</span>`
          : ""
      }
    </div>
    <h3>${escapeHtml(job.customer_name)}</h3>
    <p class="card-items">${escapeHtml(job.items_summary || "")}</p>
    <div class="card-meta">
      ${qtyPill}
      ${printTypePill}
    </div>
    ${job.notes ? `<p class="notes">${escapeHtml(job.notes)}</p>` : ""}
    ${
      flags.length
        ? `<div class="flags">
            ${flags.map((flag) => `<span class="flag">${escapeHtml(flag)}</span>`).join("")}
          </div>`
        : ""
    }
    <button type="button" class="toggle-flags-btn">Details</button>
    <div class="flag-toggles hidden"></div>
    <div class="card-actions">
      <button type="button" class="move-left" ${!canMoveLeft ? "disabled" : ""}>←</button>
      <button type="button" class="move-right" ${!canMoveRight ? "disabled" : ""}>→</button>
    </div>
  `;

  const toggleBtn = article.querySelector(".toggle-flags-btn");
  const flagTogglesEl = article.querySelector(".flag-toggles");
  const moveLeftBtn = article.querySelector(".move-left");
  const moveRightBtn = article.querySelector(".move-right");

  toggleBtn.addEventListener("click", () => {
    const isHidden = flagTogglesEl.classList.toggle("hidden");
    toggleBtn.textContent = isHidden ? "Details" : "Hide Details";
  });

  async function handleFlagUpdate(payload) {
    try {
      await updateJobFlags(job.id, payload);
      await loadJobs();
    } catch (error) {
      console.error(error);
      showApiError("Could not update job flags", error);
    }
  }

  flagTogglesEl.appendChild(
    createCheckboxToggle("Blanks Ordered", job.blanks_ordered, (checked) =>
      handleFlagUpdate({ blanks_ordered: checked })
    )
  );

  flagTogglesEl.appendChild(
    createCheckboxToggle("Blanks Received", job.blanks_received, (checked) =>
      handleFlagUpdate({ blanks_received: checked })
    )
  );

  if (job.print_type === "DTF") {
    flagTogglesEl.appendChild(
      createDtfSourceToggle(job, (value) => handleFlagUpdate({ dtf_source: value }))
    );

    flagTogglesEl.appendChild(
      createCheckboxToggle("DTF Ready", job.dtf_ready, (checked) =>
        handleFlagUpdate({ dtf_ready: checked })
      )
    );
  }

  if (job.print_type === "Screen Print") {
    flagTogglesEl.appendChild(
      createCheckboxToggle("Screens Made", job.screens_made, (checked) =>
        handleFlagUpdate({ screens_made: checked })
      )
    );

    flagTogglesEl.appendChild(
      createCheckboxToggle("Ink On Hand", job.ink_on_hand, (checked) =>
        handleFlagUpdate({ ink_on_hand: checked })
      )
    );

    flagTogglesEl.appendChild(
      createCheckboxToggle("Ink Ordered", job.ink_ordered, (checked) =>
        handleFlagUpdate({ ink_ordered: checked })
      )
    );
  }

  if (canMoveLeft) {
    moveLeftBtn.addEventListener("click", async () => {
      try {
        moveLeftBtn.disabled = true;
        moveRightBtn.disabled = true;

        const newStatus = STATUSES[currentIndex - 1];
        await updateJobStatus(job.id, newStatus);
        await loadJobs();
      } catch (error) {
        console.error(error);
        showApiError("Could not move job left", error);
      }
    });
  }

  if (canMoveRight) {
    moveRightBtn.addEventListener("click", async () => {
      try {
        moveLeftBtn.disabled = true;
        moveRightBtn.disabled = true;

        const newStatus = STATUSES[currentIndex + 1];
        await updateJobStatus(job.id, newStatus);
        await loadJobs();
      } catch (error) {
        console.error(error);
        showApiError("Could not move job right", error);
      }
    });
  }

  return article;
}

// =====================
// Column Helpers
// =====================
function resetColumns() {
  document.querySelectorAll(".column").forEach((column) => {
    const cardList = column.querySelector(".card-list");
    const countEl = column.querySelector(".count");

    cardList.innerHTML = "";
    countEl.textContent = "0";
  });
}

function updateColumnCounts() {
  document.querySelectorAll(".column").forEach((column) => {
    const countEl = column.querySelector(".count");
    const cards = column.querySelectorAll(".order-card");
    const cardList = column.querySelector(".card-list");

    countEl.textContent = String(cards.length);

    if (!cards.length) {
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

    const payload = {
      order_number: formData.get("order_number")?.toString().trim(),
      customer_name: formData.get("customer_name")?.toString().trim(),
      items_summary: formData.get("items_summary")?.toString().trim(),
      quantity: Number(formData.get("quantity") || 1),
      print_type: formData.get("print_type")?.toString(),
      status: formData.get("status")?.toString(),
      dtf_source: formData.get("dtf_source")?.toString(),
      notes: formData.get("notes")?.toString().trim(),
      blanks_ordered: formData.has("blanks_ordered"),
      blanks_received: formData.has("blanks_received"),
      dtf_ready: formData.has("dtf_ready"),
      screens_made: formData.has("screens_made"),
      ink_on_hand: formData.has("ink_on_hand"),
      ink_ordered: formData.has("ink_ordered"),
    };

    saveJobBtn.disabled = true;
    await createJob(payload);
    closeModal();
    await loadJobs();
  } catch (error) {
    console.error(error);
    showApiError("Could not save job", error);
  } finally {
    saveJobBtn.disabled = false;
  }
}

// =====================
// Form Safety
// Purpose:
// - Prevent implicit browser submit
// - Prevent Enter from doing anything in form inputs
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
// Purpose:
// - Prevent clicks inside modal from bubbling anywhere weird
// - Disable backdrop click close for now
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