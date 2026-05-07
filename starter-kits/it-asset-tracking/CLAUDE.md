# IT Asset Tracking Starter Kit

Track hardware, assign to employees, log maintenance, attach licenses. See [../CLAUDE.md](../CLAUDE.md) for kit conventions.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/assets` | List assets |
| POST | `/assets` | Create asset |
| GET | `/assets/{id}` | Get asset |
| PATCH | `/assets/{id}` | Update asset |
| PATCH | `/assets/{id}/retire` | Retire asset |
| GET | `/assignments` | List assignments |
| POST | `/assignments` | Open assignment |
| POST | `/assignments/return` | Close assignment (return) |
| GET | `/maintenance` | List maintenance records |
| POST | `/maintenance` | Log maintenance |
| GET | `/licenses` | List licenses |
| POST | `/licenses` | Add license |
| POST | `/assign-laptop-to-hire` | Orchestrator: assign first available to hire |
| POST | `/find-unrecovered-offboards` | Orchestrator: open assignments older than threshold |
| POST | `/schedule-refresh-cycle` | Orchestrator: assets due for refresh |
| POST | `/mcp` | MCP server endpoint |

## Entities

- `Asset` — primary
- `Assignment` — asset ↔ employee, open while `returnedAt` is null
- `MaintenanceRecord` — repair/upgrade/audit history
- `License` — software license attached to an asset
- `Location` — physical site (defined; not exposed yet)

## MCP tools registered

`list_assets`, `get_asset`, `create_asset`, `update_asset`, `retire_asset`, `list_assignments`, `assign_asset`, `return_asset`, `list_maintenance`, `log_maintenance`, `list_licenses`, `add_license`, `assign_laptop_to_hire`, `find_unrecovered_offboards`, `schedule_refresh_cycle`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).
