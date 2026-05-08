# Marketing Attribution API

A first-party marketing attribution API that ingests touchpoints from your site + Meta Lead Ads + Google Ads conversions, lands them in ClickHouse, and answers cross-channel attribution questions through MCP tools that run real SQL — not toy stubs.

Replaces: Dreamdata, Attribution.com, RollWorks, Wicked Reports. Or sit it next to your warehouse as the multi-tenant ingest + serving layer.

## Wires up

**ClickHouse** is the analytics store. Last-touch and linear attribution are computed in pure SQL via `argMax` and a window over `(conversion_id, valueCents)` joined to all prior touchpoints — billions of touches stay fast. **Meta Ads** is wired both ways: an inbound `/webhooks/meta-ads-leadgen` handler accepts Lead Ad signups (verifies `x-hub-signature-256`, fetches the lead from the Graph API, lands a Visitor + Touchpoint + Conversion), and the `find_underrated_channels` orchestrator pulls campaign spend from `/insights` so you can compute ROAS gaps. **Google Ads** matches: an inbound `/webhooks/google-ads-conversion` handler accepts conversions (with optional `?upload=true` to bounce the conversion back via `uploadClickConversions` for Smart Bidding), and `find_underrated_channels` pulls campaign spend via `searchStream`.

## Architecture at a glance

```
Browser   ──▶ Zuplo Gateway ──▶ POST /touchpoints       ──▶ ClickHouse touchpoints
Browser   ──▶                   POST /conversions        ──▶ ClickHouse conversions
Meta Ads  ──▶                   POST /webhooks/meta-ads-leadgen
                                  ├─ verify x-hub-signature-256
                                  ├─ Graph API GET /<lead_id>
                                  └─ upsert Visitor + Touchpoint + Conversion
Google    ──▶                   POST /webhooks/google-ads-conversion
                                  ├─ verify Bearer token
                                  ├─ store Touchpoint(sessionId=gclid) + Conversion
                                  └─ optional: uploadClickConversions back to Google

Agent     ──▶                   POST /find-underrated-channels
                                  ├─ ClickHouse last-touch + linear by channel
                                  ├─ Meta /insights spend (social channel)
                                  └─ Google searchStream spend (paid_search channel)

Agent     ──▶                   POST /explain-conversion-path
                                  └─ ClickHouse conversion + path SQL
```

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/marketing-attribution
cd starter-kits/marketing-attribution
cp env.example .env
npm install
npm run dev
# Gateway boots at http://localhost:9000
```

Connect an MCP inspector:

```bash
npx @modelcontextprotocol/inspector
# Point it at http://localhost:9000/mcp
```

## Choosing a database

| Adapter | Status |
|---|---|
| `clickhouse` | **Recommended** for production touchpoint volume. SQL-native attribution. |
| `in-memory` | Default — boots without any credentials. Use for tests. |
| `supabase` | Supported. Fine up to ~10M touchpoints. |
| `firestore` | Supported. |
| `neon` | Supported. Postgres-backed. |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`.

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER` + the matching adapter creds:

- **Meta Ads:** `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_VERIFY_TOKEN` for the inbound webhook; `META_AD_ACCOUNT_ID` for `/insights` spend.
- **Google Ads:** `GOOGLE_ADS_CONVERSION_SECRET` for inbound conversion webhooks; `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_OAUTH_ACCESS_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` for `searchStream` spend and offline conversion upload.

The kit boots with `DB_PROVIDER=in-memory` if no env vars are set. Webhook routes will reject unsigned requests; the rest of the API works without any external creds.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/touchpoints` | List touchpoints (filter by visitorId, channel) |
| POST | `/touchpoints` | Record a touchpoint |
| GET | `/visitors` | List visitors |
| GET | `/visitors/{id}` | Get a visitor |
| PATCH | `/visitors/{id}` | Identify a visitor (attach email + traits) |
| GET | `/conversions` | List conversions (filter by visitorId) |
| POST | `/conversions` | Record a conversion |
| GET | `/channels` | List channels with period spend |
| GET | `/attribution-models` | List attribution models |
| POST | `/explain-conversion-path` | Orchestrator: per-model attribution for one visitor |
| POST | `/compare-attribution-models` | Orchestrator: model x channel side-by-side |
| POST | `/find-underrated-channels` | Orchestrator: under-credited assist channels (with ROAS) |
| GET/POST | `/webhooks/meta-ads-leadgen` | Meta Lead Ads (verification + lead notification) |
| POST | `/webhooks/google-ads-conversion` | Google Ads conversion ping |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Provider | Path | Verification |
|---|---|---|
| Meta Lead Ads | `GET/POST /webhooks/meta-ads-leadgen?tenant=…` | `x-hub-signature-256` HMAC-SHA256 with `META_APP_SECRET`; GET handshake uses `META_VERIFY_TOKEN` |
| Google Ads conversions | `POST /webhooks/google-ads-conversion?tenant=…&upload=true` | Bearer token == `GOOGLE_ADS_CONVERSION_SECRET` |

