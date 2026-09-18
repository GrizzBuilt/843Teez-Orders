# Quote Pricing Tier Verification

Use this manual check when changing `print_pricing_rules` quantity tiers.

Example tier setup for one placement:

| print_type | placement | min_quantity | max_quantity | print_price_per_shirt_cents |
| --- | --- | ---: | ---: | ---: |
| DTF | full_front | 1 | 1 | 2000 |
| DTF | full_front | 2 | 2 | 1750 |
| DTF | full_front | 3 | 3 | 1667 |
| DTF | full_front | 4 | 4 | 1500 |
| DTF | full_front | 5 | 9 | 1400 |
| DTF | full_front | 10 | 24 | 1200 |
| DTF | full_front | 25 | 49 | 1000 |
| DTF | full_front | 50 | 99 | 900 |
| DTF | full_front | 100 | NULL | 800 |

Expected behavior:

- A 1-shirt quote using `DTF` + `full_front` uses the `min_quantity = 1` rule.
- A 2-shirt quote using `DTF` + `full_front` uses the `min_quantity = 2` rule.
- A 3-shirt quote using `DTF` + `full_front` uses the `min_quantity = 3` rule.
- A 4-shirt quote using `DTF` + `full_front` uses the `min_quantity = 4` rule.
- A 5-shirt quote using `DTF` + `full_front` uses the `min_quantity = 5` rule.
- A 10-shirt quote using `DTF` + `full_front` uses the `min_quantity = 10` rule.
- A 25-shirt quote using `DTF` + `full_front` uses the `min_quantity = 25` rule.
- A 50-shirt quote using `DTF` + `full_front` uses the `min_quantity = 50` rule.
- A 100-shirt quote using `DTF` + `full_front` uses the open-ended `min_quantity = 100` rule when `max_quantity` is `NULL`.

The selected rule is visible in the `/api/quotes/calculate` response at:

```text
item.placement_breakdown[0].rule_id
item.placement_breakdown[0].print_price_per_shirt_cents
```

Sell-price behavior:

- `print_price_per_shirt_cents` remains the matched tier price and is preserved
  in the pricing debug response.
- For quantities 1-4, the tier-derived bundle total is the customer quote by
  default: $20, $35, $50, and $60 respectively. The three-shirt rule stores an
  approximate per-shirt value of 1667 cents and rounds its bundle subtotal to
  $50.00.
- The protected recommended price remains active as a comparison. A small
  bundle below that recommendation is allowed and returns a margin warning.
- Size upcharges are added to the recommended total. The
  `shirt_blank_size_costs.extra_cost_cents` column stores actual blank cost for
  the size, not the customer upcharge.
- Blank cost and print cost stay internal-only cost tracking fields.
- Customer sale price tiers are based on the configured base pricing blank,
  default `Port and Co PC43`. If the selected blank costs more than that PC43,
  the difference is added per shirt as `blankUpgradePerShirtCents`. If it costs
  less than PC43, the price is not reduced unless
  `ALLOW_BLANK_PRICE_REDUCTION=1` is configured.
- The $3.00 in-house or $5.50 outsourced DTF allowance is applied once per
  shirt. For multi-location work, the largest placement is covered by that
  allowance and the smaller placement costs are added incrementally. This
  avoids a price spike when a volume order switches to outsourced production.
- Multiple base placements do not blindly multiply the customer sell-price
  tier. If selected placements have different base sell prices, the highest
  matching price is used once and profit protection accounts for the combined
  DTF cost.
- A quote with a $12.00 base tier, PC43 at $2.04, and selected blank at $4.25
  should return `blankUpgradePerShirtCents = 221` and
  `price_per_shirt_cents = 1421` before sleeve.
- Size and blank upgrades are calculated per size line against the PC43 base
  cost of 204 cents. If PC43 2XL actual cost is 318 cents, the customer upgrade
  is 114 cents per shirt. Two 2XL shirts return a combined customer blank
  upgrade of 228 cents and internal blank cost of 636 cents.
- The seeded PC43 actual size costs are per-shirt values: S-XL are 204 cents,
  2XL is 318 cents, and 3XL through 6XL are 419 cents.
- Sleeve is treated as an add-on. When sleeve is selected, it does not drive the
  base sale-price tier. It adds `sleeve_add_on_price_cents * total_quantity` to
  the customer total through `price_per_shirt_cents` and
  `sleeve_add_on_cost_cents * total_quantity` to internal print cost.
