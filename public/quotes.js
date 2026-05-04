/**
 * File: public/quotes.js
 * Project: 843Teez Orders
 * Purpose: Frontend logic for the draft quote builder
 */

const QUOTE_SIZES = [
  "YS",
  "YM",
  "YL",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
];

const quoteForm = document.getElementById("quote-form");
const blankSelect = document.getElementById("shirt_blank_id");
const sizeGrid = document.getElementById("size-grid");
const quantityTotal = document.getElementById("quantity-total");
const quoteError = document.getElementById("quote-error");
const quoteSummaryContent = document.getElementById("quote-summary-content");
const quoteList = document.getElementById("quote-list");
const quoteDetail = document.getElementById("quote-detail");
const quoteSearch = document.getElementById("quote-search");
const quoteStatusFilter = document.getElementById("quote-status-filter");
const calculateQuoteBtn = document.getElementById("calculate-quote-btn");
const saveQuoteBtn = document.getElementById("save-quote-btn");
const cancelEditQuoteBtn = document.getElementById("cancel-edit-quote-btn");
const saveQuotePanel = document.getElementById("save-quote-panel");
const closeSavePanelBtn = document.getElementById("close-save-panel-btn");
const confirmSaveQuoteBtn = document.getElementById("confirm-save-quote-btn");
const mobileQuoteBar = document.getElementById("mobile-quote-bar");
const mobileQuoteTotal = document.getElementById("mobile-quote-total");
const mobileQuoteEach = document.getElementById("mobile-quote-each");
const mobileCalculateQuoteBtn = document.getElementById("mobile-calculate-quote-btn");
const mobileSaveQuoteBtn = document.getElementById("mobile-save-quote-btn");
const sleeveToggleCard = document.getElementById("sleeve-toggle-card");

let isSavingQuote = false;
let isCalculatingQuote = false;
let quoteSearchTimer = null;
let editingQuoteId = null;
let lastCalculation = null;
let quoteBlanks = [];
let isSleeveSelected = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(cents) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}

function renderQuoteTotalRow(label, value, className = "") {
  const rowClass = className ? `quote-total-row ${className}` : "quote-total-row";

  return `
    <div class="${rowClass}">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value)}</span>
    </div>
  `;
}

function formatDate(value) {
  if (!value) return "Not set";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatStatus(value) {
  return String(value || "draft")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getQuoteListParams() {
  const params = new URLSearchParams();
  const status = quoteStatusFilter?.value || "active";
  const search = quoteSearch?.value.trim() || "";

  params.set("status", status);

  if (search) {
    params.set("q", search);
  }

  return params;
}

function showQuoteError(message) {
  if (!quoteError) return;

  quoteError.textContent = message;
  quoteError.hidden = false;
}

function clearQuoteError() {
  if (!quoteError) return;

  quoteError.textContent = "";
  quoteError.hidden = true;
}

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

function renderSizeInputs() {
  if (!sizeGrid) return;

  const selectedBlank = quoteBlanks.find(
    (blank) => String(blank.id) === String(blankSelect?.value || "")
  );
  const availability = selectedBlank?.size_availability || {};

  sizeGrid.innerHTML = QUOTE_SIZES.map(
    (size) => {
      const isAvailable = availability[size] == null
        ? true
        : Number(availability[size]) === 1;

      return `
      <label class="size-field ${isAvailable ? "" : "size-field-unavailable"}">
        <span>${escapeHtml(size)}</span>
        <div class="size-stepper">
          <button
            type="button"
            class="size-step-btn"
            data-size-step="-1"
            aria-label="Decrease ${escapeHtml(size)} quantity"
            ${isAvailable ? "" : "disabled"}
          >-</button>
          <input
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            value="0"
            data-size="${escapeHtml(size)}"
            aria-label="${escapeHtml(size)} quantity"
            ${isAvailable ? "" : "disabled"}
          />
          <button
            type="button"
            class="size-step-btn"
            data-size-step="1"
            aria-label="Increase ${escapeHtml(size)} quantity"
            ${isAvailable ? "" : "disabled"}
          >+</button>
        </div>
        ${isAvailable ? "" : `<small>Unavailable</small>`}
      </label>
    `;
    }
  ).join("");

  sizeGrid.querySelectorAll("input[data-size]").forEach((input) => {
    input.addEventListener("input", updateQuantityTotal);
  });

  sizeGrid.querySelectorAll("[data-size-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button
        .closest(".size-field")
        ?.querySelector("input[data-size]");

      if (!input || input.disabled) return;

      const nextValue = Math.max(
        0,
        Math.floor(Number(input.value) || 0) + Number(button.dataset.sizeStep)
      );

      input.value = String(nextValue);
      updateQuantityTotal();
    });
  });

  updateQuantityTotal();
}

