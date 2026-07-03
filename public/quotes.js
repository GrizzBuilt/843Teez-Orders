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
const garmentBlocks = document.getElementById("garment-blocks");
const garmentTotal = document.getElementById("garment-total");
const addGarmentBtn = document.getElementById("add-garment-btn");
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
const printTypeSelect = document.getElementById("print_type");
const basePlacementSelect = document.getElementById("base_placement");
const dtfSourceSelect = document.getElementById("dtf_source");
const dtfCostPerShirtInput = document.getElementById("dtf_cost_per_shirt");
const dtfSourceField = document.getElementById("dtf-source-field");
const dtfCostField = document.getElementById("dtf-cost-field");

const DTF_SOURCE_DEFAULT_COSTS = {
  in_house_dtf: 3,
  outsourced_dtf: 5.5,
  customer_supplied: 0,
};

const DTF_SOURCE_LABELS = {
  in_house_dtf: "In-house DTF",
  outsourced_dtf: "Outsourced DTF",
  customer_supplied: "Customer-supplied transfers",
  manual_custom: "Manual custom cost",
};

let isSavingQuote = false;
let isCalculatingQuote = false;
let quoteSearchTimer = null;
let editingQuoteId = null;
let lastCalculation = null;
let quoteBlanks = [];
let isSleeveSelected = false;
let nextGarmentBlockId = 1;

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

function dollarsToOptionalCents(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : null;
}

function centsToDollarInput(cents, includeZero = false) {
  const amount = Number(cents);
  return Number.isFinite(amount) && (includeZero || amount > 0)
    ? (amount / 100).toFixed(2)
    : "";
}

function formatBasisPoints(basisPoints) {
  return `${((Number(basisPoints) || 0) / 100).toFixed(1)}%`;
}

function formatMarginStatus(status) {
  const labels = {
    healthy: "Healthy",
    strong: "Strong",
    excellent: "Excellent",
    tight: "Caution / Tight",
    weak: "Weak",
    too_low: "Bad / Too Low",
  };

  return labels[status] || "Not calculated";
}

