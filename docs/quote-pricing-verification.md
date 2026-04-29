# Quote Pricing Tier Verification

Use this manual check when changing `print_pricing_rules` quantity tiers.

Example tier setup for one placement:

| print_type | placement | min_quantity | max_quantity | print_price_per_shirt_cents |
| --- | --- | ---: | ---: | ---: |
| DTF | full_front | 1 | 4 | 2000 |
| DTF | full_front | 5 | 9 | 1700 |
| DTF | full_front | 10 | 24 | 1500 |
| DTF | full_front | 25 | 49 | 1200 |
| DTF | full_front | 100 | NULL | set actual 100+ price |

Add a separate 50-99 row if that quantity range should be quoted. Without it,
quotes from 50 through 99 will correctly fail with no matching rule.

Expected behavior:

- A 4-shirt quote using `DTF` + `full_front` uses the `min_quantity = 1` rule.
- A 5-shirt quote using `DTF` + `full_front` uses the `min_quantity = 5` rule.
- A 10-shirt quote using `DTF` + `full_front` uses the `min_quantity = 10` rule.
- A 25-shirt quote using `DTF` + `full_front` uses the `min_quantity = 25` rule.
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
- Multiple base placements add internal print/setup cost, but do not multiply
  the customer sell price. If selected base placements have different sell
  prices, the highest matching per-shirt sell price is used once for the order.
- A 10-shirt quote at $15.00 each with two 2XL shirts and a $2.00 2XL upcharge
  should total $154.00: `(1500 * 10) + (200 * 2)`.
- Sleeve is treated as an add-on. When sleeve is selected, it does not drive the
  base sale-price tier. It adds `sleeve_add_on_price_cents * total_quantity` to
  the customer total through `price_per_shirt_cents` and
  `sleeve_add_on_cost_cents * total_quantity` to internal print cost.
- DTF sleeve add-on price is a flat $3.00 per shirt for every quantity. A
  10-shirt quote with `full_front` at $15.00 and sleeve selected should total
  $180.00 before size upcharges:
  `(1500 * 10) + (300 * 10)`.
- The same 10-shirt sleeve quote should return `price_per_shirt_cents = 1800`
  and `pricing_debug.basePricePerShirtCents = 1500`,
  `pricing_debug.sleeveAddOnPricePerShirtCents = 300`.
- Sleeve should always add $3.00 per shirt: 1 shirt at a $20.00 base is $23.00,
  4 shirts at a $20.00 base are $23.00 each, and 10 shirts at a $15.00 base are
  $18.00 each.