function getSizeQuantities() {
  const sizes = {};

  sizeGrid?.querySelectorAll("input[data-size]").forEach((input) => {
    sizes[input.dataset.size] = input.disabled
      ? 0
      : Math.max(0, Math.floor(Number(input.value) || 0));
  });

  return sizes;
}

function getTotalQuantity() {
  return Object.values(getSizeQuantities()).reduce(
    (sum, quantity) => sum + quantity,
    0
  );
}

function updateQuantityTotal() {
  if (!quantityTotal) return;

  const total = getTotalQuantity();
  quantityTotal.textContent = `${total} total`;
  invalidateCalculation();
}

function invalidateCalculation() {
  const hadCalculation = Boolean(lastCalculation);
  lastCalculation = null;
  updateMobileQuoteBar();

  if (hadCalculation && quoteSummaryContent) {
    quoteSummaryContent.innerHTML = `<p class="quote-muted">Pricing changed. Calculate again to refresh the quote.</p>`;
  }
}

function syncSleeveToggleUi() {
  if (sleeveToggleCard) {
    sleeveToggleCard.classList.toggle("is-selected", isSleeveSelected);
    sleeveToggleCard.setAttribute("aria-pressed", isSleeveSelected ? "true" : "false");
  }
}

function getSelectedPlacements() {
  return isSleeveSelected ? ["full_front", "sleeve"] : ["full_front"];
}

