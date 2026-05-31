/**
 * File: public/app.js
 * Project: 843Teez Orders
 * Purpose: Frontend logic for loading jobs, rendering the board, and handling status movement
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

const THEME_STORAGE_KEY = "843teez-orders-theme";

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
// Due Date Logic
// Purpose:
// - Show urgency based on due_date
// - Keep due date separate from aging
// =====================
function parseDateOnly(dateString) {
  if (!dateString) return null;

  const trimmed = String(dateString).trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function getCalendarDayDiff(fromDate, toDate) {
  const start = startOfDay(fromDate);
  const end = startOfDay(toDate);
  const msPerDay = 1000 * 60 * 60 * 24;

  return Math.round((end - start) / msPerDay);
}

function formatDueDate(dateString) {
  const parsed = parseDateOnly(dateString);
  if (!parsed) return "";

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getDueDateStatus(job) {
  if (!job?.due_date) return null;

  const dueDate = parseDateOnly(job.due_date);
  if (!dueDate) return null;

  const today = startOfDay(new Date());
  const diffDays = getCalendarDayDiff(today, dueDate);

  if (diffDays < 0) {
    return {
      label: "Overdue",
      className: "due-overdue",
    };
  }

  if (diffDays === 0) {
    return {
      label: "Due Today",
      className: "due-today",
    };
  }

  if (diffDays === 1) {
    return {
      label: "Due Tomorrow",
      className: "due-soon",
    };
  }

  return {
    label: `Due ${formatDueDate(job.due_date)}`,
    className: "due-normal",
  };
}

// =====================
// Board Sort Logic
// Purpose:
// - Prioritize urgent due dates inside each column
// - Keep no-due-date jobs below dated jobs
// - Fall back to created_at so older jobs still rise naturally
// =====================
function getDueSortValue(job) {
  const dueDate = parseDateOnly(job?.due_date);

  if (!dueDate) {
    return Number.POSITIVE_INFINITY;
  }

  return startOfDay(dueDate).getTime();
}

function getCreatedAtSortValue(job) {
  const createdAt = new Date(job?.created_at || 0);
  const timestamp = createdAt.getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareJobsForBoard(a, b) {
  const aDue = getDueSortValue(a);
  const bDue = getDueSortValue(b);

  if (aDue !== bDue) {
    return aDue - bDue;
  }

  return getCreatedAtSortValue(a) - getCreatedAtSortValue(b);
}

// =====================
// DOM Elements
// =====================
const bodyEl = document.body;
const boardEl = document.querySelector(".board");
const showCompleteToggle = document.getElementById("show-complete-toggle");
const completeColumn = document.getElementById("complete-column");
const toggleCompleteBtn = document.getElementById("toggle-complete-btn");
const completeCardList = document.getElementById("complete-card-list");

const newOrderBtn = document.getElementById("new-order-btn");
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const modalBackdrop = document.getElementById("job-modal-backdrop");
const modalEl = document.getElementById("job-modal");
const closeModalBtn = document.getElementById("close-modal-btn");
const cancelModalBtn = document.getElementById("cancel-modal-btn");
const newJobForm = document.getElementById("new-job-form");
const saveJobBtn = document.getElementById("save-job-btn");

const orderNumberInput = document.getElementById("order_number");
const customerNameInput = document.getElementById("customer_name");
const itemsSummaryInput = document.getElementById("items_summary");
const quantityInput = document.getElementById("quantity");
const printTypeSelect = document.getElementById("print_type");
const statusSelect = document.getElementById("status");
const dueDateInput = document.getElementById("due_date");
const dtfSourceSelect = document.getElementById("dtf_source");
const notesInput = document.getElementById("notes");

const blanksOrderedInput = newJobForm?.elements?.namedItem("blanks_ordered") || null;
const blanksReceivedInput = newJobForm?.elements?.namedItem("blanks_received") || null;
const dtfReadyInput = newJobForm?.elements?.namedItem("dtf_ready") || null;
const screensMadeInput = newJobForm?.elements?.namedItem("screens_made") || null;
const inkOnHandInput = newJobForm?.elements?.namedItem("ink_on_hand") || null;
const inkOrderedInput = newJobForm?.elements?.namedItem("ink_ordered") || null;

// Optional UI hooks for updated HTML
const modalTitleEl = document.getElementById("new-job-title");
const modalSubtitleEl = document.querySelector(".modal-subtitle");
const printTypeHintEl = document.querySelector("[data-print-type-hint]");
const dtfFieldsSection = document.querySelector("[data-print-type-section='dtf']");
const screenPrintFieldsSection = document.querySelector(
  "[data-print-type-section='screen_print']"
);
const dtfSourceField = document.getElementById("dtf_source")?.closest(".form-field");
const dtfReadyField =
  dtfReadyInput?.closest("label, .checkbox-chip, .checkbox-card, .checkbox-row") || null;
const screensMadeField =
  screensMadeInput?.closest("label, .checkbox-chip, .checkbox-card, .checkbox-row") || null;
const inkOnHandField =
  inkOnHandInput?.closest("label, .checkbox-chip, .checkbox-card, .checkbox-row") || null;
const inkOrderedField =
  inkOrderedInput?.closest("label, .checkbox-chip, .checkbox-card, .checkbox-row") || null;

// =====================
// Modal State
// =====================
let lastFocusedElement = null;
let isSavingJob = false;
let formMode = "create";
let editingJobId = null;
let jobsCache = [];
let lastBoardUpdatedAt = null;
let isPollingBoardUpdates = false;
const BOARD_REFRESH_INTERVAL_MS = 10000;
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

function showElement(element, show) {
  if (!element) return;

  if ("hidden" in element) {
    element.hidden = !show;
  }

  element.style.display = show ? "" : "none";
}

function setDisabledForElements(elements, disabled) {
  elements.forEach((element) => {
    if (!element) return;
    element.disabled = disabled;
  });
}

function getFocusableElements(container) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => {
    return !element.hasAttribute("hidden") && element.offsetParent !== null;
  });
}

function setBodyModalOpen(isOpen) {
  bodyEl.classList.toggle("modal-open", isOpen);
}

function resetFormValidationState() {
  if (!newJobForm) return;

  newJobForm
    .querySelectorAll(".is-invalid")
    .forEach((field) => field.classList.remove("is-invalid"));

  newJobForm
    .querySelectorAll("[data-error-for]")
    .forEach((el) => (el.textContent = ""));
}

function markFieldInvalid(field, message) {
  if (!field) return;

  field.classList.add("is-invalid");
  field.focus({ preventScroll: false });

  const errorTarget = newJobForm?.querySelector(
    `[data-error-for="${field.name}"]`
  );

  if (errorTarget) {
    errorTarget.textContent = message;
  }
}

function clearFieldInvalid(field) {
  if (!field) return;

  field.classList.remove("is-invalid");

  const errorTarget = newJobForm?.querySelector(
    `[data-error-for="${field.name}"]`
  );

  if (errorTarget) {
    errorTarget.textContent = "";
  }
}

function normalizePrintType(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "screen print" || normalized === "screen_print") {
    return "screen_print";
  }

  if (normalized === "dtf") {
    return "dtf";
  }

  return "";
}

function getJobById(jobId) {
  return jobsCache.find((job) => Number(job.id) === Number(jobId)) || null;
}

function resetModalState() {
  formMode = "create";
  editingJobId = null;

  if (newJobForm) {
    newJobForm.reset();
  }

  resetFormValidationState();

  if (quantityInput) quantityInput.value = 1;
  if (statusSelect) statusSelect.value = "in_the_hole";
  if (printTypeSelect) printTypeSelect.value = "";
  if (dueDateInput) dueDateInput.value = "";
  if (dtfSourceSelect) dtfSourceSelect.value = "";

  syncPrintTypeSections();
  syncFormStateForPrintType();
  syncModalCopy();
}

function syncModalCopy() {
  const normalizedPrintType = normalizePrintType(printTypeSelect?.value);
  const isEdit = formMode === "edit";

  if (modalTitleEl) {
    if (isEdit && normalizedPrintType === "dtf") {
      modalTitleEl.textContent = "Edit DTF Job";
    } else if (isEdit && normalizedPrintType === "screen_print") {
      modalTitleEl.textContent = "Edit Screen Print Job";
    } else if (isEdit) {
      modalTitleEl.textContent = "Edit Job";
    } else if (normalizedPrintType === "dtf") {
      modalTitleEl.textContent = "New DTF Job";
    } else if (normalizedPrintType === "screen_print") {
      modalTitleEl.textContent = "New Screen Print Job";
    } else {
      modalTitleEl.textContent = "New Job";
    }
  }

  if (modalSubtitleEl) {
    modalSubtitleEl.textContent = isEdit
      ? "Update this order on the board."
      : "Add a new order to the board.";
  }

  if (saveJobBtn) {
    if (isSavingJob) {
      saveJobBtn.textContent = "Saving...";
    } else {
      saveJobBtn.textContent = isEdit ? "Update Job" : "Save Job";
    }
  }
}
// =====================
// Production Counter Helpers
// Purpose:
// - Track done/remaining shirts from DB-backed field
// - Fallback safely to quantity if value is missing
// =====================
function getSavedCounter(job) {
  const total = Number(job.quantity) || 0;
  const saved = Number(job.at_plate_remaining);

  if (!Number.isNaN(saved) && job.at_plate_remaining != null) {
    return Math.max(0, Math.min(total, saved));
  }

  return total;
}

async function updateAtPlateCounter(jobId, remaining) {
  const response = await fetch(`/api/jobs/${jobId}/at-plate-counter`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ remaining }),
  });

  return parseApiResponse(response, "Failed to update At the Plate counter");
}

let counterAudioContext = null;

function playCounterClick() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!counterAudioContext) {
      counterAudioContext = new AudioCtx();
    }

    const ctx = counterAudioContext;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.03, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.06);
  } catch (error) {
    console.warn("Counter click audio unavailable:", error);
  }
}
// =====================
// Theme Toggle
// Purpose:
// - Toggle dark mode on/off
// - Save preference in localStorage
// =====================
function applyTheme(theme) {
  const isDark = theme === "dark";

  bodyEl.classList.toggle("dark-mode", isDark);

  if (themeToggleBtn) {
    themeToggleBtn.textContent = isDark ? "Light Mode" : "Dark Mode";
    themeToggleBtn.setAttribute("aria-pressed", String(isDark));
    themeToggleBtn.setAttribute(
      "title",
      isDark ? "Switch to light mode" : "Switch to dark mode"
    );
  }
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = savedTheme === "dark" ? "dark" : "light";
  applyTheme(theme);
}

function openModal() {
  if (!modalBackdrop || !newJobForm) return;

  resetModalState();
  lastFocusedElement = document.activeElement;
  modalBackdrop.classList.remove("hidden");
  setBodyModalOpen(true);

  window.requestAnimationFrame(() => {
    const firstTarget = orderNumberInput || customerNameInput || modalEl;
    firstTarget?.focus();
  });
 if (orderNumberInput) {
  orderNumberInput.value = "";
  orderNumberInput.placeholder = "Will be generated automatically";
}
}

function openEditModal(job) {
  if (!modalBackdrop || !newJobForm || !job) return;

  resetModalState();

  formMode = "edit";
  editingJobId = job.id;
  lastFocusedElement = document.activeElement;

  if (orderNumberInput) orderNumberInput.value = job.order_number || "";
  if (customerNameInput) customerNameInput.value = job.customer_name || "";
  if (itemsSummaryInput) itemsSummaryInput.value = job.items_summary || "";
  if (quantityInput) quantityInput.value = Number(job.quantity) || 1;
  if (printTypeSelect) printTypeSelect.value = job.print_type || "";
  if (statusSelect) statusSelect.value = job.status || "in_the_hole";
  if (dueDateInput) dueDateInput.value = job.due_date || "";
  if (dtfSourceSelect) dtfSourceSelect.value = job.dtf_source || "";
  if (notesInput) notesInput.value = job.notes || "";

  if (blanksOrderedInput) blanksOrderedInput.checked = Boolean(job.blanks_ordered);
  if (blanksReceivedInput) blanksReceivedInput.checked = Boolean(job.blanks_received);
  if (dtfReadyInput) dtfReadyInput.checked = Boolean(job.dtf_ready);
  if (screensMadeInput) screensMadeInput.checked = Boolean(job.screens_made);
  if (inkOnHandInput) inkOnHandInput.checked = Boolean(job.ink_on_hand);
  if (inkOrderedInput) inkOrderedInput.checked = Boolean(job.ink_ordered);

  syncPrintTypeSections();
  syncModalCopy();

  modalBackdrop.classList.remove("hidden");
  setBodyModalOpen(true);

  window.requestAnimationFrame(() => {
    const firstTarget = customerNameInput || orderNumberInput || modalEl;
    firstTarget?.focus();
  });
}

function closeModal() {
  if (!modalBackdrop || !newJobForm) return;

  modalBackdrop.classList.add("hidden");
  setBodyModalOpen(false);

  resetModalState();

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function showApiError(prefix, error) {
  const message = error?.message ? `${prefix}: ${error.message}` : prefix;
  alert(message);
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

function buildMetaPill(label, value) {
  return `<span class="meta-pill">${escapeHtml(label)}: ${escapeHtml(value)}</span>`;
}

function formatPrintType(printType) {
  if (!printType) return "";
  return printType;
}
function syncCompleteCollapseUi() {
  if (!toggleCompleteBtn || !completeCardList) return;

  const isHidden = completeCardList.classList.contains("hidden");
  toggleCompleteBtn.textContent = isHidden ? "Show" : "Hide";
  toggleCompleteBtn.setAttribute("aria-expanded", String(!isHidden));
}
function syncPrintTypeSections() {
  const type = normalizePrintType(printTypeSelect?.value);

  const showDtf = type === "dtf";
  const showScreenPrint = type === "screen_print";

  showElement(dtfFieldsSection, showDtf);
  showElement(screenPrintFieldsSection, showScreenPrint);

  // Graceful fallback for older HTML that doesn't have grouped sections
  showElement(dtfSourceField, showDtf);
  showElement(dtfReadyField, showDtf);

  showElement(screensMadeField, showScreenPrint);
  showElement(inkOnHandField, showScreenPrint);
  showElement(inkOrderedField, showScreenPrint);

  if (printTypeHintEl) {
    if (showDtf) {
      printTypeHintEl.textContent = "DTF selected — show DTF-specific fields.";
    } else if (showScreenPrint) {
      printTypeHintEl.textContent =
        "Screen Print selected — show screen print fields.";
    } else {
      printTypeHintEl.textContent =
        "Choose a print type to show only the fields you need.";
    }
  }

  syncModalCopy();
}

function syncFormStateForPrintType() {
  const type = normalizePrintType(printTypeSelect?.value);

  if (type !== "dtf") {
    if (dtfSourceSelect) dtfSourceSelect.value = "";
    if (dtfReadyInput) dtfReadyInput.checked = false;
  }

  if (type !== "screen_print") {
    if (screensMadeInput) screensMadeInput.checked = false;
    if (inkOnHandInput) inkOnHandInput.checked = false;
    if (inkOrderedInput) inkOrderedInput.checked = false;
  }
}

function getFormPayload() {
  const formData = new FormData(newJobForm);
  const payload = Object.fromEntries(formData.entries());

  payload.quantity = Number(payload.quantity || 1);
  payload.items_summary = itemsSummaryInput?.value?.trim?.() || "";
  payload.notes = notesInput?.value?.trim?.() || "";
  payload.order_number = orderNumberInput?.value?.trim?.() || "";
  payload.customer_name = customerNameInput?.value?.trim?.() || "";
  payload.print_type = printTypeSelect?.value || "";
  payload.status = statusSelect?.value || "in_the_hole";
  payload.due_date = dueDateInput?.value || "";

  payload.blanks_ordered = Boolean(blanksOrderedInput?.checked);
  payload.blanks_received = Boolean(blanksReceivedInput?.checked);
  payload.dtf_ready = Boolean(dtfReadyInput?.checked);
  payload.screens_made = Boolean(screensMadeInput?.checked);
  payload.ink_on_hand = Boolean(inkOnHandInput?.checked);
  payload.ink_ordered = Boolean(inkOrderedInput?.checked);

  const type = normalizePrintType(payload.print_type);

  if (type !== "dtf") {
    payload.dtf_source = "";
    payload.dtf_ready = false;
  } else {
    payload.dtf_source = dtfSourceSelect?.value || "";
  }

  if (type !== "screen_print") {
    payload.screens_made = false;
    payload.ink_on_hand = false;
    payload.ink_ordered = false;
  }

  return payload;
}

function validateNewJobForm() {
  resetFormValidationState();

  const customerName = customerNameInput?.value.trim() || "";
  const quantity = Number(quantityInput?.value || 1);


  if (!customerName) {
    markFieldInvalid(customerNameInput, "Customer name is required.");
    throw new Error("Customer name is required");
  }

  if (!Number.isFinite(quantity) || quantity < 1) {
    markFieldInvalid(quantityInput, "Quantity must be at least 1.");
    throw new Error("Quantity must be at least 1");
  }
}

function setSavingState(isSaving) {
  isSavingJob = isSaving;
  syncModalCopy();

  setDisabledForElements(
    [closeModalBtn, cancelModalBtn, newOrderBtn],
    isSaving
  );
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

async function updateJob(jobId, payload) {
  const response = await fetch(`/api/jobs/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseApiResponse(response, "Failed to update job");
}

async function updateJobFlags(jobId, payload) {
  const response = await fetch(`/api/jobs/${jobId}/flags`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseApiResponse(response, "Failed to update job flags");
}
async function fetchLastUpdated(showComplete) {
  const response = await fetch(
    `/api/jobs/last-updated?showComplete=${showComplete}`
  );

  return parseApiResponse(response, "Failed to fetch last updated timestamp");
}
// =====================
// UI Rendering
// =====================
function createJobCard(job) {
  const article = document.createElement("article");
  article.className = "order-card";
  article.dataset.status = job.status;
  article.dataset.jobId = String(job.id);

  const agingLevel = getAgingLevel(job);
  const ageLabel = getAgeLabel(job);
  const dueStatus = getDueDateStatus(job);

  if (agingLevel) {
    article.classList.add(agingLevel);
  }

  if (dueStatus?.className) {
    article.classList.add(dueStatus.className);
  }

  const flags = getFlags(job);
  const quickFlags = getQuickFlags(job);
  const currentIndex = STATUSES.indexOf(job.status);
  const canMoveLeft = currentIndex > 0;
  const canMoveRight = currentIndex < STATUSES.length - 1;

  // =====================
// Production Counter Setup
// =====================
let remaining = null;
let done = null;

if (job.status === "at_the_plate") {
  const total = Number(job.quantity) || 0;
  remaining = getSavedCounter(job);
  done = Math.max(0, total - remaining);
}
  const qtyPill = buildMetaPill("Qty", job.quantity || 0);
  const printTypePill = job.print_type
    ? buildMetaPill("Type", formatPrintType(job.print_type))
    : "";
  const dueDatePill = job.due_date
    ? buildMetaPill("Due", formatDueDate(job.due_date))
    : "";

  article.innerHTML = `
    <!-- Compact header -->
    <div class="card-top compact-card-top">
      <div class="card-top-left">
        <strong>#${escapeHtml(job.order_number)}</strong>
        ${
          ageLabel
            ? `<span class="age-badge ${escapeHtml(agingLevel)}">${escapeHtml(ageLabel)}</span>`
            : ""
        }
        ${
          dueStatus
            ? `<span class="due-badge ${escapeHtml(dueStatus.className)}">${escapeHtml(dueStatus.label)}</span>`
            : ""
        }
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
  job.status === "at_the_plate"
    ? `
      <div class="production-counter ${remaining === 0 ? "counter-complete" : ""}">
        <div class="counter-row">
          <span class="counter-done ${remaining === 0 ? "counter-done-complete" : ""}">
            Done: ${done} / ${job.quantity}
          </span>
        </div>

        <div class="counter-controls">
          <button
            type="button"
            class="counter-btn minus-twelve"
            style="min-width:52px; min-height:52px; font-size:1rem; font-weight:700;"
          >
            -12
          </button>

          <button
            type="button"
            class="counter-btn minus"
            style="min-width:52px; min-height:52px; font-size:1.4rem; font-weight:700;"
          >
            -
          </button>

          <span
            class="counter-remaining ${remaining === 0 ? "counter-remaining-complete" : ""}"
            style="display:inline-flex; align-items:center; justify-content:center; min-width:64px; min-height:52px; font-size:1.35rem; font-weight:700;"
          >
            ${remaining}
          </span>

          <button
            type="button"
            class="counter-btn plus"
            style="min-width:52px; min-height:52px; font-size:1.4rem; font-weight:700;"
          >
            +
          </button>

          <button
            type="button"
            class="counter-btn plus-twelve"
            style="min-width:52px; min-height:52px; font-size:1rem; font-weight:700;"
          >
            +12
          </button>

          <button
            type="button"
            class="counter-reset"
            style="min-height:52px; padding:0 14px; font-size:1rem; font-weight:600;"
          >
            Reset
          </button>
        </div>

        ${
          remaining === 0
            ? `
              <div class="counter-ready-row" style="margin-top:10px;">
                <button
                  type="button"
                  class="counter-mark-ready-btn"
                  style="width:100%; min-height:52px; font-size:1rem; font-weight:700;"
                >
                  Mark Ready
                </button>
              </div>
            `
            : ""
        }
      </div>
    `
    : ""
}
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

    <div class="card-row-actions">
      <button type="button" class="toggle-flags-btn">Details</button>
    </div>

    <!-- Expanded details -->
    <div class="card-details hidden">
      <p class="card-items">${escapeHtml(job.items_summary || "")}</p>

      <div class="card-meta">
        ${qtyPill}
        ${printTypePill}
        ${dueDatePill}
      </div>

      ${
        flags.length
          ? `<div class="flags">
              ${flags.map((f) => `<span class="flag">${escapeHtml(f)}</span>`).join("")}
            </div>`
          : ""
      }

      ${job.notes ? `<p class="notes">${escapeHtml(job.notes)}</p>` : ""}

      <div class="card-actions">
        <button
          type="button"
          class="edit-job-btn"
          data-job-id="${escapeHtml(job.id)}"
        >
          Edit
        </button>
      </div>
    </div>
  `;

  const toggleBtn = article.querySelector(".toggle-flags-btn");
  const detailsEl = article.querySelector(".card-details");
  const compactMoveLeftBtn = article.querySelector(".move-left-compact");
  const compactMoveRightBtn = article.querySelector(".move-right-compact");
  const quickFlagButtons = article.querySelectorAll(".quick-flag-btn");
  const editJobBtn = article.querySelector(".edit-job-btn");
// =====================
// Counter Event Handling
// =====================
if (job.status === "at_the_plate") {
  const counterWrap = article.querySelector(".production-counter");
  const minusTwelveBtn = article.querySelector(".counter-btn.minus-twelve");
  const minusBtn = article.querySelector(".counter-btn.minus");
  const plusBtn = article.querySelector(".counter-btn.plus");
  const plusTwelveBtn = article.querySelector(".counter-btn.plus-twelve");
  const resetBtn = article.querySelector(".counter-reset");
  const markReadyBtn = article.querySelector(".counter-mark-ready-btn");
  const remainingEl = article.querySelector(".counter-remaining");
  const doneEl = article.querySelector(".counter-done");

  const total = Number(job.quantity) || 0;
  const counterButtons = [minusTwelveBtn, minusBtn, plusBtn, plusTwelveBtn, resetBtn];

  function setCounterButtonsDisabled(disabled) {
    counterButtons.forEach((button) => {
      if (button) button.disabled = disabled;
    });
  }

  function applyCompleteVisuals(remainingVal) {
    const isComplete = remainingVal === 0;

    counterWrap?.classList.toggle("counter-complete", isComplete);
    remainingEl?.classList.toggle("counter-remaining-complete", isComplete);
    doneEl?.classList.toggle("counter-done-complete", isComplete);

    if (counterWrap) {
      counterWrap.style.border = isComplete ? "2px solid #22c55e" : "";
      counterWrap.style.boxShadow = isComplete
        ? "0 0 0 3px rgba(34, 197, 94, 0.18)"
        : "";
      counterWrap.style.borderRadius = "12px";
      counterWrap.style.padding = "10px";
    }

    if (remainingEl) {
      remainingEl.style.color = isComplete ? "#15803d" : "";
      remainingEl.style.background = isComplete ? "rgba(34, 197, 94, 0.12)" : "";
      remainingEl.style.borderRadius = "10px";
    }

    if (doneEl) {
      doneEl.style.color = isComplete ? "#15803d" : "";
      doneEl.style.fontWeight = "700";
    }
  }

  function renderReadyButton(remainingVal) {
    const existingBtn = article.querySelector(".counter-mark-ready-btn");
    const existingRow = existingBtn?.closest(".counter-ready-row");
    const isComplete = remainingVal === 0;

    if (isComplete && !existingBtn) {
      const row = document.createElement("div");
      row.className = "counter-ready-row";
      row.style.marginTop = "10px";

      row.innerHTML = `
        <button
          type="button"
          class="counter-mark-ready-btn"
          style="width:100%; min-height:52px; font-size:1rem; font-weight:700;"
        >
          Mark Ready
        </button>
      `;

      counterWrap?.appendChild(row);

      const newReadyBtn = row.querySelector(".counter-mark-ready-btn");
      newReadyBtn?.addEventListener("click", handleMarkReady);
    }

    if (!isComplete && existingRow) {
      existingRow.remove();
    }
  }

async function updateDisplay(value) {
  const remainingVal = Math.max(0, Math.min(total, value));
  const doneVal = total - remainingVal;

  remainingEl.textContent = remainingVal;
  doneEl.textContent = `Done: ${doneVal} / ${total}`;

  applyCompleteVisuals(remainingVal);
  renderReadyButton(remainingVal);

  await updateAtPlateCounter(job.id, remainingVal);
  job.at_plate_remaining = remainingVal;
}

  async function handleMarkReady() {
    try {
      const readyButton = article.querySelector(".counter-mark-ready-btn");
      if (readyButton) readyButton.disabled = true;

  await updateJobStatus(job.id, "ready");
await loadJobs();
scrollToColumn("ready");
    } catch (error) {
      console.error(error);
      showApiError("Could not mark job ready", error);
    }
  }

minusBtn?.addEventListener("click", async () => {
  try {
    setCounterButtonsDisabled(true);

    const current = getSavedCounter(job);
    await updateDisplay(current - 1);
    playCounterClick();
  } catch (error) {
    console.error(error);
    showApiError("Could not update counter", error);
    await loadJobs();
  } finally {
    setCounterButtonsDisabled(false);
  }
});

plusBtn?.addEventListener("click", async () => {
  try {
    setCounterButtonsDisabled(true);

    const current = getSavedCounter(job);
    await updateDisplay(current + 1);
    playCounterClick();
  } catch (error) {
    console.error(error);
    showApiError("Could not update counter", error);
    await loadJobs();
  } finally {
    setCounterButtonsDisabled(false);
  }
});

minusTwelveBtn?.addEventListener("click", async () => {
  try {
    setCounterButtonsDisabled(true);

    const current = getSavedCounter(job);
    await updateDisplay(current - 12);
    playCounterClick();
  } catch (error) {
    console.error(error);
    showApiError("Could not update counter", error);
    await loadJobs();
  } finally {
    setCounterButtonsDisabled(false);
  }
});

plusTwelveBtn?.addEventListener("click", async () => {
  try {
    setCounterButtonsDisabled(true);

    const current = getSavedCounter(job);
    await updateDisplay(current + 12);
    playCounterClick();
  } catch (error) {
    console.error(error);
    showApiError("Could not update counter", error);
    await loadJobs();
  } finally {
    setCounterButtonsDisabled(false);
  }
});

resetBtn?.addEventListener("click", async () => {
  try {
    setCounterButtonsDisabled(true);

    await updateDisplay(total);
    playCounterClick();
  } catch (error) {
    console.error(error);
    showApiError("Could not reset counter", error);
    await loadJobs();
  } finally {
    setCounterButtonsDisabled(false);
  }
});

  markReadyBtn?.addEventListener("click", handleMarkReady);

  applyCompleteVisuals(remaining);
}
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

  editJobBtn?.addEventListener("click", () => {
    const freshJob = getJobById(job.id) || job;
    openEditModal(freshJob);
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

if (completeColumn) {
  completeColumn.hidden = !showComplete;
}

if (completeCardList && showComplete) {
  completeCardList.classList.add("hidden");
}

  boardEl?.classList.toggle("show-complete", showComplete);

  resetColumns();

  try {
    const response = await fetch(`/api/jobs?showComplete=${showComplete}`);
    const jobs = await parseApiResponse(response, "Failed to load jobs");
  
    const lastUpdatedData = await fetchLastUpdated(showComplete);
    lastBoardUpdatedAt = lastUpdatedData?.lastUpdated || null;
   
    jobs.sort(compareJobsForBoard);
    jobsCache = jobs;

    jobs.forEach((job) => {
      const column = document.querySelector(`.column[data-status="${job.status}"]`);
      if (!column) return;

      const cardList = column.querySelector(".card-list");
      const emptyState = cardList.querySelector(".empty-state");

      if (emptyState) emptyState.remove();

      cardList.appendChild(createJobCard(job));
    });

    updateColumnCounts();
    syncCompleteCollapseUi();
  } catch (error) {
    console.error("Failed to load jobs:", error);
  }
}
async function pollForBoardUpdates() {
  if (isPollingBoardUpdates || isSavingJob) return;

  const modalIsOpen =
    modalBackdrop && !modalBackdrop.classList.contains("hidden");

  if (modalIsOpen) return;

  try {
    isPollingBoardUpdates = true;

    const showComplete = showCompleteToggle.checked;
    const data = await fetchLastUpdated(showComplete);
    const newestTimestamp = data?.lastUpdated || null;

    if (lastBoardUpdatedAt == null) {
      lastBoardUpdatedAt = newestTimestamp;
      return;
    }

    if (newestTimestamp && newestTimestamp !== lastBoardUpdatedAt) {
      await loadJobs();
    }
  } catch (error) {
    console.error("Board auto-refresh check failed:", error);
  } finally {
    isPollingBoardUpdates = false;
  }
}
// =====================
// Save / Update Job
// =====================
async function handleSaveJob() {
  if (isSavingJob) return;

  try {
    validateNewJobForm();

    const payload = getFormPayload();

    setSavingState(true);

    if (formMode === "edit") {
      if (!editingJobId) {
        throw new Error("Missing job id for edit");
      }

      await updateJob(editingJobId, payload);
    } else {
      await createJob(payload);
    }

    const destinationStatus = payload.status || "in_the_hole";

    closeModal();
    await loadJobs();
    scrollToColumn(destinationStatus);
  } catch (err) {
    console.error(err);
    showApiError(
      formMode === "edit" ? "Could not update job" : "Could not save job",
      err
    );
  } finally {
    setSavingState(false);
  }
}

// =====================
// Form Safety
// =====================
if (newJobForm) {
  newJobForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSaveJob();
  });

  newJobForm.addEventListener("keydown", (event) => {
    const tagName = event.target.tagName.toLowerCase();

    if (event.key === "Enter" && tagName !== "textarea") {
      event.preventDefault();

      const focusable = getFocusableElements(newJobForm);
      const currentIndex = focusable.indexOf(event.target);

      if (currentIndex >= 0 && currentIndex < focusable.length - 1) {
        focusable[currentIndex + 1].focus();
      }
    }
  });

  newJobForm.addEventListener("input", (event) => {
    const target = event.target;

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      clearFieldInvalid(target);
    }
  });

  newJobForm.addEventListener("change", (event) => {
    const target = event.target;

    if (target === printTypeSelect) {
      syncPrintTypeSections();
      syncFormStateForPrintType();
    }

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      clearFieldInvalid(target);
    }
  });
}

// =====================
// Modal Safety
// =====================
if (modalEl) {
  modalEl.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  modalEl.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
}

if (modalBackdrop) {
  modalBackdrop.addEventListener("click", (event) => {
    if (event.target === modalBackdrop && !isSavingJob) {
      closeModal();
    }
  });
}

// =====================
// Modal Events
// =====================
newOrderBtn?.addEventListener("click", openModal);
toggleCompleteBtn?.addEventListener("click", () => {
  if (!completeCardList) return;

  completeCardList.classList.toggle("hidden");
  syncCompleteCollapseUi();
});
themeToggleBtn?.addEventListener("click", () => {
  const isDark = bodyEl.classList.contains("dark-mode");
  const nextTheme = isDark ? "light" : "dark";

  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
});

closeModalBtn?.addEventListener("click", () => {
  if (!isSavingJob) closeModal();
});

cancelModalBtn?.addEventListener("click", () => {
  if (!isSavingJob) closeModal();
});

saveJobBtn?.addEventListener("click", handleSaveJob);

document.addEventListener("keydown", (event) => {
  const modalIsOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");

  if (!modalIsOpen) return;

  if (event.key === "Escape" && !isSavingJob) {
    closeModal();
    return;
  }

  if (event.key === "Tab") {
    const focusable = getFocusableElements(modalEl);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

// =====================
// Init
// =====================
resetModalState();
loadSavedTheme();

showCompleteToggle?.addEventListener("change", loadJobs);
loadJobs();

window.setInterval(pollForBoardUpdates, BOARD_REFRESH_INTERVAL_MS);
