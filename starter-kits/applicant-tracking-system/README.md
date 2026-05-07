# Applicant Tracking System (ATS) API

A Zuplo Starter Kit that ships an open-source ATS — jobs, candidates, applications, interviews, scorecards — together with an MCP server so agents can summarise candidates, compare debriefs, and read pipeline health through plain HTTP or MCP tools.

Replaces: Greenhouse, Lever, Ashby.

## Quickstart

```bash
cd starter-kits/applicant-tracking-system
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
| `neon` | Supported |
| `upstash-redis` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example).

The kit will boot with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke-test path is zero-config.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs` | List jobs |
| POST | `/jobs` | Create a job |
| GET | `/jobs/{id}` | Get a job |
| GET | `/candidates` | List candidates (filter by email) |
| POST | `/candidates` | Create a candidate |
| GET | `/applications` | List applications (filter by candidateId, jobId, stage) |
| POST | `/applications` | Create an application |
| GET | `/applications/{id}` | Get an application |
| PATCH | `/applications/{id}` | Move application stage |
| GET | `/interviews` | List interviews |
| POST | `/interviews` | Schedule an interview |
| POST | `/scorecards` | Submit a scorecard |
| POST | `/summarize-candidate` | Orchestrator: chronological history |
| POST | `/compare-candidates` | Orchestrator: side-by-side debrief |
| POST | `/pipeline-health-for-job` | Orchestrator: per-stage counts and timing |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_jobs` | tool | yes | List jobs |
| `get_job` | tool | yes | Get a job by id |
| `create_job` | tool | no | Create a job requisition |
| `list_candidates` | tool | yes | List candidates |
| `create_candidate` | tool | no | Create a candidate |
| `list_applications` | tool | yes | List applications |
| `get_application` | tool | yes | Get an application |
| `create_application` | tool | no | Create an application |
| `move_application_stage` | tool | idempotent | Move pipeline stage |
| `list_interviews` | tool | yes | List interviews |
| `schedule_interview` | tool | no | Schedule an interview |
| `submit_scorecard` | tool | no | Record interviewer feedback |
| `summarize_candidate` | tool | yes | Chronological candidate history (orchestrator) |
| `compare_candidates` | tool | yes | Side-by-side scorecard aggregation (orchestrator) |
| `pipeline_health_for_job` | tool | yes | Per-stage funnel + timing (orchestrator) |

## The AI angle

Hiring is the most read-heavy domain in HR — managers read summaries, debrief notes, and pipeline reports far more than they write into the system. The three orchestrator tools — `summarize_candidate`, `compare_candidates`, `pipeline_health_for_job` — turn an assistant into the recruiter's first reader. "Summarise this candidate" stitches together a candidate plus every application plus every scorecard. "Compare these three onsites" rolls up scorecards into a side-by-side view. "How's the pipeline for the SRE role?" returns counts and time-in-stage. All three call sibling routes through `context.invokeRoute()` so multi-tenancy and rate limits stay enforced.

## Extending

- **Job descriptions in markdown:** the description field is plain text — add a markdown renderer or a JSON-LD schema for richer job posting export.
- **Email integration:** add an outbound webhook on `schedule_interview` to push to Google Calendar, and on `move_application_stage` to email the candidate.
- **Reject reasons:** extend the `move_application_stage` payload with `reason` and `rejectedBy` fields when stage=rejected; pipe them into `pipeline_health_for_job` for a "why we reject" breakdown.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.