function getFinalAveragePerShirtCents(source) {
  const totalQuantity = Number(source?.total_quantity) || 0;

  if (totalQuantity < 1) {
    return 0;
  }

  return Math.round((Number(source?.total_price_cents) || 0) / totalQuantity);
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

function renderDtfSourceComparison(comparison) {
  if (!Array.isArray(comparison) || !comparison.length) {
    return "";
  }

  return `
    <section class="dtf-comparison-panel">
      <div class="pricing-safety-heading">
        <h3>DTF Source Comparison</h3>
      </div>
      <div class="dtf-comparison-grid">
        ${comparison
          .map(
            (source) => `
              <article class="dtf-comparison-option">
                <h4>${escapeHtml(source.label)}</h4>
                ${renderQuoteTotalRow("DTF Cost / Shirt", formatMoney(source.dtf_cost_per_shirt_cents))}
                ${renderQuoteTotalRow("Total DTF Cost", formatMoney(source.dtf_cost_total_cents))}
                ${renderQuoteTotalRow("Total Landed Cost", formatMoney(source.total_landed_cost_cents))}
                ${renderQuoteTotalRow("Landed Cost / Shirt", formatMoney(source.landed_cost_per_shirt_cents))}
                ${renderQuoteTotalRow("Gross Profit", formatMoney(source.gross_profit_cents))}
                ${renderQuoteTotalRow("Profit / Shirt", formatMoney(source.gross_profit_per_shirt_cents))}
                ${renderQuoteTotalRow("Gross Margin", formatBasisPoints(source.gross_margin_basis_points))}
                ${renderQuoteTotalRow("Protected Selling Price / Shirt", formatMoney(source.recommended_price_per_shirt_cents))}
                ${renderQuoteTotalRow("Protected Total", formatMoney(source.recommended_total_cents))}
              </article>
            `
          )
          .join("")}
      </div>
    </section>
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

function getDefaultBlankId() {
  return quoteBlanks.find(
    (blank) => String(blank.style_number || "").toUpperCase() === "PC43"
  )?.id || "";
}

function renderBlankOptions(selectedBlankId) {
  return `
    <option value="">Select a blank</option>
    ${quoteBlanks
      .map(
        (blank) => `
          <option value="${escapeHtml(blank.id)}" ${String(blank.id) === String(selectedBlankId) ? "selected" : ""}>
            ${escapeHtml(blank.brand)} ${escapeHtml(blank.style_number)} - ${escapeHtml(blank.name)}
            (${formatMoney(blank.base_cost_cents)})
          </option>
        `
      )
      .join("")}
  `;
}

function getBlockSizeQuantities(block) {
  const sizes = {};

  block?.querySelectorAll("input[data-size]").forEach((input) => {
    sizes[input.dataset.size] = input.disabled
      ? 0
      : Math.max(0, Math.floor(Number(input.value) || 0));
  });

  return sizes;
}

function renderGarmentSizeInputs(block, savedSizes = {}) {
  const sizeGrid = block?.querySelector(".size-grid");
  const blankId = block?.querySelector(".garment-blank-select")?.value || "";
  const selectedBlank = quoteBlanks.find(
    (blank) => String(blank.id) === String(blankId)
  );
  const availability = selectedBlank?.size_availability || {};

  if (!sizeGrid) return;

  sizeGrid.innerHTML = QUOTE_SIZES.map((size) => {
    const isAvailable = availability[size] == null
      ? true
      : Number(availability[size]) === 1;
    const quantity = isAvailable
      ? Math.max(0, Math.floor(Number(savedSizes[size]) || 0))
      : 0;

    return `
      <label class="size-field ${isAvailable ? "" : "size-field-unavailable"}">
        <span>${escapeHtml(size)}</span>
        <div class="size-stepper">
          <button type="button" class="size-step-btn" data-size-step="-1" aria-label="Decrease ${escapeHtml(size)} quantity" ${isAvailable ? "" : "disabled"}>-</button>
          <input type="number" min="0" step="1" inputmode="numeric" value="${quantity}" data-size="${escapeHtml(size)}" aria-label="${escapeHtml(size)} quantity" ${isAvailable ? "" : "disabled"} />
          <button type="button" class="size-step-btn" data-size-step="1" aria-label="Increase ${escapeHtml(size)} quantity" ${isAvailable ? "" : "disabled"}>+</button>
        </div>
        ${isAvailable ? "" : `<small>Unavailable</small>`}
      </label>
    `;
  }).join("");

  updateQuantityTotals();
}

function addGarmentBlock(item = {}) {
  if (!garmentBlocks) return null;

  const blockId = nextGarmentBlockId++;
  const selectedBlankId = item.shirt_blank_id || getDefaultBlankId();
  const savedSizes = Array.isArray(item.sizes)
    ? Object.fromEntries(item.sizes.map((size) => [size.size_label, size.quantity]))
    : item.sizes || {};
  const block = document.createElement("article");
  block.className = "garment-block";
  block.dataset.garmentId = String(blockId);
  block.innerHTML = `
    <div class="garment-block-heading">
      <h4>Shirt Style <span class="garment-number"></span></h4>
      <button type="button" class="garment-remove-btn" aria-label="Remove this shirt style">Remove</button>
    </div>
    <div class="quote-grid">
      <label class="quote-field quote-field-wide">
        <span>Garment Style / Type</span>
        <select class="garment-blank-select" required>${renderBlankOptions(selectedBlankId)}</select>
      </label>
      <label class="quote-field quote-field-wide">
        <span>Shirt Color or Colors</span>
        <input type="text" class="garment-color-input" value="${escapeHtml(item.color || "")}" placeholder="Navy Blue and Gray" />
      </label>
    </div>
    <div class="garment-size-heading">
      <strong>Size Quantities</strong>
      <span class="quote-count-pill garment-quantity-total">0 total</span>
    </div>
    <div class="size-grid"></div>
    <label class="quote-field garment-notes-field">
      <span>Notes for This Style <small>(optional)</small></span>
      <textarea class="garment-notes-input" rows="2" placeholder="Fit, decoration, or other details...">${escapeHtml(item.style_notes || "")}</textarea>
    </label>
  `;
  garmentBlocks.append(block);
  renderGarmentSizeInputs(block, savedSizes);
  updateGarmentBlockLabels();
  return block;
}

function updateGarmentBlockLabels() {
  const blocks = [...(garmentBlocks?.querySelectorAll(".garment-block") || [])];

  blocks.forEach((block, index) => {
    const number = block.querySelector(".garment-number");
    const removeButton = block.querySelector(".garment-remove-btn");
    if (number) number.textContent = String(index + 1);
    if (removeButton) removeButton.hidden = blocks.length === 1;
  });

  if (addGarmentBtn) addGarmentBtn.disabled = blocks.length >= 12;
}

function getGarmentItems() {
  return [...(garmentBlocks?.querySelectorAll(".garment-block") || [])].map(
    (block) => ({
      shirt_blank_id: Number(
        block.querySelector(".garment-blank-select")?.value || 0
      ),
      color: String(block.querySelector(".garment-color-input")?.value || "").trim(),
      style_notes: String(block.querySelector(".garment-notes-input")?.value || "").trim(),
      print_type: printTypeSelect?.value || "DTF",
      placements: getSelectedPlacements(),
      sizes: getBlockSizeQuantities(block),
    })
  );
}

function updateQuantityTotals() {
  let grandTotal = 0;

  garmentBlocks?.querySelectorAll(".garment-block").forEach((block) => {
    const total = Object.values(getBlockSizeQuantities(block)).reduce(
      (sum, quantity) => sum + quantity,
      0
    );
    const totalLabel = block.querySelector(".garment-quantity-total");
    if (totalLabel) totalLabel.textContent = `${total} total`;
    grandTotal += total;
  });

  if (garmentTotal) garmentTotal.textContent = `${grandTotal} total`;
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

function syncPrintTypeUi() {
  const isDtf = (printTypeSelect?.value || "DTF") === "DTF";

  if (dtfSourceField) dtfSourceField.hidden = !isDtf;
  if (dtfCostField) dtfCostField.hidden = !isDtf;
}

function getSelectedPlacements() {
  const basePlacement = basePlacementSelect?.value || "full_front";
  return isSleeveSelected ? [basePlacement, "sleeve"] : [basePlacement];
}

function getQuotePayload() {
  const formData = new FormData(quoteForm);
  const items = getGarmentItems();
  const expectedTotalQuantity = items.reduce(
    (sum, item) =>
      sum +
      Object.values(item.sizes || {}).reduce(
        (itemSum, quantity) => itemSum + (Number(quantity) || 0),
        0
      ),
    0
  );

  const payload = {
    quote_payload_version: 2,
    expected_item_count: items.length,
    expected_total_quantity: expectedTotalQuantity,
    customer_name: String(formData.get("customer_name") || "").trim(),
    customer_email: String(formData.get("customer_email") || "").trim(),
    customer_phone: String(formData.get("customer_phone") || "").trim(),
    due_date: String(formData.get("due_date") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
    pricing_safety: {
      shirt_blank_cost_cents: dollarsToOptionalCents(formData.get("shirt_blank_cost")),
      shirt_shipping_cents: dollarsToOptionalCents(formData.get("shirt_shipping")),
      dtf_source: String(formData.get("dtf_source") || "in_house_dtf"),
      dtf_cost_per_shirt_cents: dollarsToOptionalCents(
        formData.get("dtf_cost_per_shirt")
      ),
      dtf_shipping_cents: dollarsToOptionalCents(formData.get("dtf_shipping")),
      misc_cost_cents: dollarsToOptionalCents(formData.get("misc_cost")),
      setup_labor_cost_cents: dollarsToOptionalCents(formData.get("setup_labor_cost")),
      quoted_price_per_shirt_cents: dollarsToOptionalCents(
        formData.get("quoted_price_per_shirt")
      ),
      quoted_total_cents: dollarsToOptionalCents(formData.get("quoted_total")),
    },
    items,
  };

  console.log("QUOTE PAYLOAD", payload);
  return payload;
}

function getMissingQuoteInputMessage(payload = getQuotePayload()) {
  if (!payload.items.length) {
    return "Add at least one shirt style before calculating.";
  }

  if (!payload.items[0]?.placements.some((placement) => placement !== "sleeve")) {
    return "Choose a print placement before calculating.";
  }

  for (const [index, item] of payload.items.entries()) {
    if (!item.shirt_blank_id) {
      return `Choose a garment style for Shirt Style ${index + 1}.`;
    }

    const totalQuantity = Object.values(item.sizes || {}).reduce(
      (sum, quantity) => sum + (Number(quantity) || 0),
      0
    );

    if (totalQuantity < 1) {
      return `Enter at least one quantity for Shirt Style ${index + 1}.`;
    }
  }

  if (
    payload.items[0]?.print_type === "DTF" &&
    payload.pricing_safety.dtf_source === "manual_custom" &&
    payload.pricing_safety.dtf_cost_per_shirt_cents == null
  ) {
    return "Enter a manual DTF cost per shirt before calculating.";
  }

  return "";
}

function renderCalculation(calculation) {
  const totals = calculation?.totals;
  const calculationItems = calculation?.items || [];
  const item = calculationItems[0] || calculation?.item;

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
  const customerBlankUpgradeTotalCents =
    Number(totals.customer_blank_upgrade_total_cents) ||
    Number(pricingDebug.customerBlankUpgradeTotalCents) ||
    blankUpgradeTotalCents;
  const finalAveragePerShirtCents = getFinalAveragePerShirtCents(totals);
  const safety = totals.pricing_safety || item.pricing_safety || {};
  const sizeUpgradeRows = (item.sizes || [])
    .filter((size) => Number(size.customer_blank_upgrade_total_cents) > 0)
    .map((size) =>
      renderQuoteTotalRow(
        Number(size.quantity) > 1
          ? `${size.size_label} (${size.quantity})`
          : size.size_label,
        `+${formatMoney(size.customer_blank_upgrade_total_cents)}`
      )
    )
    .join("");
  const garmentPricingSections = calculationItems
    .map((garment, index) => {
      const garmentSizes = (garment.sizes || [])
        .filter((size) => Number(size.quantity) > 0)
        .map((size) => `${size.size_label}: ${size.quantity}`)
        .join(", ");
      const garmentDebug = garment.pricing_debug || {};
      const garmentUpgradeTotal =
        Number(garment.customer_blank_upgrade_total_cents) || 0;
      const garmentSleeveTotal = Number(garment.sleeve_add_on_total_cents) || 0;
      const garmentBaseUpgradeSubtotalCents =
        (Number(garment.base_deal_subtotal_cents) || 0) +
        garmentUpgradeTotal +
        garmentSleeveTotal;

      return `
        <article class="calculated-garment">
          <div class="calculated-garment-heading">
            <div>
              <strong>${index + 1}. ${escapeHtml(garment.blank_label)}</strong>
              <span>${escapeHtml(garment.color ? `Color(s): ${garment.color}` : "Color not set")}</span>
            </div>
            <span>${escapeHtml(garment.total_quantity)} total</span>
          </div>
          <p>${escapeHtml(garmentSizes || "Sizes not set")}</p>
          ${renderQuoteTotalRow("Base Tier Price", formatMoney(garment.base_deal_subtotal_cents))}
          ${garmentUpgradeTotal > 0 ? renderQuoteTotalRow("Size / Blank Upgrades", `+${formatMoney(garmentUpgradeTotal)}`) : ""}
          ${garmentSleeveTotal > 0 ? renderQuoteTotalRow("Sleeve Add-On", `+${formatMoney(garmentSleeveTotal)}`) : ""}
          ${renderQuoteTotalRow("Style Base / Upgrade Subtotal", formatMoney(garmentBaseUpgradeSubtotalCents))}
          ${garment.style_notes ? `<p class="calculated-garment-notes">${escapeHtml(garment.style_notes)}</p>` : ""}
          <span class="calculated-garment-deal">Internal tier: ${escapeHtml(garment.pricing_label || garmentDebug.pricingLabel || "Not set")}</span>
        </article>
      `;
    })
    .join("");
  const dealRows = [
    pricingLabel
      ? renderQuoteTotalRow("Internal Pricing Tier", pricingLabel)
      : "",
    renderQuoteTotalRow("Internal Base Tier Subtotal", formatMoney(baseDealSubtotalCents)),
    sleeveAddOnTotalCents > 0
      ? renderQuoteTotalRow(
          "Sleeve Add-On",
          `+${formatMoney(sleeveAddOnPerShirtCents)} each (${formatMoney(sleeveAddOnTotalCents)})`
        )
      : "",
    customerBlankUpgradeTotalCents > 0
      ? renderQuoteTotalRow(
          "Size / Blank Upgrades",
          `+${formatMoney(customerBlankUpgradeTotalCents)}`
        )
      : "",
  ].join("");
  const marginStatus = String(safety.margin_status || "");
  const placementRows = Array.isArray(item.placement_breakdown)
    ? item.placement_breakdown
        .map((placement) =>
          renderQuoteTotalRow(
            `${String(placement.label || placement.placement || "Placement")}`,
            `Rule ${placement.rule_id || "n/a"} · Cost ${formatMoney(placement.print_cost_cents)}`
          )
        )
        .join("")
    : "";
  const warning = safety.low_margin_warning
    ? `
      <section class="pricing-warning" role="alert">
        <h3>Low Margin Warning</h3>
        <p>${safety.manual_price_below_protected ? "Manual price is below protected pricing. This job may not help the business move beyond break-even." : "The customer price is below protected pricing. This job may not help the business move beyond break-even."}</p>
        ${renderQuoteTotalRow("Your Price / Shirt", formatMoney(safety.quoted_price_per_shirt_cents))}
        ${renderQuoteTotalRow("Protected Selling Price", formatMoney(safety.recommended_price_per_shirt_cents))}
        ${renderQuoteTotalRow("Current Margin", formatBasisPoints(safety.gross_margin_basis_points))}
        ${renderQuoteTotalRow("Protected Total", formatMoney(safety.recommended_total_cents))}
      </section>
    `
    : "";
  const advancedResults = safety.total_landed_cost_cents != null
    ? `
      <details class="advanced-results">
        <summary>Show Details</summary>
        <div class="advanced-results-content">
          ${renderQuoteTotalRow("Blank", item.blank_label)}
          ${renderQuoteTotalRow("Total Qty", totals.total_quantity)}
          ${dealRows}
          ${renderQuoteTotalRow("Print Source", safety.dtf_source_label || "Not set")}
          ${renderQuoteTotalRow("DTF Cost / Shirt", formatMoney(safety.dtf_cost_per_shirt_cents))}
          ${renderQuoteTotalRow("Total DTF Cost", formatMoney(safety.dtf_print_cost_cents))}
          ${renderQuoteTotalRow("Total Landed Cost", formatMoney(safety.total_landed_cost_cents))}
          ${renderQuoteTotalRow("Customer Quote", formatMoney(safety.quoted_total_cents))}
          ${renderQuoteTotalRow("Gross Profit", formatMoney(safety.gross_profit_cents))}
          ${renderQuoteTotalRow("Gross Margin", formatBasisPoints(safety.gross_margin_basis_points))}
          ${renderQuoteTotalRow("Target Margin", formatBasisPoints(safety.target_margin_basis_points))}
          ${safety.preferred_margin_basis_points ? renderQuoteTotalRow("Preferred Margin", formatBasisPoints(safety.preferred_margin_basis_points)) : ""}
          ${renderQuoteTotalRow("Minimum Profit / Shirt", formatMoney(safety.minimum_profit_per_shirt_cents))}
          ${safety.preferred_profit_per_shirt_cents ? renderQuoteTotalRow("Preferred Profit / Shirt", formatMoney(safety.preferred_profit_per_shirt_cents)) : ""}
          ${renderQuoteTotalRow("Margin-Based Price", formatMoney(safety.margin_price_per_shirt_cents))}
          ${renderQuoteTotalRow("Profit-Floor Price", formatMoney(safety.profit_price_per_shirt_cents))}
          ${renderQuoteTotalRow("Calculated Blank Cost", formatMoney(totals.blank_cost_cents))}
          ${renderQuoteTotalRow("Calculated Setup Fees", formatMoney(totals.setup_fee_cents))}
          ${renderDtfSourceComparison(safety.dtf_source_comparison)}
          <details class="pricing-debug-details">
            <summary>Rule / Pricing Debug</summary>
            <p class="quote-muted">Reference only. Placement rule costs are not the selected DTF production cost.</p>
            ${renderQuoteTotalRow("Placement Rule Cost Estimate", formatMoney(totals.print_cost_cents))}
            ${placementRows ? `<section class="placement-details"><h3>Placement Rule References</h3>${placementRows}</section>` : ""}
            <pre>${escapeHtml(JSON.stringify(pricingDebug, null, 2))}</pre>
          </details>
        </div>
      </details>
    `
    : "";

  quoteSummaryContent.innerHTML = `
    <section class="customer-price-card">
      <div class="customer-price-heading">
        <span>Base Tier / Starting Point</span>
        <strong>${formatMoney(baseDealSubtotalCents)}</strong>
      </div>
      ${calculationItems.length > 1 ? garmentPricingSections : `
        ${renderQuoteTotalRow("Base Tier Price", formatMoney(baseDealSubtotalCents))}
        ${customerBlankUpgradeTotalCents > 0 ? `<div class="customer-upgrade-breakdown"><h3>Size / Blank Upgrades</h3>${sizeUpgradeRows || renderQuoteTotalRow("Blank Upgrade", `+${formatMoney(customerBlankUpgradeTotalCents)}`)}</div>` : ""}
        ${sleeveAddOnTotalCents > 0 ? renderQuoteTotalRow("Sleeve Add-On", `+${formatMoney(sleeveAddOnTotalCents)}`) : ""}
      `}
      ${calculationItems.length > 1 ? '<p class="style-pricing-note">Style amounts are internal starting points. The protected selling price is calculated across the combined quote.</p>' : ""}
      <div class="final-quote-display">
        <div>
          <span>Final Quote</span>
          <small>Protected customer total</small>
        </div>
        <div class="final-quote-amount">
          <strong>${formatMoney(totals.total_price_cents)}</strong>
          <small>${formatMoney(finalAveragePerShirtCents)} per shirt</small>
        </div>
      </div>
    </section>
    <section class="recommended-price-card margin-${escapeHtml(marginStatus)}">
      <div class="recommended-price-heading">
        <span>Protected Selling Price</span>
        <strong>${formatMoney(safety.recommended_price_per_shirt_cents)} <small>per shirt</small></strong>
      </div>
      <div class="recommended-result-grid">
        <div><span>Protected Total</span><strong>${formatMoney(safety.recommended_total_cents)}</strong></div>
        <div><span>Your Cost</span><strong>${formatMoney(safety.landed_cost_per_shirt_cents)}</strong></div>
        <div><span>Profit Per Shirt</span><strong>${formatMoney(safety.gross_profit_per_shirt_cents)}</strong></div>
        <div><span>Margin</span><strong>${formatBasisPoints(safety.gross_margin_basis_points)}</strong></div>
      </div>
      <div class="recommended-status-row">
        <span>Status</span>
        <strong class="margin-status">${escapeHtml(formatMarginStatus(marginStatus))}</strong>
      </div>
    </section>
    ${warning}
    ${advancedResults}
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
    ? `Quote: ${formatMoney(totals.total_price_cents)} · ${formatMoney(getFinalAveragePerShirtCents(totals))} each`
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
  const savedOnlyBlanks = quoteBlanks.filter(
    (savedBlank) =>
      !blanks.some((blank) => String(blank.id) === String(savedBlank.id))
  );
  quoteBlanks = [...blanks, ...savedOnlyBlanks];

  if (!garmentBlocks?.querySelector(".garment-block")) {
    addGarmentBlock();
    return;
  }

  garmentBlocks.querySelectorAll(".garment-block").forEach((block) => {
    const select = block.querySelector(".garment-blank-select");
    const selectedValue = select?.value || getDefaultBlankId();
    if (select) select.innerHTML = renderBlankOptions(selectedValue);
    renderGarmentSizeInputs(block, getBlockSizeQuantities(block));
  });
}

async function calculateQuote() {
  clearQuoteError();
  const payload = getQuotePayload();
  const missingInputMessage = getMissingQuoteInputMessage(payload);

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
      body: JSON.stringify(payload),
    });

    const calculation = await parseApiResponse(response, "Failed to calculate quote");
    const responseItems = calculation?.items || [];
    const responseQuantity = Number(calculation?.totals?.total_quantity) || 0;

    if (
      responseItems.length !== payload.expected_item_count ||
      responseQuantity !== payload.expected_total_quantity
    ) {
      throw new Error(
        `Quote calculation mismatch: sent ${payload.expected_item_count} styles / ${payload.expected_total_quantity} shirts, but received ${responseItems.length} styles / ${responseQuantity} shirts. Restart the Node/PM2 process and calculate again.`
      );
    }

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
    field.value = value ?? "";
  }
}

