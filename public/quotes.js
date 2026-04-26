/**
 * File: public/quotes.js
 * Project: 843Teez Orders
 * Purpose: Frontend logic for the draft quote builder
 */

const QUOTE_SIZES = ["YS", "YM", "YL", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];

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

let isSavingQuote = false;
let isCalculatingQuote = false;
let quoteSearchTimer = null;

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

  sizeGrid.innerHTML = QUOTE_SIZES.map(
    (size) => `
      <label class="size-field">
        <span>${escapeHtml(size)}</span>
        <input
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          value="0"
          data-size="${escapeHtml(size)}"
          aria-label="${escapeHtml(size)} quantity"
        />
      </label>
    `
  ).join("");

  sizeGrid.querySelectorAll("input[data-size]").forEach((input) => {
    input.addEventListener("input", updateQuantityTotal);
  });

  updateQuantityTotal();
}

function getSizeQuantities() {
  const sizes = {};

  sizeGrid?.querySelectorAll("input[data-size]").forEach((input) => {
    sizes[input.dataset.size] = Math.max(0, Math.floor(Number(input.value) || 0));
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
}

function getSelectedPlacements() {
  return Array.from(
    document.querySelectorAll('input[name="placements"]:checked')
  ).map((input) => input.value);
}

function getQuotePayload() {
  const formData = new FormData(quoteForm);

  return {
    customer_name: String(formData.get("customer_name") || "").trim(),
    customer_email: String(formData.get("customer_email") || "").trim(),
    customer_phone: String(formData.get("customer_phone") || "").trim(),
    due_date: String(formData.get("due_date") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
    item: {
      shirt_blank_id: Number(formData.get("shirt_blank_id") || 0),
      color: String(formData.get("color") || "").trim(),
      print_type: String(formData.get("print_type") || "").trim(),
      placements: getSelectedPlacements(),
      sizes: getSizeQuantities(),
    },
  };
}

function renderCalculation(calculation) {
  const totals = calculation?.totals;
  const item = calculation?.item;

  if (!quoteSummaryContent || !totals || !item) return;

  const placementLabels = (item.placement_breakdown || [])
    .map((placement) => placement.label)
    .join(", ");

  quoteSummaryContent.innerHTML = `
    <div class="quote-total-row">
      <strong>Blank</strong>
      <span>${escapeHtml(item.blank_label)}</span>
    </div>
    <div class="quote-total-row">
      <strong>Print</strong>
      <span>${escapeHtml(item.print_type)}${placementLabels ? ` - ${escapeHtml(placementLabels)}` : ""}</span>
    </div>
    <div class="quote-total-row">
      <strong>Total Qty</strong>
      <span>${escapeHtml(totals.total_quantity)}</span>
    </div>
    <div class="quote-total-row">
      <strong>Blank Cost</strong>
      <span>${formatMoney(totals.blank_cost_cents)}</span>
    </div>
    <div class="quote-total-row">
      <strong>Print Cost</strong>
      <span>${formatMoney(totals.print_cost_cents)}</span>
    </div>
    <div class="quote-total-row">
      <strong>Setup Fees</strong>
      <span>${formatMoney(totals.setup_fee_cents)}</span>
    </div>
    <div class="quote-total-row">
      <strong>Per Shirt</strong>
      <span>${formatMoney(totals.price_per_shirt_cents)}</span>
    </div>
    <div class="quote-total-row">
      <strong>Profit</strong>
      <span>${formatMoney(totals.profit_cents)}</span>
    </div>
    <div class="quote-total-row quote-grand-total">
      <strong>Total Quote</strong>
      <span>${formatMoney(totals.total_price_cents)}</span>
    </div>
  `;
}

function setBusyState() {
  if (calculateQuoteBtn) {
    calculateQuoteBtn.disabled = isCalculatingQuote || isSavingQuote;
    calculateQuoteBtn.textContent = isCalculatingQuote ? "Calculating..." : "Calculate";
  }

  if (saveQuoteBtn) {
    saveQuoteBtn.disabled = isCalculatingQuote || isSavingQuote;
    saveQuoteBtn.textContent = isSavingQuote ? "Saving..." : "Save Draft";
  }
}

async function loadBlanks() {
  const response = await fetch("/api/shirt-blanks");
  const blanks = await parseApiResponse(response, "Failed to load shirt blanks");

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
}

async function calculateQuote() {
  clearQuoteError();
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
  isSavingQuote = true;
  setBusyState();

  try {
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getQuotePayload()),
    });

    const saved = await parseApiResponse(response, "Failed to save quote");

    quoteForm?.reset();
    renderSizeInputs();
    quoteSummaryContent.innerHTML = `<p class="quote-muted">Saved draft quote #${escapeHtml(saved.id)}.</p>`;
    await loadQuotes();
  } catch (error) {
    showQuoteError(error.message);
  } finally {
    isSavingQuote = false;
    setBusyState();
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

quoteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveQuote();
});

quoteSearch?.addEventListener("input", () => {
  window.clearTimeout(quoteSearchTimer);
  quoteSearchTimer = window.setTimeout(loadQuotes, 250);
});

quoteStatusFilter?.addEventListener("change", loadQuotes);

renderSizeInputs();
setBusyState();
loadBlanks().catch((error) => showQuoteError(error.message));
loadQuotes();