Tenant resolution: both webhooks accept a `?tenant=<tenantId>` query parameter. For the common case of a single tenant, set `META_DEFAULT_TENANT_ID` / `GOOGLE_ADS_DEFAULT_TENANT_ID` and omit the query param.

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| `list_touchpoints` | repo | List touchpoints |
| `record_touchpoint` | repo | Append a touchpoint |
| `list_visitors` | repo | List visitors |
| `get_visitor` | repo | Get a visitor |
| `identify_visitor` | repo | Attach email + traits |
| `list_conversions` | repo | List conversions |
| `record_conversion` | repo | Record a conversion |
| `list_channels` | repo | List channels |
| `list_attribution_models` | repo | List attribution models |
| `explain_conversion_path` | repo OR ClickHouse | Per-model path explainer (orchestrator) |
| `compare_attribution_models` | repo | Model x channel comparison (orchestrator) |
| `find_underrated_channels` | ClickHouse, Meta /insights, Google searchStream | Highlight under-credited channels with real spend (orchestrator) |

## The AI angle

Attribution arguments are CMO-CRO power struggles. The three orchestrators in this kit run real SQL + real ad-platform reads, not stub math. `find_underrated_channels` joins ClickHouse-computed last-touch and linear attribution against Meta `/insights` and Google `searchStream` spend, then ranks channels by `(blended attribution / last-touch attribution)` — the channels that look weakest under last-touch but strongest under linear are the "assist" channels you're underspending on. `explain_conversion_path` pulls a single visitor's chronological touchpoints up to their most recent conversion and returns per-model attribution side-by-side; an assistant can answer "why do we credit paid_search instead of organic for this deal?" by reading that one envelope. Both run inside the gateway via `context.invokeRoute` (or directly against ClickHouse) so they inherit auth, rate-limit, and tenant scoping. The `/webhooks/google-ads-conversion?upload=true` round-trip closes the loop: a CRM-confirmed sale lands here, attributes to the gclid, and bounces back to Google so Smart Bidding sees the conversion within minutes.

## Extending

- **Real-time CDP fan-out:** when `record_conversion` fires with `dealId`, also call your CRM (HubSpot, Salesforce) to refresh the contact and account.
- **More ad platforms:** drop a `tiktok-ads.ts` next to `meta-ads.ts` and `google-ads.ts` — each integration only needs `fetch<Platform>Insights()` + a `/webhooks/<platform>` handler.
- **Custom model:** add a new `AttributionModel.kind` and extend `attributeValue()` in `explain-conversion-path.ts` and `compare-attribution-models.ts`.
- **Batch ClickHouse loads:** the per-row `INSERT ... VALUES` in `modules/integrations/clickhouse.ts` works fine for webhook volumes; for bulk historical loads, use `INSERT INTO ... FORMAT JSONEachRow` and pass the body as `application/octet-stream`.
- **Switch databases:** change `DB_PROVIDER` in `.env`. ClickHouse is recommended for high-volume telemetry; Postgres-style stores work fine for B2B SaaS.