function resetQuoteForm() {
  editingQuoteId = null;
  quoteForm?.reset();
  isSleeveSelected = false;
  syncSleeveToggleUi();
  syncPrintTypeUi();
  if (garmentBlocks) garmentBlocks.innerHTML = "";
  addGarmentBlock();
  closeSavePanel();
  lastCalculation = null;
  updateMobileQuoteBar();
  clearQuoteError();
  setBusyState();
}

function ensureBlankOption(item) {
  if (!item?.shirt_blank_id) return;
  if (quoteBlanks.some((blank) => String(blank.id) === String(item.shirt_blank_id))) return;

  quoteBlanks.push({
    id: item.shirt_blank_id,
    brand: "Saved",
    style_number: item.blank_label || `Blank #${item.shirt_blank_id}`,
    name: "",
    base_cost_cents: item.blank_base_cost_cents || 0,
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

    const items = quote.items || [];
    const item = items[0];

    if (!item) {
      throw new Error("Quote has no item to edit");
    }

    editingQuoteId = quote.id;
    items.forEach(ensureBlankOption);
    setFormValue("customer_name", quote.customer_name);
    setFormValue("customer_email", quote.customer_email);
    setFormValue("customer_phone", quote.customer_phone);
    setFormValue("due_date", quote.due_date);
    setFormValue("notes", quote.notes);
    setFormValue("print_type", item.print_type);

    if (Number(quote.total_landed_cost_cents) > 0) {
      setFormValue(
        "shirt_blank_cost",
        items.length === 1
          ? centsToDollarInput(quote.landed_shirt_blank_cost_cents, true)
          : ""
      );
      setFormValue(
        "shirt_shipping",
        centsToDollarInput(quote.shirt_shipping_cents, true)
      );
      const savedDtfSource = quote.dtf_source || "manual_custom";
      const savedDtfCostPerShirtCents = quote.dtf_source
        ? Number(quote.dtf_cost_per_shirt_cents) || 0
        : Math.round(
            (Number(quote.landed_dtf_print_cost_cents) || 0) /
              Math.max(1, Number(quote.total_quantity) || 1)
          );
      setFormValue("dtf_source", savedDtfSource);
      setFormValue(
        "dtf_cost_per_shirt",
        centsToDollarInput(savedDtfCostPerShirtCents, true)
      );
      setFormValue(
        "dtf_shipping",
        centsToDollarInput(quote.dtf_shipping_cents, true)
      );
      setFormValue("misc_cost", centsToDollarInput(quote.misc_cost_cents, true));
      setFormValue(
        "setup_labor_cost",
        centsToDollarInput(quote.setup_labor_cost_cents, true)
      );
      setFormValue("quoted_price_per_shirt", "");
      setFormValue(
        "quoted_total",
        items.length === 1 ? centsToDollarInput(quote.total_price_cents) : ""
      );
    }

    const placements = item.placements || [];
    setFormValue(
      "base_placement",
      placements.find((placement) => placement !== "sleeve") || "full_front"
    );
    isSleeveSelected = placements.includes("sleeve");
    syncSleeveToggleUi();
    syncPrintTypeUi();

    if (garmentBlocks) garmentBlocks.innerHTML = "";
    items.forEach((quoteItem) => addGarmentBlock(quoteItem));
    updateQuantityTotals();
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

function renderSavedPricingSafety(quote) {
  if (Number(quote.total_landed_cost_cents) <= 0) {
    return "";
  }

  const status = String(quote.margin_status || "");
  const currentPricePerShirtCents = getFinalAveragePerShirtCents(quote);
  const isLowMargin =
    currentPricePerShirtCents < Number(quote.recommended_price_per_shirt_cents);

  return `
    ${
      isLowMargin
        ? `
          <section class="pricing-warning" role="alert">
            <h3>Low Margin Warning</h3>
            ${renderQuoteTotalRow("Current Price / Shirt", formatMoney(currentPricePerShirtCents))}
            ${renderQuoteTotalRow("Protected Selling Price / Shirt", formatMoney(quote.recommended_price_per_shirt_cents))}
            ${renderQuoteTotalRow("Current Gross Margin", formatBasisPoints(quote.gross_margin_basis_points))}
            ${renderQuoteTotalRow("Required Gross Margin", formatBasisPoints(quote.target_margin_basis_points))}
            ${renderQuoteTotalRow("Current Gross Profit", formatMoney(quote.profit_cents))}
            ${renderQuoteTotalRow("Recommended Gross Profit", formatMoney(quote.recommended_profit_cents))}
            ${renderQuoteTotalRow("Protected Total Quote", formatMoney(quote.recommended_total_cents))}
          </section>
        `
        : ""
    }
    <section class="pricing-safety-summary margin-${escapeHtml(status)}">
      <div class="pricing-safety-heading">
        <h3>Pricing Safety</h3>
        <span class="margin-status">${escapeHtml(formatMarginStatus(status))}</span>
      </div>
      ${renderQuoteTotalRow("Print Source", DTF_SOURCE_LABELS[quote.dtf_source] || "Not set")}
      ${renderQuoteTotalRow("DTF Cost / Shirt", formatMoney(quote.dtf_cost_per_shirt_cents))}
      ${renderQuoteTotalRow("Total DTF Cost", formatMoney(quote.landed_dtf_print_cost_cents))}
      ${renderQuoteTotalRow("Total Landed Cost", formatMoney(quote.total_landed_cost_cents))}
      ${renderQuoteTotalRow("Cost / Shirt", formatMoney(quote.landed_cost_per_shirt_cents))}
      ${renderQuoteTotalRow("Profit / Shirt", formatMoney(quote.gross_profit_per_shirt_cents))}
      ${renderQuoteTotalRow("Gross Margin", formatBasisPoints(quote.gross_margin_basis_points))}
      ${renderQuoteTotalRow("Protected Selling Price", formatMoney(quote.recommended_price_per_shirt_cents))}
      ${renderQuoteTotalRow("Protected Total", formatMoney(quote.recommended_total_cents))}
      ${renderQuoteTotalRow("Recommended Profit", formatMoney(quote.recommended_profit_cents))}
      ${renderQuoteTotalRow("Recommended Margin", formatBasisPoints(quote.recommended_margin_basis_points))}
    </section>
  `;
}

function renderQuoteDetail(quote) {
  if (!quoteDetail) return;

  const items = quote.items || [];
  const canEdit = quote.status === "draft" && !quote.converted_job_id;
  const finalAveragePerShirtCents = getFinalAveragePerShirtCents(quote);
  const itemSections = items.map((item, index) => {
    const placements = (item.placements || [])
      .map((placement) =>
        String(placement)
          .replaceAll("_", " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase())
      )
      .join(", ");
    const sizes = (item.sizes || [])
      .filter((size) => Number(size.quantity) > 0)
      .map((size) => `${size.size_label}: ${size.quantity}`)
      .join(", ");

    return `
      <article class="quote-detail-item">
        <div class="quote-card-heading">
          <h3>${index + 1}. ${escapeHtml(item.blank_label || "Shirt style")}</h3>
          <span class="quote-count-pill">${escapeHtml(item.total_quantity)} total</span>
        </div>
        ${renderQuoteTotalRow("Color(s)", item.color || "Not set")}
        ${renderQuoteTotalRow("Sizes", sizes || "Not set")}
        ${renderQuoteTotalRow("Print", [item.print_type, placements].filter(Boolean).join(" - ") || "Not set")}
        ${item.style_notes ? `<div class="quote-detail-notes">${escapeHtml(item.style_notes)}</div>` : ""}
      </article>
    `;
  }).join("");

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
    <div class="quote-detail-items">
      ${itemSections || `<p class="quote-muted">No shirt styles saved.</p>`}
    </div>
    <div class="quote-total-row">
      <strong>Total Qty</strong>
      <span>${escapeHtml(quote.total_quantity)}</span>
    </div>
    <div class="quote-total-row">
      <strong>Per Shirt</strong>
      <span>${formatMoney(finalAveragePerShirtCents)}</span>
    </div>
    <div class="quote-total-row">
      <strong>Profit</strong>
      <span>${formatMoney(quote.profit_cents)}</span>
    </div>
    <div class="quote-total-row quote-grand-total">
      <strong>Total Quote</strong>
      <span>${formatMoney(quote.total_price_cents)}</span>
    </div>

    ${renderSavedPricingSafety(quote)}

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
          const finalAveragePerShirtCents = getFinalAveragePerShirtCents(quote);

          return `
          <article class="quote-draft-card">
            <div class="quote-card-heading">
              <h3>#${escapeHtml(quote.id)} ${escapeHtml(quote.customer_name)}</h3>
              <span class="quote-status-pill">${escapeHtml(formatStatus(quote.status))}</span>
            </div>
            <p>${escapeHtml(quote.total_quantity)} shirts - ${formatMoney(quote.total_price_cents)}</p>
            <p>${formatMoney(finalAveragePerShirtCents)} each - Profit ${formatMoney(quote.profit_cents)}</p>
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
    "base_placement",
    "shirt_blank_cost",
    "shirt_shipping",
    "dtf_cost_per_shirt",
    "dtf_shipping",
    "misc_cost",
    "setup_labor_cost",
    "quoted_price_per_shirt",
    "quoted_total",
  ]);

  if (target?.name === "quoted_price_per_shirt" && target.value !== "") {
    setFormValue("quoted_total", "");
  } else if (target?.name === "quoted_total" && target.value !== "") {
    setFormValue("quoted_price_per_shirt", "");
  }

  if (
    pricingFieldNames.has(target?.name) ||
    target?.dataset?.size ||
    target?.closest?.(".garment-block")
  ) {
    invalidateCalculation();
  }
});

addGarmentBtn?.addEventListener("click", () => {
  const blockCount = garmentBlocks?.querySelectorAll(".garment-block").length || 0;
  if (blockCount >= 12) return;
  if (blockCount === 1) {
    setFormValue("shirt_blank_cost", "");
    setFormValue("quoted_total", "");
  }
  addGarmentBlock();
  invalidateCalculation();
  garmentBlocks?.lastElementChild?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
});

garmentBlocks?.addEventListener("click", (event) => {
  const stepButton = event.target.closest("[data-size-step]");

  if (stepButton) {
    const input = stepButton
      .closest(".size-field")
      ?.querySelector("input[data-size]");
    if (!input || input.disabled) return;
    input.value = String(
      Math.max(
        0,
        Math.floor(Number(input.value) || 0) + Number(stepButton.dataset.sizeStep)
      )
    );
    updateQuantityTotals();
    return;
  }

  const removeButton = event.target.closest(".garment-remove-btn");
  if (removeButton) {
    removeButton.closest(".garment-block")?.remove();
    updateGarmentBlockLabels();
    updateQuantityTotals();
  }
});

garmentBlocks?.addEventListener("input", (event) => {
  if (event.target.matches("input[data-size]")) {
    event.target.value = String(
      Math.max(0, Math.floor(Number(event.target.value) || 0))
    );
    updateQuantityTotals();
  }
});

garmentBlocks?.addEventListener("change", (event) => {
  if (event.target.matches(".garment-blank-select")) {
    const block = event.target.closest(".garment-block");
    const quantities = getBlockSizeQuantities(block);
    renderGarmentSizeInputs(block, quantities);
    invalidateCalculation();
  }
});

dtfSourceSelect?.addEventListener("change", async () => {
  const hadCalculation = Boolean(lastCalculation);
  const source = dtfSourceSelect.value;

  if (Object.prototype.hasOwnProperty.call(DTF_SOURCE_DEFAULT_COSTS, source)) {
    dtfCostPerShirtInput.value = DTF_SOURCE_DEFAULT_COSTS[source].toFixed(2);
  } else {
    dtfCostPerShirtInput.value = "";
    dtfCostPerShirtInput.focus({ preventScroll: true });
  }

  invalidateCalculation();

  if (hadCalculation && !getMissingQuoteInputMessage()) {
    try {
      await calculateQuote();
    } catch {
      // Error is shown inline.
    }
  }
});

printTypeSelect?.addEventListener("change", () => {
  syncPrintTypeUi();
  invalidateCalculation();
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

syncSleeveToggleUi();
syncPrintTypeUi();
updateMobileQuoteBar();
setBusyState();
loadBlanks().catch((error) => showQuoteError(error.message));
loadQuotes();