- DTF sleeve add-on price is a flat $3.00 per shirt for every quantity. The
  tier-derived baseline for 10 shirts with `full_front` at $12.00 and sleeve is
  $150.00 before size upcharges: `(1200 * 10) + (300 * 10)`. The protected
  recommended quote may be higher.
- The same 10-shirt sleeve quote should return `price_per_shirt_cents = 1500`
  and `pricing_debug.basePricePerShirtCents = 1200`,
  `pricing_debug.sleeveAddOnPricePerShirtCents = 300`.
- Sleeve should always add $3.00 per shirt: 1 shirt at a $20.00 base is $23.00,
  4 shirts at a $15.00 base are $18.00 each, and 10 shirts at a $12.00 base are
  $15.00 each.

## Pricing Safety Verification

Use this case to verify landed-cost protection without changing the underlying
DTF tier calculation:

| Input | Amount |
| --- | ---: |
| Quantity | 10 |
| Shirt blank cost and shipping | $65.60 |
| DTF source | Manual custom cost |
| DTF cost per shirt | $5.88 |
| DTF shipping | $0.00 |
| Misc / packaging | $0.00 |
| Setup / labor | $0.00 |
| Customer price per shirt | $14.75 |

Expected `pricing_safety` values:

| Result | Expected |
| --- | ---: |
| Total landed cost | $124.40 |
| Landed cost per shirt | $12.44 |
| Customer quoted total | $147.50 |
| Gross profit | $23.10 |
| Gross profit per shirt | $2.31 |
| Gross margin | 15.66% |
| Target gross margin | 40% |
| Minimum profit per shirt | $5.00 |
| Margin-based price | $20.74 |
| Profit-floor price | $17.44 |
| Quantity protected-floor price | $19.44 |
| Recommended price | $21.00 |
| Recommended total | $210.00 |
| Recommended gross profit | $85.60 |
| Margin status | Bad / Too Low |

For quantities above four, no manual customer price uses the protected
recommendation as the quote total. For quantities one through four, the bundle
price plus blank/size upgrades remains the customer total. A lower customer
price is allowed, but `low_margin_warning` must be `true`.

## Recommended Price Workflow

The normal quote screen keeps blank, size quantities, print locations, and the
optional manual customer price visible. DTF is the quote builder's production
type. Shipping, packaging, setup/labor, production overrides, manual landed
costs, source comparison, placement rules, and debug data are behind Advanced
or Show Details.

Validation examples for 10 shirts with no size adjustment:

| Blank Cost / Shirt | DTF Source | Estimated Cost / Shirt | Recommended Price | Recommended Total |
| ---: | --- | ---: | ---: | ---: |
| $6.56 | In-house DTF ($3.00) | $9.56 | $17.50 | $175.00 |
| $6.56 | Outsourced DTF ($5.50) | $12.06 | $20.50 | $205.00 |

## DTF Source Comparison Verification

Use 10 shirts, $65.60 in shirt blank cost with shipping, a $14.75 customer
price per shirt, and no misc or setup/labor cost.

Expected source comparison:

| Result | In-house DTF | Outsourced DTF |
| --- | ---: | ---: |
| DTF cost per shirt | $3.00 | $5.50 |
| Total DTF cost | $30.00 | $55.00 |
| Total landed cost | $95.60 | $120.60 |
| Landed cost per shirt | $9.56 | $12.06 |
| Gross profit | $51.90 | $26.90 |
| Gross profit per shirt | $5.19 | $2.69 |
| Gross margin | 35.19% | 18.24% |
| Recommended price per shirt | $17.50 | $20.50 |
| Recommended total | $175.00 | $205.00 |

Changing the selected source must update the actual
`pricing_safety.dtf_print_cost_cents`, not only the comparison values. A custom
per-shirt override must take precedence over the selected source default.

## Automatic DTF Production Verification

The quote builder defaults to `auto_dtf` and resolves that choice to the actual
source saved with the quote. The normal screen shows the recommendation and a
plain-language reason. Manual source selection remains available under
Advanced.

Expected automatic recommendations:

| Quantity / placement | Recommendation |
| --- | --- |
| 1-9, any supported placement combination | In-house DTF |
| 10-24, one left-chest placement | In-house DTF |
| 10-24, a full front or full back | Outsourced DTF |
| 10-24, two or more locations | Outsourced DTF |
| 25+, any supported placement combination | Outsourced DTF |
| Rush / no time to order transfers | In-house DTF |

For 40 shirts with left chest and full back selected, confirm that the response
contains:

```text
pricing_safety.dtf_source = outsourced_dtf
pricing_safety.dtf_source_mode = auto_dtf
pricing_safety.dtf_recommended_source = outsourced_dtf
```

Selecting a manual production override should preserve the app recommendation
in the response and set `dtf_recommendation_overridden` when they differ.

Growth-protection check for 50 outsourced-DTF shirts with $386.12 landed cost:

- Landed cost per shirt: $7.72.
- 40% margin price: about $12.87.
- General minimum-profit price: about $12.72.
- 50-99 quantity protected-floor price: about $13.22.
- Rounded recommended price: $13.50 per shirt, or $675.00 total.
- Gross profit: $288.88; gross margin: about 42.8%; status: Healthy.

In-house DTF protection becomes quantity-sensitive so the volume tiers produce
a meaningful customer discount without removing the per-shirt profit floor:

| Quantity | Target margin | Minimum profit / shirt |
| ---: | ---: | ---: |
| 1-24 | 45% | $5.00 |
| 25-49 | 45% | $6.00 |
| 50-99 | 42% | $5.50 |
| 100+ | 40% | $5.00 |

For a Gildan 64000 Softstyle with a $4.25 blank cost and $3.00 in-house DTF
cost, verify the protected recommendation is $13.50 each at 25 shirts, $13.00
each at 50 shirts, and $12.50 each at 100 shirts. These recommendations leave
at least $5.00 per shirt above the tracked blank and DTF costs.

Status thresholds are Bad / Too Low below 30%, Weak from 30-34.9%, Caution /
Tight from 35-39.9%, Healthy from 40-44.9%, Strong from 45-49.9%, and
Excellent at 50% or above.

## API Verification Fields

The `/api/quotes/calculate` response preserves the tier and add-on debug fields
and exposes pricing-safety values with these verification names:

```text
item.placement_breakdown[0].rule_id
item.placement_breakdown[0].print_price_per_shirt_cents
pricing_debug.basePricePerShirtCents
pricing_debug.sleeveAddOnPricePerShirtCents
pricing_debug.blankUpgradePerShirtCents
pricing_debug.sizeUpchargeTotalCents
pricing_safety.total_landed_cost_cents
pricing_safety.landed_cost_per_shirt_cents
pricing_safety.customer_quoted_total_cents
pricing_safety.gross_profit_cents
pricing_safety.gross_profit_per_shirt_cents
pricing_safety.gross_margin_percent
pricing_safety.target_gross_margin_percent
pricing_safety.minimum_profit_per_shirt_cents
pricing_safety.margin_based_price_cents
pricing_safety.profit_floor_price_cents
pricing_safety.recommended_price_cents
pricing_safety.recommended_total_cents
pricing_safety.recommended_gross_profit_cents
pricing_safety.margin_status
pricing_safety.low_margin_warning
pricing_safety.dtf_source
pricing_safety.dtf_print_cost_cents
pricing_safety.dtf_source_comparison
```

The older internal names remain available so saved quotes and the current quote
UI do not need a breaking response migration.

## Multiple Shirt Style Verification

The quote API accepts `items` while continuing to accept the legacy single
`item` payload. The pricing tier uses the combined garment quantity, while
blank costs, size upgrades, DTF costs, and subtotals are calculated for each
style and then combined.

Manual check:

1. Add a PC43 group with M: 8, L: 8, XL: 8, and 2XL: 8.
2. Add a second blank with M: 6, L: 6, and XL: 6.
3. Calculate and confirm both styles use the 50-shirt pricing tier while each
   retains its own blank costs, size adjustments, and subtotal.
4. Confirm the combined quantity is 50 and the quote total equals the sum of
   both style subtotals.
5. Save and reopen the draft. Both style groups, colors, notes, and size
   quantities must be restored.
6. Open Customer View and confirm both styles are listed under Shirt Styles &
   Sizes with Total Garments: 50.
7. Confirm total DTF cost equals 50 times the selected DTF cost per shirt.
