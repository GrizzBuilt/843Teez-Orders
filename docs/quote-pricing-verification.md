# Quote Pricing Tier Verification

Use this manual check when changing `print_pricing_rules` quantity tiers.

Example tier setup for one placement:

| print_type | placement | min_quantity | max_quantity | print_price_per_shirt_cents |
| --- | --- | ---: | ---: | ---: |
| DTF | full_front | 1 | 23 | 700 |
| DTF | full_front | 24 | NULL | 600 |

Expected behavior:

- A 23-shirt quote using `DTF` + `full_front` uses the `min_quantity = 1` rule.
- A 24-shirt quote using `DTF` + `full_front` uses the `min_quantity = 24` rule.
- Any quantity above 24 keeps using the `min_quantity = 24` rule when `max_quantity` is `NULL`.

The selected rule is visible in the `/api/quotes/calculate` response at:

```text
item.placement_breakdown[0].rule_id
item.placement_breakdown[0].print_price_per_shirt_cents
```
