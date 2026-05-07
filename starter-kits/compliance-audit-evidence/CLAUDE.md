# Compliance & Audit Evidence Starter Kit

Track SOC 2 / ISO 27001 / HIPAA / GDPR controls, collect evidence, run audit cycles, file and resolve findings. See [../CLAUDE.md](../CLAUDE.md) for kit conventions.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/controls` | List controls |
| POST | `/controls` | Create control |
| GET | `/controls/{id}` | Get control |
| GET | `/evidence` | List evidence |
| POST | `/evidence` | Submit evidence |
| PATCH | `/evidence/{id}/stale` | Mark evidence stale |
| GET | `/audit-cycles` | List audit cycles |
| POST | `/audit-cycles` | Create audit cycle |
| GET | `/findings` | List findings |
| POST | `/findings` | File finding |
| PATCH | `/findings/{id}/resolve` | Resolve finding |
| GET | `/policies` | List policies |
| POST | `/policies` | Create policy |
| POST | `/flag-stale-evidence` | Orchestrator: flip stale evidence |
| POST | `/map-evidence-to-control` | Orchestrator: per-control evidence with currentness |
| POST | `/draft-audit-response` | Orchestrator: draft response to a finding |
| POST | `/mcp` | MCP server endpoint |

## Entities

- `Evidence` — primary
- `Control` — framework requirement
- `AuditCycle` — engagement against a framework
- `Finding` — issue raised in an audit cycle, scoped to a control
- `Policy` — policy document tracked alongside controls

## MCP tools registered

`list_controls`, `get_control`, `create_control`, `list_evidence`, `submit_evidence`, `mark_evidence_stale`, `list_audit_cycles`, `create_audit_cycle`, `list_findings`, `file_finding`, `resolve_finding`, `list_policies`, `create_policy`, `flag_stale_evidence`, `map_evidence_to_control`, `draft_audit_response`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).
