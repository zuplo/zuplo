# IT Asset Tracking API

Headless IT asset tracking API backed by an MCP server. Track laptops, monitors, phones, and other hardware; assign assets to employees; log maintenance and software licenses; and let an LLM staff your IT helpdesk via MCP tools.

Replaces: Snipe-IT, Asset Panda, Lansweeper.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/it-asset-tracking
cd starter-kits/it-asset-tracking
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
| `in-memory` | Default — boots without any credentials |
| `supabase` | Supported |
| `firestore` | Supported |
| `upstash-redis` | Supported |
| `neon` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example). The kit boots with `DB_PROVIDER=in-memory` and zero other env vars.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/assets` | List assets |
| POST | `/assets` | Create an asset |
| GET | `/assets/{id}` | Get an asset |
| PATCH | `/assets/{id}` | Update an asset |
| PATCH | `/assets/{id}/retire` | Retire an asset |
| GET | `/assignments` | List asset-to-employee assignments |
| POST | `/assignments` | Open an assignment |
| POST | `/assignments/return` | Close an assignment (return) |
| GET | `/maintenance` | List maintenance records |
| POST | `/maintenance` | Log a maintenance event |
| GET | `/licenses` | List software licenses |
| POST | `/licenses` | Add a license to an asset |
| POST | `/assign-laptop-to-hire` | Orchestrator: assign first available asset to a hire |
| POST | `/find-unrecovered-offboards` | Orchestrator: find unreturned equipment |
| POST | `/schedule-refresh-cycle` | Orchestrator: list assets due for refresh |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_assets` | yes | List assets |
| `get_asset` | yes | Get asset by id |
| `create_asset` | no | Add an asset to inventory |
| `update_asset` | no (idempotent) | Patch fields on an asset |
| `retire_asset` | destructive | Retire an asset |
| `list_assignments` | yes | List assignments |
| `assign_asset` | no | Open an assignment |
| `return_asset` | no | Close an assignment |
| `list_maintenance` | yes | List maintenance records |
| `log_maintenance` | no | Log a repair/upgrade/audit |
| `list_licenses` | yes | List licenses |
| `add_license` | no | Attach a license to an asset |
| `assign_laptop_to_hire` | no | Pick first in_stock asset, open assignment |
| `find_unrecovered_offboards` | yes | Open assignments older than threshold |
| `schedule_refresh_cycle` | yes | Assets older than `ageYears` due for refresh |

## The AI angle

`assign_laptop_to_hire` is the headline. Onboarding a hire usually means a helpdesk ticket: "find a free MacBook, log the assignment, mark it taken." This kit collapses that into a single MCP tool the LLM calls with just an email — the gateway picks an in-stock asset, opens the assignment, flips status, and returns the result. `find_unrecovered_offboards` and `schedule_refresh_cycle` round out the AI angle for offboarding and lifecycle management.

## Extending

- **Procurement integration**: swap `assign_laptop_to_hire` to call a vendor API when no inventory matches, instead of returning 409.
- **MDM sync**: add a webhook route that updates asset `status` from Jamf or Intune.
- **Per-location capacity**: introduce a `Location` entity and route assignments to whichever location has stock.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.