function getQuotePayload() {
  const formData = new FormData(quoteForm);

  const payload = {
    customer_name: String(formData.get("customer_name") || "").trim(),
    customer_email: String(formData.get("customer_email") || "").trim(),
    customer_phone: String(formData.get("customer_phone") || "").trim(),
    due_date: String(formData.get("due_date") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
    item: {
      shirt_blank_id: Number(formData.get("shirt_blank_id") || 0),
      color: String(formData.get("color") || "").trim(),
      print_type: "DTF",
      placements: getSelectedPlacements(),
      sizes: getSizeQuantities(),
    },
  };

  console.log("QUOTE PAYLOAD", payload);
  return payload;
}

function getMissingQuoteInputMessage() {
  const payload = getQuotePayload();
  const totalQuantity = Object.values(payload.item.sizes || {}).reduce(
    (sum, quantity) => sum + (Number(quantity) || 0),
    0
  );

  if (!payload.item.shirt_blank_id) {
    return "Choose a shirt blank before calculating.";
  }

  if (totalQuantity < 1) {
    return "Enter at least one shirt quantity before calculating.";
  }

  return "";
}

function renderCalculation(calculation) {
  const totals = calculation?.totals;
  const item = calculation?.item;

  if (!quoteSummaryContent || !totals || !item) return;

  lastCalculation = calculation;

  const pricingDebug = totals.pricing_debug || item.pricing_debug || {};
  const pricingLabel =
    totals.pricing_label ||
    calculation.pricing_label ||
    pricingDebug.pricingLabel ||
    "";
  const sleeveAddOnPerShirtCents =
    Number(pricingDebug.sleeveAddOnPerShirtCents) ||
    Number(pricingDebug.sleeveAddOnPricePerShirtCents) || 0;
  const blankUpgradePerShirtCents =
    Number(pricingDebug.blankUpgradePerShirtCents) || 0;
  const baseDealSubtotalCents =
    Number(totals.base_deal_subtotal_cents) ||
    Number(pricingDebug.baseDealSubtotalCents) ||
    0;
  const sleeveAddOnTotalCents =
    Number(totals.sleeve_add_on_total_cents) ||
    Number(pricingDebug.sleeveAddOnTotalCents) ||
    0;
  const blankUpgradeTotalCents =
    Number(totals.blank_upgrade_total_cents) ||
    Number(pricingDebug.blankUpgradeTotalCents) ||
    0;
  const sizeUpchargeCents =
    Number(totals.size_upcharge_total_cents) ||
    Number(pricingDebug.sizeUpchargeTotalCents) ||
    Number(totals.size_upcharge_cents) ||
    Number(pricingDebug.sizeUpchargeCents) ||
    0;
  const dealRows = [
    pricingLabel
      ? renderQuoteTotalRow("Pricing Deal", pricingLabel)
      : "",
    renderQuoteTotalRow("Base Deal Subtotal", formatMoney(baseDealSubtotalCents)),
    sleeveAddOnTotalCents > 0
      ? renderQuoteTotalRow(
          "Sleeve Add-On",
          `+${formatMoney(sleeveAddOnPerShirtCents)} each (${formatMoney(sleeveAddOnTotalCents)})`
        )
      : "",
    blankUpgradeTotalCents > 0
      ? renderQuoteTotalRow(
          "Blank Upgrade",
          `+${formatMoney(blankUpgradePerShirtCents)} each (${formatMoney(blankUpgradeTotalCents)})`
        )
      : "",
    sizeUpchargeCents > 0
      ? renderQuoteTotalRow("Size Upcharges", formatMoney(sizeUpchargeCents))
      : "",
  ].join("");

  quoteSummaryContent.innerHTML = `
    ${renderQuoteTotalRow("Blank", item.blank_label)}
    ${renderQuoteTotalRow("Total Qty", totals.total_quantity)}
    ${dealRows}
    ${renderQuoteTotalRow("Per Shirt", formatMoney(totals.price_per_shirt_cents))}
    ${renderQuoteTotalRow("Blank Cost", formatMoney(totals.blank_cost_cents))}
    ${renderQuoteTotalRow("Print Cost", formatMoney(totals.print_cost_cents))}
    ${renderQuoteTotalRow("Setup Fees", formatMoney(totals.setup_fee_cents))}
    ${renderQuoteTotalRow("Profit", formatMoney(totals.profit_cents))}
    ${renderQuoteTotalRow(
      "Final Quote Total",
      formatMoney(totals.total_price_cents),
      "quote-grand-total"
    )}
  `;

  updateMobileQuoteBar();
}

function updateMobileQuoteBar() {
  const totals = lastCalculation?.totals;
  const hasCalculation = Boolean(totals);

  if (!mobileQuoteBar || !mobileQuoteTotal || !mobileQuoteEach) return;

  mobileQuoteBar.hidden = !hasCalculation;
  mobileQuoteBar.classList.toggle("has-calculation", hasCalculation);
  mobileQuoteTotal.textContent = hasCalculation
    ? `Quote: ${formatMoney(totals.total_price_cents)} · ${formatMoney(totals.price_per_shirt_cents)} each`
    : "Quote: Not calculated";
  mobileQuoteEach.textContent = hasCalculation
    ? "Ready to save"
    : "Tap Calculate";
}

function openSavePanel() {
  if (!saveQuotePanel) return;

  saveQuotePanel.hidden = false;
  saveQuotePanel
    .querySelector("#customer_name")
    ?.focus({ preventScroll: true });
  saveQuotePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeSavePanel() {
  if (!saveQuotePanel) return;

  saveQuotePanel.hidden = true;
}

function setBusyState() {
  if (calculateQuoteBtn) {
    calculateQuoteBtn.disabled = isCalculatingQuote || isSavingQuote;
    calculateQuoteBtn.textContent = isCalculatingQuote ? "Calculating..." : "Calculate";
  }

  if (mobileCalculateQuoteBtn) {
    mobileCalculateQuoteBtn.disabled = isCalculatingQuote || isSavingQuote;
    mobileCalculateQuoteBtn.textContent = isCalculatingQuote ? "..." : "Calculate";
  }

  if (cancelEditQuoteBtn) {
    cancelEditQuoteBtn.hidden = !editingQuoteId;
    cancelEditQuoteBtn.disabled = isCalculatingQuote || isSavingQuote;
  }

  if (saveQuoteBtn) {
    saveQuoteBtn.disabled = isCalculatingQuote || isSavingQuote;
    saveQuoteBtn.textContent = isSavingQuote
      ? "Saving..."
      : editingQuoteId
        ? "Update Draft"
        : "Save Draft";
  }

  if (mobileSaveQuoteBtn) {
    mobileSaveQuoteBtn.disabled = isCalculatingQuote || isSavingQuote;
    mobileSaveQuoteBtn.textContent = editingQuoteId ? "Update" : "Save";
  }

  if (confirmSaveQuoteBtn) {
    confirmSaveQuoteBtn.disabled = isCalculatingQuote || isSavingQuote;
    confirmSaveQuoteBtn.textContent = isSavingQuote
      ? "Saving..."
      : editingQuoteId
        ? "Update Draft"
        : "Save Draft";
  }
}

async function loadBlanks() {
  const response = await fetch("/api/shirt-blanks");
  const blanks = await parseApiResponse(response, "Failed to load shirt blanks");
  quoteBlanks = blanks;

  if (!blankSelect) return;

  blankSelect.innerHTML = `
    <option value="">Select a blank</option>
    ${blanks
      .map(
        (blank) => `
          <option value="${escapeHtml(blank.id)}">
            ${escapeHtml(blank.brand)} ${escapeHtml(blank.style_number)} - ${escapeHtml(blank.name)}
            (${formatMoney(blank.base_cost_cents)})
          </option>
        `
      )
      .join("")}
  `;

  const pc43 = blanks.find(
    (blank) => String(blank.style_number || "").toUpperCase() === "PC43"
  );

  if (pc43 && !blankSelect.value) {
    blankSelect.value = String(pc43.id);
  }

  renderSizeInputs();
}

async function calculateQuote() {
  clearQuoteError();
  const missingInputMessage = getMissingQuoteInputMessage();

  if (missingInputMessage) {
    showQuoteError(missingInputMessage);
    return null;
  }

  isCalculatingQuote = true;
  setBusyState();

  try {
    const response = await fetch("/api/quotes/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getQuotePayload()),
    });

    const calculation = await parseApiResponse(response, "Failed to calculate quote");
    renderCalculation(calculation);
    return calculation;
  } catch (error) {
    showQuoteError(error.message);
    throw error;
  } finally {
    isCalculatingQuote = false;
    setBusyState();
  }
}

async function saveQuote() {
  clearQuoteError();
  const customerName = String(quoteForm?.elements?.customer_name?.value || "").trim();

  if (!customerName) {
    openSavePanel();
    showQuoteError("Customer name is required to save a quote.");
    return;
  }

  isSavingQuote = true;
  setBusyState();

  try {
    const response = await fetch(
      editingQuoteId ? `/api/quotes/${editingQuoteId}` : "/api/quotes",
      {
        method: editingQuoteId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getQuotePayload()),
      }
    );

    const saved = await parseApiResponse(
      response,
      editingQuoteId ? "Failed to update quote" : "Failed to save quote"
    );

    const savedId = saved.id;
    resetQuoteForm();
    quoteSummaryContent.innerHTML = `<p class="quote-muted">Saved draft quote #${escapeHtml(savedId)}.</p>`;
    lastCalculation = null;
    updateMobileQuoteBar();
    await loadQuotes();
    await loadQuoteDetail(savedId);
  } catch (error) {
    showQuoteError(error.message);
  } finally {
    isSavingQuote = false;
    setBusyState();
  }
}

