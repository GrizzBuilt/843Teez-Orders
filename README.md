# 843Teez-Orders
843 Teez Order Tracking MVP

## Local Routes

- `/` - production order tracker
- `/quotes` - draft quote builder and quote management
- `/pricing` - quote pricing admin for shirt blanks, size upcharges, and print rules
- `/quote/:id` - customer-facing printable quote

## Quote Workflow

1. Manage blank and print pricing at `/pricing`.
2. Build and save draft quotes at `/quotes`.
3. Open the customer view from a saved quote to print or share the quote.
4. Convert an approved quote to an order from `/quotes`.

Saved quotes keep their pricing snapshot. Later pricing changes affect new quotes, not existing saved quotes.
