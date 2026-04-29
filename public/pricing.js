/**
 * File: public/pricing.js
 * Project: 843Teez Orders
 * Purpose: Frontend logic for quote pricing admin
 */

const PRICING_SIZES = ["YS", "YM", "YL", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];

const PLACEMENT_LABELS = {
  left_chest: "Left Chest",
  full_front: "Full Front",
  full_back: "Full Back",
  sleeve: "Sleeve",
};

const blankForm = document.getElementById("blank-form");
const blankList = document.getElementById("blank-list");
const blankSizeCosts = document.getElementById("blank-size-costs");
const blankError = document.getElementById("blank-error");
const blankResetBtn = document.getElementById("blank-reset-btn");
const blankSaveBtn = document.getElementById("blank-save-btn");

const ruleForm = document.getElementById("rule-form");
const ruleList = document.getElementById("rule-list");
const ruleError = document.getElementById("rule-error");
const ruleResetBtn = document.getElementById("rule-reset-btn");
const ruleSaveBtn = document.getElementById("rule-save-btn");

let blanks = [];
let printRules = [];
let isSavingBlank = false;
let isSavingRule = false;

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

function centsToInput(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function inputToCents(value) {
  const dollars = Number(value);
  return Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0;
}

function showError(element, message) {
  if (!element) return;

  element.textContent = message;
  element.hidden = false;
}

function clearError(element) {
  if (!element) return;

  element.textContent = "";
  element.hidden = true;
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

function renderSizeCostInputs() {
  if (!blankSizeCosts) return;

  blankSizeCosts.innerHTML = PRICING_SIZES.map(
    (size) => `
      <label class="size-field">
        <span>${escapeHtml(size)}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          value="0.00"
          data-size-cost="${escapeHtml(size)}"
          aria-label="${escapeHtml(size)} upcharge"
        />
      </label>
    `
  ).join("");
}

function setBlankBusyState() {
  if (blankSaveBtn) {
    blankSaveBtn.disabled = isSavingBlank;
    blankSaveBtn.textContent = isSavingBlank ? "Saving..." : "Save Blank";
  }
}

function setRuleBusyState() {
  if (ruleSaveBtn) {
    ruleSaveBtn.disabled = isSavingRule;
    ruleSaveBtn.textContent = isSavingRule ? "Saving..." : "Save Rule";
  }
}

function resetBlankForm() {
  blankForm?.reset();
  document.getElementById("blank_id").value = "";
  document.getElementById("blank_active").checked = true;

  blankSizeCosts?.querySelectorAll("input[data-size-cost]").forEach((input) => {
    input.value = "0.00";
  });

  clearError(blankError);
}

function resetRuleForm() {
  ruleForm?.reset();
  document.getElementById("rule_id").value = "";
  document.getElementById("rule_min_quantity").value = "1";
  document.getElementById("rule_max_quantity").value = "";
  document.getElementById("rule_sleeve_add_on_price").value = "0.00";
  document.getElementById("rule_sleeve_add_on_cost").value = "0.00";
  document.getElementById("rule_active").checked = true;
  clearError(ruleError);
}

function getBlankPayload() {
  const formData = new FormData(blankForm);
  const sizeCosts = {};

  blankSizeCosts?.querySelectorAll("input[data-size-cost]").forEach((input) => {
    sizeCosts[input.dataset.sizeCost] = inputToCents(input.value);
  });

  return {
    brand: String(formData.get("brand") || "").trim(),
    style_number: String(formData.get("style_number") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    base_cost_cents: inputToCents(formData.get("base_cost")),
    active: document.getElementById("blank_active").checked,
    size_costs: sizeCosts,
  };
}

function getRulePayload() {
  const formData = new FormData(ruleForm);
  const maxQuantityValue = String(formData.get("max_quantity") || "").trim();

  return {
    print_type: String(formData.get("print_type") || "").trim(),
    placement: String(formData.get("placement") || "").trim(),
    min_quantity: Math.max(1, Math.floor(Number(formData.get("min_quantity")) || 1)),
    max_quantity: maxQuantityValue
      ? Math.max(1, Math.floor(Number(maxQuantityValue) || 1))
      : null,
    setup_fee_cents: inputToCents(formData.get("setup_fee")),
    print_cost_per_shirt_cents: inputToCents(formData.get("print_cost")),
    print_price_per_shirt_cents: inputToCents(formData.get("print_price")),
    sleeve_add_on_price_cents: inputToCents(formData.get("sleeve_add_on_price")),
    sleeve_add_on_cost_cents: inputToCents(formData.get("sleeve_add_on_cost")),
    active: document.getElementById("rule_active").checked,
  };
}

function validateBlankPayload(payload) {
  if (!payload.brand || !payload.style_number || !payload.name) {
    throw new Error("Brand, style, and name are required");
  }
}

function validateRulePayload(payload) {
  if (!payload.print_type) {
    throw new Error("Print type is required");
  }

  if (!payload.placement) {
    throw new Error("Placement is required");
  }

  if (payload.max_quantity !== null && payload.max_quantity < payload.min_quantity) {
    throw new Error("Max quantity must be greater than or equal to min quantity");
  }
}

function editBlank(blankId) {
  const blank = blanks.find((entry) => Number(entry.id) === Number(blankId));

  if (!blank) return;

  document.getElementById("blank_id").value = blank.id;
  document.getElementById("blank_brand").value = blank.brand || "";
  document.getElementById("blank_style_number").value = blank.style_number || "";
  document.getElementById("blank_name").value = blank.name || "";
  document.getElementById("blank_description").value = blank.description || "";
  document.getElementById("blank_base_cost").value = centsToInput(blank.base_cost_cents);
  document.getElementById("blank_active").checked = Number(blank.active) === 1;

  blankSizeCosts?.querySelectorAll("input[data-size-cost]").forEach((input) => {
    input.value = centsToInput(blank.size_costs?.[input.dataset.sizeCost] || 0);
  });

  clearError(blankError);
  blankForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function editRule(ruleId) {
  const rule = printRules.find((entry) => Number(entry.id) === Number(ruleId));

  if (!rule) return;

  document.getElementById("rule_id").value = rule.id;
  document.getElementById("rule_print_type").value = rule.print_type || "";
  document.getElementById("rule_placement").value = rule.placement || "";
  document.getElementById("rule_min_quantity").value = rule.min_quantity || 1;
  document.getElementById("rule_max_quantity").value = rule.max_quantity ?? "";
  document.getElementById("rule_setup_fee").value = centsToInput(rule.setup_fee_cents);
  document.getElementById("rule_print_cost").value = centsToInput(rule.print_cost_per_shirt_cents);
  document.getElementById("rule_print_price").value = centsToInput(rule.print_price_per_shirt_cents);
  document.getElementById("rule_sleeve_add_on_price").value = centsToInput(
    rule.sleeve_add_on_price_cents
  );
  document.getElementById("rule_sleeve_add_on_cost").value = centsToInput(
    rule.sleeve_add_on_cost_cents
  );
  document.getElementById("rule_active").checked = Number(rule.active) === 1;

  clearError(ruleError);
  ruleForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderBlanks() {
  if (!blankList) return;

  if (!blanks.length) {
    blankList.innerHTML = `<p class="quote-muted">No shirt blanks yet.</p>`;
    return;
  }

  blankList.innerHTML = blanks
    .map((blank) => {
      const isActive = Number(blank.active) === 1;
      const sizeSummary = PRICING_SIZES.filter(
        (size) => Number(blank.size_costs?.[size]) > 0
      )
        .map((size) => `${size} ${formatMoney(blank.size_costs[size])}`)
        .join(" - ");

      return `
        <article class="pricing-card">
          <div class="pricing-card-heading">
            <div>
              <h3>${escapeHtml(blank.brand)} ${escapeHtml(blank.style_number)}</h3>
              <p>${escapeHtml(blank.name)}</p>
            </div>
            <button
              type="button"
              class="pricing-pill pricing-active-toggle ${isActive ? "" : "inactive"}"
              data-blank-id="${escapeHtml(blank.id)}"
              aria-pressed="${isActive ? "true" : "false"}"
              title="${isActive ? "Deactivate blank" : "Activate blank"}"
            >
              ${isActive ? "Active" : "Inactive"}
            </button>
          </div>
          <p>Base cost ${formatMoney(blank.base_cost_cents)}</p>
          <p>${escapeHtml(sizeSummary || "No size upcharges")}</p>
          <div class="pricing-card-actions">
            <button
              type="button"
              class="secondary-btn blank-edit-btn"
              data-blank-id="${escapeHtml(blank.id)}"
            >
              Edit
            </button>
            <button
              type="button"
              class="secondary-btn pricing-delete-btn blank-delete-btn"
              data-blank-id="${escapeHtml(blank.id)}"
            >
              Delete
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  blankList.querySelectorAll(".blank-edit-btn").forEach((button) => {
    button.addEventListener("click", () => editBlank(button.dataset.blankId));
  });

  blankList.querySelectorAll(".blank-delete-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteBlank(button.dataset.blankId);
    });
  });

  blankList.querySelectorAll(".pricing-active-toggle[data-blank-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleBlankActive(button.dataset.blankId);
    });
  });
}

function renderRules() {
  if (!ruleList) return;

  if (!printRules.length) {
    ruleList.innerHTML = `<p class="quote-muted">No print rules yet.</p>`;
    return;
  }

  ruleList.innerHTML = printRules
    .map(
      (rule) => {
        const isActive = Number(rule.active) === 1;
        const quantityRange =
          rule.max_quantity == null
            ? `${escapeHtml(rule.min_quantity)}+ shirts`
            : `${escapeHtml(rule.min_quantity)} to ${escapeHtml(rule.max_quantity)} shirts`;

        return `
        <article class="pricing-card">
          <div class="pricing-card-heading">
            <div>
              <h3>${escapeHtml(rule.print_type)} - ${escapeHtml(PLACEMENT_LABELS[rule.placement] || rule.placement)}</h3>
              <p>${quantityRange}</p>
            </div>
            <button
              type="button"
              class="pricing-pill pricing-active-toggle ${isActive ? "" : "inactive"}"
              data-rule-id="${escapeHtml(rule.id)}"
              aria-pressed="${isActive ? "true" : "false"}"
              title="${isActive ? "Deactivate rule" : "Activate rule"}"
            >
              ${isActive ? "Active" : "Inactive"}
            </button>
          </div>
          <p>Setup ${formatMoney(rule.setup_fee_cents)}</p>
          <p>Cost ${formatMoney(rule.print_cost_per_shirt_cents)} / shirt - Price ${formatMoney(rule.print_price_per_shirt_cents)} / shirt</p>
          <p>Sleeve add-on ${formatMoney(rule.sleeve_add_on_price_cents)} price - ${formatMoney(rule.sleeve_add_on_cost_cents)} cost / shirt</p>
          <div class="pricing-card-actions">
            <button
              type="button"
              class="secondary-btn rule-edit-btn"
              data-rule-id="${escapeHtml(rule.id)}"
            >
              Edit
            </button>
            <button
              type="button"
              class="secondary-btn pricing-delete-btn rule-delete-btn"
              data-rule-id="${escapeHtml(rule.id)}"
            >
              Delete
            </button>
          </div>
        </article>
      `;
      }
    )
    .join("");

  ruleList.querySelectorAll(".rule-edit-btn").forEach((button) => {
    button.addEventListener("click", () => editRule(button.dataset.ruleId));
  });

  ruleList.querySelectorAll(".rule-delete-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteRule(button.dataset.ruleId);
    });
  });

  ruleList.querySelectorAll(".pricing-active-toggle[data-rule-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleRuleActive(button.dataset.ruleId);
    });
  });
}

async function loadBlanks() {
  const response = await fetch("/api/pricing/shirt-blanks");
  blanks = await parseApiResponse(response, "Failed to load shirt blanks");
  renderBlanks();
}

async function loadRules() {
  const response = await fetch("/api/pricing/print-rules");
  printRules = await parseApiResponse(response, "Failed to load print rules");
  renderRules();
}

async function saveBlank() {
  clearError(blankError);
  isSavingBlank = true;
  setBlankBusyState();

  try {
    const blankId = document.getElementById("blank_id").value;
    const payload = getBlankPayload();

    validateBlankPayload(payload);

    const response = await fetch(
      blankId ? `/api/pricing/shirt-blanks/${blankId}` : "/api/pricing/shirt-blanks",
      {
        method: blankId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    await parseApiResponse(response, "Failed to save shirt blank");
    resetBlankForm();
    await loadBlanks();
  } catch (error) {
    showError(blankError, error.message);
  } finally {
    isSavingBlank = false;
    setBlankBusyState();
  }
}

async function deleteBlank(blankId) {
  const blank = blanks.find((entry) => Number(entry.id) === Number(blankId));

  if (!blank) return;

  clearError(blankError);

  const label = `${blank.brand} ${blank.style_number}`;
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/pricing/shirt-blanks/${blankId}`, {
      method: "DELETE",
    });

    await parseApiResponse(response, "Failed to delete shirt blank");
    blanks = blanks.filter((entry) => Number(entry.id) !== Number(blankId));
    renderBlanks();
    resetBlankForm();
    await loadBlanks();
  } catch (error) {
    showError(blankError, error.message);
    window.alert(error.message);
  }
}

async function toggleBlankActive(blankId) {
  const blank = blanks.find((entry) => Number(entry.id) === Number(blankId));

  if (!blank) return;

  clearError(blankError);

  const nextActive = Number(blank.active) === 1 ? 0 : 1;

  try {
    const response = await fetch(`/api/pricing/shirt-blanks/${blankId}/active`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: nextActive }),
    });

    await parseApiResponse(response, "Failed to update shirt blank active state");
    blank.active = nextActive;
    renderBlanks();
  } catch (error) {
    showError(blankError, error.message);
    window.alert(error.message);
  }
}

async function saveRule() {
  clearError(ruleError);
  isSavingRule = true;
  setRuleBusyState();

  try {
    const ruleId = document.getElementById("rule_id").value;
    const payload = getRulePayload();

    validateRulePayload(payload);

    const response = await fetch(
      ruleId ? `/api/pricing/print-rules/${ruleId}` : "/api/pricing/print-rules",
      {
        method: ruleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    await parseApiResponse(response, "Failed to save print rule");
    resetRuleForm();
    await loadRules();
  } catch (error) {
    showError(ruleError, error.message);
  } finally {
    isSavingRule = false;
    setRuleBusyState();
  }
}

async function deleteRule(ruleId) {
  const rule = printRules.find((entry) => Number(entry.id) === Number(ruleId));

  if (!rule) return;

  clearError(ruleError);

  const label = `${rule.print_type} ${PLACEMENT_LABELS[rule.placement] || rule.placement}`;
  if (!window.confirm(`Delete ${label} pricing rule? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/pricing/print-rules/${ruleId}`, {
      method: "DELETE",
    });

    await parseApiResponse(response, "Failed to delete print rule");
    printRules = printRules.filter((entry) => Number(entry.id) !== Number(ruleId));
    renderRules();
    resetRuleForm();
    await loadRules();
  } catch (error) {
    showError(ruleError, error.message);
    window.alert(error.message);
  }
}

async function toggleRuleActive(ruleId) {
  const rule = printRules.find((entry) => Number(entry.id) === Number(ruleId));

  if (!rule) return;

  clearError(ruleError);

  const nextActive = Number(rule.active) === 1 ? 0 : 1;

  try {
    const response = await fetch(`/api/pricing/print-rules/${ruleId}/active`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: nextActive }),
    });

    await parseApiResponse(response, "Failed to update print rule active state");
    rule.active = nextActive;
    renderRules();
  } catch (error) {
    showError(ruleError, error.message);
    window.alert(error.message);
  }
}

blankForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveBlank();
});

ruleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveRule();
});

blankResetBtn?.addEventListener("click", resetBlankForm);
ruleResetBtn?.addEventListener("click", resetRuleForm);

renderSizeCostInputs();
resetBlankForm();
resetRuleForm();
setBlankBusyState();
setRuleBusyState();
loadBlanks().catch((error) => showError(blankError, error.message));
loadRules().catch((error) => showError(ruleError, error.message));
