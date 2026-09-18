const LARGE_DTF_PLACEMENTS = new Set(["full_front", "full_back"]);

function normalizeDtfPlacements(placements) {
  return [
    ...new Set(
      (Array.isArray(placements) ? placements : [])
        .map((placement) => String(placement || "").trim())
        .filter(Boolean)
    ),
  ];
}

function calculateDtfLocationCost({
  quantity,
  baseAllowancePerShirtCents,
  placementCostsPerShirtCents = [],
}) {
  const normalizedQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  const normalizedBaseAllowanceCents = Math.max(
    0,
    Math.round(Number(baseAllowancePerShirtCents) || 0)
  );
  const normalizedPlacementCosts = (
    Array.isArray(placementCostsPerShirtCents)
      ? placementCostsPerShirtCents
      : []
  ).map((cost) => Math.max(0, Math.round(Number(cost) || 0)));
  const locationCount = Math.max(1, normalizedPlacementCosts.length);
  const includedLocationCostCents = normalizedPlacementCosts.length
    ? Math.max(...normalizedPlacementCosts)
    : 0;
  const additionalLocationCostPerShirtCents = Math.max(
    0,
    normalizedPlacementCosts.reduce((sum, cost) => sum + cost, 0) -
      includedLocationCostCents
  );
  const costPerShirtCents =
    normalizedBaseAllowanceCents + additionalLocationCostPerShirtCents;

  return {
    location_count: locationCount,
    base_allowance_per_shirt_cents: normalizedBaseAllowanceCents,
    additional_location_cost_per_shirt_cents:
      additionalLocationCostPerShirtCents,
    cost_per_shirt_cents: costPerShirtCents,
    total_cost_cents: costPerShirtCents * normalizedQuantity,
  };
}

function recommendDtfProduction({ quantity, placements, rush = false }) {
  const totalQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  const normalizedPlacements = normalizeDtfPlacements(placements);
  const hasLargePlacement = normalizedPlacements.some((placement) =>
    LARGE_DTF_PLACEMENTS.has(placement)
  );
  const hasMultiplePlacements = normalizedPlacements.length >= 2;

  if (rush) {
    return {
      source: "in_house_dtf",
      label: "In-house DTF",
      reason: "The deadline does not leave time to order outsourced transfers.",
    };
  }

  if (totalQuantity >= 25) {
    return {
      source: "outsourced_dtf",
      label: "Outsourced DTF",
      reason:
        "At 25 or more shirts, outsourcing protects production time and keeps the InkSonic available for smaller jobs.",
    };
  }

  if (totalQuantity >= 10 && (hasLargePlacement || hasMultiplePlacements)) {
    return {
      source: "outsourced_dtf",
      label: "Outsourced DTF",
      reason:
        "This mid-size job has enough large or multi-location transfer work to make outsourcing the cleaner workflow.",
    };
  }

  if (totalQuantity >= 10) {
    return {
      source: "in_house_dtf",
      label: "In-house DTF",
      reason:
        "A single small placement is still practical to gang and print on the InkSonic.",
    };
  }

  return {
    source: "in_house_dtf",
    label: "In-house DTF",
    reason: "Small orders stay fastest and simplest on the InkSonic.",
  };
}

module.exports = {
  calculateDtfLocationCost,
  recommendDtfProduction,
};
