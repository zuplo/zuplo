# Vendor & Contract Management Starter Kit

Headless vendor & contract API. Replaces Vendr, Tropic, Ironclad. See [../CLAUDE.md](../CLAUDE.md) for conventions.

## Domain

| Entity | Purpose |
|---|---|
| `Contract` | Primary entity. Vendor agreement with start/end + value. |
| `Vendor` | Counterparty record. |
| `Renewal` | Scheduled action on a contract. |
| `RiskAssessment` | Security/financial/compliance/data-privacy review. |
| `SpendRecord` | Period-bucketed spend rollup. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/contracts` | List contracts |
| POST | `/contracts` | Create contract |
| GET | `/contracts/{id}` | Get contract |
| PATCH | `/contracts/{id}` | Update contract |
| POST | `/contracts/{id}/terminate` | Terminate (destructive) |
| GET | `/vendors` | List vendors |
| POST | `/vendors` | Create vendor |
| GET | `/vendors/{id}` | Get vendor |
| GET | `/renewals` | List renewals |
| POST | `/renewals` | Schedule renewal |
| GET | `/risk-assessments` | List assessments |
| POST | `/risk-assessments` | Record assessment |
| GET | `/spend` | List spend |
| POST | `/flag-upcoming-renewals` | Orchestrator |
| POST | `/compare-vendor-pricing` | Orchestrator |
| POST | `/calc-total-spend` | Orchestrator |
| POST | `/mcp` | MCP endpoint |

## Orchestrators

- `flag_upcoming_renewals` - active contracts with endDate within `daysAhead`; flags whose notice window is already open.
- `compare_vendor_pricing` - all vendors in a category with active contract count + total annual spend.
- `calc_total_spend` - sum spend records optionally filtered by vendorId / year.

## MCP tools registered

`list_contracts`, `get_contract`, `create_contract`, `update_contract`, `terminate_contract`, `list_vendors`, `get_vendor`, `create_vendor`, `list_renewals`, `schedule_renewal`, `list_risk_assessments`, `record_assessment`, `list_spend`, `flag_upcoming_renewals`, `compare_vendor_pricing`, `calc_total_spend`. Same operationIds in both layers.
