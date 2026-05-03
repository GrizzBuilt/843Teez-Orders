# Quote Pricing Tier Verification

Use this manual check when changing `print_pricing_rules` quantity tiers.

Example tier setup for one placement:

| print_type | placement | min_quantity | max_quantity | print_price_per_shirt_cents |
| --- | --- | ---: | ---: | ---: |
| DTF | full_front | 1 | 1 | 2000 |
| DTF | full_front | 2 | 2 | 1750 |
| DTF | full_front | 3 | 3 | 1600 |
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

- `print_price_per_shirt_cents` is the final customer sell price per shirt.
- `total_price_cents` equals `price_per_shirt_cents * total_quantity`, plus
  any size upcharges from `shirt_blank_size_costs.extra_cost_cents`.
- Blank cost and print cost stay internal-only cost tracking fields.
- Customer sale price tiers are based on the configured base pricing blank,
  default `Port and Co PC43`. If the selected blank costs more than that PC43,
  the difference is added per shirt as `blankUpgradePerShirtCents`. If it costs
  less than PC43, the price is not reduced unless
  `ALLOW_BLANK_PRICE_REDUCTION=1` is configured.
- Multiple base placements add internal print/setup cost, but do not multiply
  the customer sell price. If selected base placements have different sell
  prices, the highest matching per-shirt sell price is used once for the order.
- A quote with a $12.00 base tier, PC43 at $3.00, and selected blank at $4.25
  should return `blankUpgradePerShirtCents = 125` and
  `price_per_shirt_cents = 1325` before sleeve.
- A 10-shirt quote at $12.00 each with two 2XL shirts and a $2.00 2XL upcharge
  should total $124.00: `(1200 * 10) + (200 * 2)`.
- Sleeve is treated as an add-on. When sleeve is selected, it does not drive the
  base sale-price tier. It adds `sleeve_add_on_price_cents * total_quantity` to
  the customer total through `price_per_shirt_cents` and
  `sleeve_add_on_cost_cents * total_quantity` to internal print cost.
- DTF sleeve add-on price is a flat $3.00 per shirt for every quantity. A
  10-shirt quote with `full_front` at $12.00 and sleeve selected should total
  $150.00 before size upcharges:
  `(1200 * 10) + (300 * 10)`.
- The same 10-shirt sleeve quote should return `price_per_shirt_cents = 1500`
  and `pricing_debug.basePricePerShirtCents = 1200`,
  `pricing_debug.sleeveAddOnPricePerShirtCents = 300`.
- Sleeve should always add $3.00 per shirt: 1 shirt at a $20.00 base is $23.00,
  4 shirts at a $15.00 base are $18.00 each, and 10 shirts at a $12.00 base are
  $15.00 each.