function setFormValue(name, value) {
  const field = quoteForm?.elements?.[name];

  if (field) {
    field.value = name === "print_type" ? "DTF" : value ?? "";
  }
}

function resetQuoteForm() {
  editingQuoteId = null;
  quoteForm?.reset();
  isSleeveSelected = false;
  syncSleeveToggleUi();
  renderSizeInputs();
  closeSavePanel();
  lastCalculation = null;
  updateMobileQuoteBar();
  clearQuoteError();
  setBusyState();
}

function ensureBlankOption(item) {
  if (!blankSelect || !item?.shirt_blank_id) return;

  const value = String(item.shirt_blank_id);

  if (blankSelect.querySelector(`option[value="${CSS.escape(value)}"]`)) {
    return;
  }

  const option = document.createElement("option");
  option.value = value;
  option.textContent = item.blank_label || `Blank #${value}`;
  blankSelect.append(option);
  quoteBlanks.push({
    id: item.shirt_blank_id,
    size_availability: {},
  });
}

async function editQuoteDraft(quoteId) {
  clearQuoteError();

  try {
    const response = await fetch(`/api/quotes/${quoteId}`);
    const quote = await parseApiResponse(response, "Failed to load quote");

    if (quote.status !== "draft" || quote.converted_job_id) {
      throw new Error("Only draft quotes can be edited");
    }

    const item = quote.items?.[0];

    if (!item) {
      throw new Error("Quote has no item to edit");
    }

    editingQuoteId = quote.id;
    ensureBlankOption(item);
    setFormValue("customer_name", quote.customer_name);
    setFormValue("customer_email", quote.customer_email);
    setFormValue("customer_phone", quote.customer_phone);
    setFormValue("due_date", quote.due_date);
    setFormValue("notes", quote.notes);
    setFormValue("shirt_blank_id", item.shirt_blank_id);
    setFormValue("color", item.color);
    setFormValue("print_type", item.print_type);

    const placements = item.placements || [];
    isSleeveSelected = placements.includes("sleeve");
    syncSleeveToggleUi();

    renderSizeInputs();

    (item.sizes || []).forEach((size) => {
      const input = sizeGrid?.querySelector(
        `input[data-size="${CSS.escape(size.size_label)}"]`
      );

      if (input) {
        input.value = size.quantity;
      }
    });

    updateQuantityTotal();
    quoteSummaryContent.innerHTML = `<p class="quote-muted">Editing draft quote #${escapeHtml(quote.id)}.</p>`;
    lastCalculation = null;
    openSavePanel();
    updateMobileQuoteBar();
    setBusyState();
    quoteForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showQuoteError(error.message);
  }
}

