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
  recommendDtfProduction,
};
