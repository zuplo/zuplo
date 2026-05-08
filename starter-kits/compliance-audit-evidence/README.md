# Compliance & Audit Evidence API

A real, runnable evidence backbone for SOC 2 / ISO 27001 / HIPAA / GDPR: Datadog monitor results land as evidence automatically, hand-collected artifacts go straight to R2 with content-addressed storage, and orchestrator MCP tools keep the freshness and audit-response loops humming.

Replaces: Vanta, Drata, Secureframe.

## Wires up

- **Cloudflare R2** stores evidence files (S3-compatible, signed via SigV4 from the edge runtime). Inline content gets uploaded and content-addressed by SHA-256, so the same file submitted twice dedupes naturally.
- **Datadog**: `/webhooks/datadog` receives monitor-fired events tagged `control:<id>`, persists the raw payload to R2, and creates a `kind: log` evidence row on the matching control. The reverse direction posts a Datadog event (`Evidence collected: ...`) every time `submit_evidence` runs, so SREs and auditors share one timeline.

## Architecture at a glance

```
                  ┌──── Auditor / agent submit ────┐
                  ▼                                  
        POST /evidence  ──┬──► R2 (sha256 = filename)
                          │
                          └──► evidenceRepository
                                      │
                                      ▼
                            Datadog event mirror
                            (tag: control:<id>)

  Datadog monitor fires ─▶ POST /webhooks/datadog
                                    │
                                    ▼
                    R2 (raw payload archived)
                                    │
                                    ▼
                        evidenceRepository
                        (kind=log, control:<tag>)
```

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

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER` you'll want:

- **R2** (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) for evidence storage
- **Datadog** (`DATADOG_WEBHOOK_SECRET`) for the inbound monitor webhook; `DATADOG_API_KEY` if you want submit-evidence to mirror to Datadog events

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/controls` | List controls |
| POST | `/controls` | Create a control |
| GET | `/controls/{id}` | Get a control |
| GET | `/evidence` | List evidence |
| POST | `/evidence` | Submit evidence (R2 upload + Datadog event) |
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
| POST | `/webhooks/datadog` | Datadog monitor webhook → evidence |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Provider | Notes |
|---|---|---|
| `POST /webhooks/datadog` | Datadog Webhooks integration | HMAC-SHA256 (`x-datadog-signature`). Monitor must include a `control:<id>` tag. Raw payload is archived to R2; an evidence row of `kind: log` is created against that control. |

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_controls` | yes | DB | List controls |
| `get_control` | yes | DB | Get control by id |
| `create_control` | no | DB | Register a control |
| `list_evidence` | yes | DB | List evidence |
| `submit_evidence` | no | R2 + DB + Datadog | Upload to R2 (or accept fileUrl), create row, mirror to Datadog event |
| `mark_evidence_stale` | idempotent | DB | Mark evidence stale |
| `list_audit_cycles` | yes | DB | List audit cycles |
| `create_audit_cycle` | no | DB | Create an audit cycle |
| `list_findings` | yes | DB | List findings |
| `file_finding` | no | DB | File a finding |
| `resolve_finding` | idempotent | DB | Resolve / accept-risk a finding |
| `list_policies` | yes | DB | List policy documents |
| `create_policy` | no | DB | Create a policy |
| `flag_stale_evidence` | no | DB | Walk evidence + flip stale |
| `map_evidence_to_control` | yes | DB | Per-control evidence with currentness |
| `draft_audit_response` | yes | DB | Draft response for a finding |

## The AI angle

The kit goes beyond CRUD on two fronts:

1. **Datadog → evidence pipe**: instead of nagging SREs to screenshot a monitor and upload it manually, every fired monitor with a `control:<id>` tag becomes an immutable, content-addressed evidence row in R2, with the original Datadog payload preserved. That's "continuous control monitoring" without a separate vendor.

2. **Orchestrators that close the loop**: `flag_stale_evidence` walks every row, joins to its control's `evidenceFrequencyDays`, and flips the stale ones — so an agent can ask "what evidence is missing for SOC 2?" and get the right answer. `draft_audit_response` reads a finding, joins the linked control + supporting evidence, and returns a structured draft an LLM can rewrite for tone.

## Extending

- **Add a new ingest source**: drop another webhook handler (e.g. `/webhooks/aws-config`, `/webhooks/github-advisory`), reuse `putEvidence()` from `r2.ts`, and log an evidence row.
- **Switch evidence storage**: replace `r2.ts` with `s3.ts` or `gcs.ts`. The interface is just `putEvidence(key, body, options)`.
- **LLM-assisted drafting**: drop a `claude.ts` integration alongside `r2.ts` and call it from `draft-audit-response.ts` to get an actual prose draft instead of structured JSON.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.