async function convertQuoteToOrder(quoteId, button) {
  clearQuoteError();

  if (button) {
    button.disabled = true;
    button.textContent = "Converting...";
  }

  try {
    const response = await fetch(`/api/quotes/${quoteId}/convert-to-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const converted = await parseApiResponse(
      response,
      "Failed to convert quote"
    );

    quoteSummaryContent.innerHTML = `
      <p class="quote-muted">
        Converted quote #${escapeHtml(converted.quote_id)} to order
        #${escapeHtml(converted.order_number)}.
      </p>
    `;

    await loadQuotes();
    await loadQuoteDetail(converted.quote_id);
  } catch (error) {
    showQuoteError(error.message);

    if (button) {
      button.disabled = false;
      button.textContent = "Convert";
    }
  }
}

function renderQuoteDetail(quote) {
  if (!quoteDetail) return;

  const item = quote.items?.[0];
  const canEdit = quote.status === "draft" && !quote.converted_job_id;
  const placements = (item?.placements || [])
    .map((placement) =>
      String(placement)
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    )
    .join(", ");
  const sizeRows = (item?.sizes || [])
    .filter((size) => Number(size.quantity) > 0)
    .map(
      (size) => `
        <div class="quote-detail-size">
          <span>${escapeHtml(size.size_label)}</span>
          <strong>${escapeHtml(size.quantity)}</strong>
        </div>
      `
    )
    .join("");

  quoteDetail.innerHTML = `
    <div class="quote-detail-header">
      <div>
        <h3>#${escapeHtml(quote.id)} ${escapeHtml(quote.customer_name)}</h3>
        <p>${escapeHtml(formatStatus(quote.status))} - Due ${escapeHtml(formatDate(quote.due_date))}</p>
      </div>
      <span class="quote-status-pill">${escapeHtml(formatStatus(quote.status))}</span>
    </div>

    <div class="quote-card-actions">
      <a class="secondary-btn quote-output-link" href="/quote/${escapeHtml(quote.id)}" target="_blank" rel="noopener">
        Customer View
      </a>
      ${
        canEdit
          ? `
            <button
              type="button"
              class="secondary-btn quote-edit-btn"
              data-quote-id="${escapeHtml(quote.id)}"
            >
              Edit Draft
            </button>
          `
          : ""
      }
    </div>

    <div class="quote-total-row">
      <strong>Contact</strong>
      <span>${escapeHtml([quote.customer_email, quote.customer_phone].filter(Boolean).join(" - ") || "Not set")}</span>
    </div>
    <div class="quote-total-row">
      <strong>Blank</strong>
      <span>${escapeHtml(item?.blank_label || "Not set")}</span>
    </div>
    <div class="quote-total-row">
      <strong>Color</strong>
      <span>${escapeHtml(item?.color || "Not set")}</span>
    </div>
    <div class="quote-total-row">
      <strong>Print</strong>
      <span>${escapeHtml([item?.print_type, placements].filter(Boolean).join(" - ") || "Not set")}</span>
    </div>
    <div class="quote-total-row">
      <strong>Total Qty</strong>
      <span>${escapeHtml(quote.total_quantity)}</span>
    </div>
    <div class="quote-total-row">
      <strong>Per Shirt</strong>
      <span>${formatMoney(quote.price_per_shirt_cents)}</span>
    </div>
    <div class="quote-total-row">
      <strong>Profit</strong>
      <span>${formatMoney(quote.profit_cents)}</span>
    </div>
    <div class="quote-total-row quote-grand-total">
      <strong>Total Quote</strong>
      <span>${formatMoney(quote.total_price_cents)}</span>
    </div>

    <div class="quote-detail-sizes">
      ${sizeRows || `<p class="quote-muted">No sizes saved.</p>`}
    </div>

    ${
      quote.notes
        ? `<div class="quote-detail-notes">${escapeHtml(quote.notes)}</div>`
        : ""
    }
  `;

  quoteDetail.querySelector(".quote-edit-btn")?.addEventListener("click", async (event) => {
    await editQuoteDraft(event.currentTarget.dataset.quoteId);
  });
}

async function loadQuoteDetail(quoteId) {
  if (!quoteDetail) return;

  quoteDetail.innerHTML = `<p class="quote-muted">Loading quote #${escapeHtml(quoteId)}...</p>`;

  try {
    const response = await fetch(`/api/quotes/${quoteId}`);
    const quote = await parseApiResponse(response, "Failed to load quote");
    renderQuoteDetail(quote);
  } catch (error) {
    quoteDetail.innerHTML = `<p class="quote-muted">${escapeHtml(error.message)}</p>`;
  }
}

async function updateQuoteStatus(quoteId, status, button) {
  clearQuoteError();

  if (button) {
    button.disabled = true;
    button.textContent = status === "archived" ? "Archiving..." : "Restoring...";
  }

  try {
    const response = await fetch(`/api/quotes/${quoteId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    await parseApiResponse(response, "Failed to update quote");
    await loadQuotes();
    await loadQuoteDetail(quoteId);
  } catch (error) {
    showQuoteError(error.message);

    if (button) {
      button.disabled = false;
      button.textContent = status === "archived" ? "Archive" : "Restore";
    }
  }
}

async function loadQuotes() {
  if (!quoteList) return;

  try {
    const params = getQuoteListParams();
    const response = await fetch(`/api/quotes?${params.toString()}`);
    const quotes = await parseApiResponse(response, "Failed to load quotes");

    if (!quotes.length) {
      quoteList.innerHTML = `<p class="quote-muted">No quotes match this view.</p>`;
      return;
    }

    quoteList.innerHTML = quotes
      .map(
        (quote) => {
          const isConverted = quote.status === "converted" || quote.converted_job_id;
          const isArchived = quote.status === "archived";
          const canEdit = quote.status === "draft" && !quote.converted_job_id;

          return `
          <article class="quote-draft-card">
            <div class="quote-card-heading">
              <h3>#${escapeHtml(quote.id)} ${escapeHtml(quote.customer_name)}</h3>
              <span class="quote-status-pill">${escapeHtml(formatStatus(quote.status))}</span>
            </div>
            <p>${escapeHtml(quote.total_quantity)} shirts - ${formatMoney(quote.total_price_cents)}</p>
            <p>${formatMoney(quote.price_per_shirt_cents)} each - Profit ${formatMoney(quote.profit_cents)}</p>
            <p>Due ${escapeHtml(formatDate(quote.due_date))}</p>
            ${isConverted ? `<p>Converted to job #${escapeHtml(quote.converted_job_id)}</p>` : ""}

            <div class="quote-card-actions">
              <button
                type="button"
                class="secondary-btn quote-view-btn"
                data-quote-id="${escapeHtml(quote.id)}"
              >
                View
              </button>
              <a
                class="secondary-btn quote-output-link"
                href="/quote/${escapeHtml(quote.id)}"
                target="_blank"
                rel="noopener"
              >
                Customer
              </a>
              ${
                canEdit
                  ? `
                    <button
                      type="button"
                      class="secondary-btn quote-edit-btn"
                      data-quote-id="${escapeHtml(quote.id)}"
                    >
                      Edit
                    </button>
                  `
                  : ""
              }
              ${
                !isConverted
                  ? `
                  <button
                    type="button"
                    class="secondary-btn quote-convert-btn"
                    data-quote-id="${escapeHtml(quote.id)}"
                  >
                    Convert
                  </button>
                `
                  : ""
              }
              ${
                !isConverted
                  ? `
                    <button
                      type="button"
                      class="secondary-btn quote-status-btn"
                      data-quote-id="${escapeHtml(quote.id)}"
                      data-status="${isArchived ? "draft" : "archived"}"
                    >
                      ${isArchived ? "Restore" : "Archive"}
                    </button>
                  `
                  : ""
              }
            </div>
          </article>
        `;
        }
      )
      .join("");

    quoteList.querySelectorAll(".quote-view-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        await loadQuoteDetail(button.dataset.quoteId);
      });
    });

    quoteList.querySelectorAll(".quote-convert-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        await convertQuoteToOrder(button.dataset.quoteId, button);
      });
    });

    quoteList.querySelectorAll(".quote-edit-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        await editQuoteDraft(button.dataset.quoteId);
      });
    });

    quoteList.querySelectorAll(".quote-status-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        await updateQuoteStatus(
          button.dataset.quoteId,
          button.dataset.status,
          button
        );
      });
    });
  } catch (error) {
    quoteList.innerHTML = `<p class="quote-muted">${escapeHtml(error.message)}</p>`;
  }
}

calculateQuoteBtn?.addEventListener("click", async () => {
  try {
    await calculateQuote();
  } catch {
    // Error is shown inline.
  }
});

mobileCalculateQuoteBtn?.addEventListener("click", async () => {
  try {
    await calculateQuote();
  } catch {
    // Error is shown inline.
  }
});

saveQuoteBtn?.addEventListener("click", () => {
  clearQuoteError();
  openSavePanel();
});

mobileSaveQuoteBtn?.addEventListener("click", () => {
  clearQuoteError();
  openSavePanel();
});

closeSavePanelBtn?.addEventListener("click", () => {
  closeSavePanel();
});

sleeveToggleCard?.addEventListener("click", () => {
  isSleeveSelected = !isSleeveSelected;
  syncSleeveToggleUi();
  invalidateCalculation();
});

quoteForm?.addEventListener("input", (event) => {
  const target = event.target;
  const pricingFieldNames = new Set([
    "shirt_blank_id",
    "color",
    "print_type",
  ]);

  if (pricingFieldNames.has(target?.name) || target?.dataset?.size) {
    invalidateCalculation();
  }
});

quoteForm?.addEventListener("change", (event) => {
  const target = event.target;

  if (target?.name === "shirt_blank_id") {
    invalidateCalculation();
  }
});

quoteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveQuote();
});

cancelEditQuoteBtn?.addEventListener("click", () => {
  resetQuoteForm();
  quoteSummaryContent.innerHTML = `<p class="quote-muted">Calculate a quote to preview pricing.</p>`;
});

quoteSearch?.addEventListener("input", () => {
  window.clearTimeout(quoteSearchTimer);
  quoteSearchTimer = window.setTimeout(loadQuotes, 250);
});

quoteStatusFilter?.addEventListener("change", loadQuotes);

blankSelect?.addEventListener("change", () => {
  const quantities = getSizeQuantities();
  renderSizeInputs();

  sizeGrid?.querySelectorAll("input[data-size]").forEach((input) => {
    const quantity = quantities[input.dataset.size] || 0;
    if (!input.disabled) {
      input.value = quantity;
    }
  });

  updateQuantityTotal();
  invalidateCalculation();
});

syncSleeveToggleUi();
renderSizeInputs();
updateMobileQuoteBar();
setBusyState();
loadBlanks().catch((error) => showQuoteError(error.message));
loadQuotes();
