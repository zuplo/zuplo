# Compliance & Audit Evidence API

Headless SOC 2 / ISO 27001 / HIPAA / GDPR control + evidence tracking, backed by an MCP server. Register controls, collect evidence, run audit cycles, file findings, and let an LLM keep your evidence fresh and your responses drafted.

Replaces: Vanta, Drata, Secureframe.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/compliance-audit-evidence
cd starter-kits/compliance-audit-evidence
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
| GET | `/controls` | List controls |
| POST | `/controls` | Create a control |
| GET | `/controls/{id}` | Get a control |
| GET | `/evidence` | List evidence |
| POST | `/evidence` | Submit evidence |
| PATCH | `/evidence/{id}/stale` | Mark evidence stale |
| GET | `/audit-cycles` | List audit cycles |
| POST | `/audit-cycles` | Create an audit cycle |
| GET | `/findings` | List findings |
| POST | `/findings` | File a finding |
| PATCH | `/findings/{id}/resolve` | Resolve a finding |
| GET | `/policies` | List policies |
| POST | `/policies` | Create a policy |
| POST | `/flag-stale-evidence` | Orchestrator: flip stale evidence |
| POST | `/map-evidence-to-control` | Orchestrator: evidence with currentness |
| POST | `/draft-audit-response` | Orchestrator: draft response to a finding |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_controls` | yes | List controls |
| `get_control` | yes | Get control by id |
| `create_control` | no | Register a control |
| `list_evidence` | yes | List evidence |
| `submit_evidence` | no | Attach evidence to a control |
| `mark_evidence_stale` | no (idempotent) | Mark evidence stale |
| `list_audit_cycles` | yes | List audit cycles |
| `create_audit_cycle` | no | Create an audit cycle |
| `list_findings` | yes | List findings |
| `file_finding` | no | File a finding |
| `resolve_finding` | no (idempotent) | Resolve / accept-risk a finding |
| `list_policies` | yes | List policy documents |
| `create_policy` | no | Create a policy |
| `flag_stale_evidence` | no | Walk evidence + flip stale |
| `map_evidence_to_control` | yes | Per-control evidence with currentness |
| `draft_audit_response` | yes | Draft response for a finding |

## The AI angle

`flag_stale_evidence` and `draft_audit_response` are the headlines. Compliance teams spend a lot of time chasing two questions: "is the evidence still current?" and "how do we respond to this finding?". `flag_stale_evidence` walks every evidence row, joins it to its control's `evidenceFrequencyDays`, and flips the stale ones in one shot. `draft_audit_response` reads a finding, joins the linked control + supporting evidence, and returns a structured draft the LLM can rewrite for tone — instead of teaching an agent to chain three list calls and a join.

## Extending

- **Auto-collect**: add scheduled jobs that POST evidence into `/evidence` from cloud APIs (AWS Config, GitHub, etc.).
- **Risk register**: add a `Risk` entity that links to controls and findings.
- **Customer trust portal**: layer a public read-only proxy that shows current control + policy status.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.
