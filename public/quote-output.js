/**
 * File: public/quote-output.js
 * Project: 843Teez Orders
 * Purpose: Customer-facing quote output rendering
 */

const output = document.getElementById("quote-output");
const printQuoteBtn = document.getElementById("print-quote-btn");

const PLACEMENT_LABELS = {
  left_chest: "Left Chest",
  full_front: "Full Front",
  full_back: "Full Back",
  sleeve: "Sleeve",
};

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

function getQuoteIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const quoteId = Number(parts[1]);
  return Number.isInteger(quoteId) && quoteId > 0 ? quoteId : 0;
}

function renderQuote(quote) {
  const item = quote.items?.[0] || {};
  const placements = (item.placements || [])
    .map((placement) => PLACEMENT_LABELS[placement] || placement)
    .filter(Boolean)
    .join(", ");
  const sizes = (item.sizes || []).filter((size) => Number(size.quantity) > 0);
  const sizeSummary = sizes
    .map((size) => `${size.size_label}: ${size.quantity}`)
    .join(", ");

  output.innerHTML = `
    <section class="quote-output-header">
      <div class="quote-output-brand">
        <h1>843 Teez</h1>
        <p>Custom apparel quote</p>
      </div>

      <div class="quote-output-meta">
        <span class="quote-output-status">${escapeHtml(formatStatus(quote.status))}</span>
        <h2>Quote #${escapeHtml(quote.id)}</h2>
        <p>Due ${escapeHtml(formatDate(quote.due_date))}</p>
      </div>
    </section>

    <section class="quote-output-grid">
      <div class="quote-output-section">
        <h3>Prepared For</h3>
        <p>${escapeHtml(quote.customer_name)}</p>
        <p>${escapeHtml(quote.customer_email || "")}</p>
        <p>${escapeHtml(quote.customer_phone || "")}</p>
      </div>

      <div class="quote-output-section">
        <h3>Quote Details</h3>
        <p>${escapeHtml(item.print_type || "Print")} apparel order</p>
        <p>${escapeHtml(placements || "Placement not set")}</p>
        <p>${escapeHtml(item.color ? `Color: ${item.color}` : "Color not set")}</p>
      </div>

      <div class="quote-output-section full">
        <h3>Items</h3>
        <table class="quote-output-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>${escapeHtml(item.blank_label || "Custom shirts")}</strong>
                <p>${escapeHtml(sizeSummary || "Sizes not set")}</p>
              </td>
              <td>${escapeHtml(quote.total_quantity)}</td>
              <td>${formatMoney(quote.price_per_shirt_cents)}</td>
              <td>${formatMoney(quote.total_price_cents)}</td>
            </tr>
          </tbody>
        </table>

        <div class="quote-output-total">
          <span>Total</span>
          <span>${formatMoney(quote.total_price_cents)}</span>
        </div>
      </div>

      ${
        quote.notes
          ? `
            <div class="quote-output-section full">
              <h3>Notes</h3>
              <p class="quote-output-notes">${escapeHtml(quote.notes)}</p>
            </div>
          `
          : ""
      }
    </section>
  `;
}

async function loadQuote() {
  const quoteId = getQuoteIdFromPath();

  if (!quoteId) {
    output.innerHTML = `<p class="quote-output-muted">Quote id is missing.</p>`;
    return;
  }

  try {
    const response = await fetch(`/api/quotes/${quoteId}`);
    const quote = await parseApiResponse(response, "Failed to load quote");
    renderQuote(quote);
  } catch (error) {
    output.innerHTML = `<p class="quote-output-muted">${escapeHtml(error.message)}</p>`;
  }
}

printQuoteBtn?.addEventListener("click", () => window.print());

loadQuote();
