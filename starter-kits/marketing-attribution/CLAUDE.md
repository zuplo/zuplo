# Marketing Attribution Starter Kit

First-party marketing-attribution API. Replaces Dreamdata, Attribution.com, RollWorks. See [../CLAUDE.md](../CLAUDE.md) for the conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Touchpoint` | A single visit/interaction recorded for a visitor. Primary entity. |
| `Visitor` | First-party visitor identity (anon or identified). |
| `Conversion` | A revenue/pipeline event tied to a visitor. |
| `Channel` | A marketing channel with optional period spend. |
| `AttributionModel` | Defines how credit is split across touchpoints. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/touchpoints` | List touchpoints |
| POST | `/touchpoints` | Record a touchpoint |
| GET | `/visitors` | List visitors |
| GET | `/visitors/{id}` | Get a visitor |
| PATCH | `/visitors/{id}` | Identify a visitor |
| GET | `/conversions` | List conversions |
| POST | `/conversions` | Record a conversion |
| GET | `/channels` | List channels |
| GET | `/attribution-models` | List attribution models |
| POST | `/explain-conversion-path` | Orchestrator |
| POST | `/compare-attribution-models` | Orchestrator |
| POST | `/find-underrated-channels` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `explain_conversion_path` — input `{visitorId}`. Returns chronological touchpoints up to the most recent conversion plus per-model attribution. Calls `list_touchpoints`, `list_conversions`, `list_attribution_models`.
- `compare_attribution_models` — input `{dateFrom, dateTo, channelSlugs?}`. For each conversion in the window, computes attribution per model and returns the model x channel matrix.
- `find_underrated_channels` — input `{windowDays?}`. Compares last-touch attribution against linear and position-based; returns channels with high underrated ratio (linear/position score >> last-touch score).

Both MCP layers must agree — the route-level `mcp` annotation and the `/mcp` route's `operations` array.
