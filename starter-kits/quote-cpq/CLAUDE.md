# Quote / CPQ Starter Kit

Headless API for B2B quote and CPQ workflows. Replaces Salesforce CPQ, DealHub, PandaDoc CPQ. See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Quote` | The parent CPQ document — rolls up line totals, tracks lifecycle. |
| `LineItem` | A single product line inside a quote. |
| `Product` | Catalog entry with list price and recurring interval. |
| `PricingRule` | Conditional discount rule applied during quote build. |
| `Discount` | A manual discount applied to a quote with audit trail. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/quotes` | List quotes |
| POST | `/quotes` | Create draft quote |
| GET | `/quotes/{id}` | Get quote |
| POST | `/quotes/{id}/line-items` | Add line item |
| DELETE | `/quotes/{id}/line-items/{lineId}` | Remove line item (destructive) |
| POST | `/quotes/{id}/discounts` | Apply discount |
| POST | `/quotes/{id}/send` | Send quote |
| POST | `/quotes/{id}/accept` | Accept quote |
| GET | `/products` | List products |
| GET | `/pricing-rules` | List pricing rules |
| POST | `/build-quote-from-requirements` | Orchestrator |
| POST | `/route-for-discount-approval` | Orchestrator |
| POST | `/explain-pricing` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `build_quote_from_requirements` — creates a quote, adds lines for `productIds[]`/`quantities[]`, evaluates pricing rules per product (matching segment + min quantity), applies the best per-line discount, returns `{ quote, lineItems, rulesApplied }`.
- `route_for_discount_approval` — computes effective discount % from a quote and decides whether deal-desk approval is required (default threshold 20%).
- `explain_pricing` — produces a list-price → discounts → final breakdown for the LLM to narrate.

Both MCP layers must agree — the route-level `mcp` annotation and the `/mcp` route's `operations` array.
