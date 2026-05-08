# Applicant Tracking System (ATS) API

A Zuplo Starter Kit for an open-source ATS that does the recruiting busywork. Schedule an interview and the candidate gets a Google Calendar invite (with Meet link). Ask for a candidate summary and Claude folds the resume + every scorecard into a 4-paragraph brief. Reject letters via Resend.

Replaces: Greenhouse, Lever, Ashby.

## Wires up

- **Google Calendar** (Calendar API v3, OAuth2 access token) — `schedule_interview` creates a real event with the candidate + interviewer as attendees, optionally with a Google Meet link
- **Resend** — outbound email for offer / reject / interview-confirmation messages
- **Claude** (Anthropic Messages API, optionally routed through Zuplo AI Gateway) — `summarize_candidate` produces the hiring brief that goes to the panel

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Google Calendar (events.insert + Meet)
                │                  ├── Resend          (candidate emails)
                │                  └── Claude          (interview prep brief)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

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

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll need:

- `GOOGLE_OAUTH_ACCESS_TOKEN` (+ optional `GOOGLE_CALENDAR_ID`) — calendar invites for `schedule_interview`
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — outbound candidate communications
- `ANTHROPIC_API_KEY` — candidate-brief drafting (`AI_GATEWAY_URL` optional)

The kit boots fine with `DB_PROVIDER=in-memory` and no integration creds — `schedule_interview` just records the interview without an invite (and surfaces the Calendar error on the row), and `summarize_candidate` returns the timeline without a brief.

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
| POST | `/interviews` | Schedule an interview (creates a Google Calendar event when candidateEmail is supplied) |
| POST | `/scorecards` | Submit a scorecard |
| POST | `/summarize-candidate` | Orchestrator: chronological history + optional Claude-drafted brief |
| POST | `/compare-candidates` | Orchestrator: side-by-side debrief |
| POST | `/pipeline-health-for-job` | Orchestrator: per-stage counts and timing |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Calls | Description |
|---|---|---|---|---|
| `list_jobs` | tool | yes | DB | List jobs |
| `get_job` | tool | yes | DB | Get a job by id |
| `create_job` | tool | no | DB | Create a job requisition |
| `list_candidates` | tool | yes | DB | List candidates |
| `create_candidate` | tool | no | DB | Create a candidate |
| `list_applications` | tool | yes | DB | List applications |
| `get_application` | tool | yes | DB | Get an application |
| `create_application` | tool | no | DB | Create an application |
| `move_application_stage` | tool | idempotent | DB | Move pipeline stage |
| `list_interviews` | tool | yes | DB | List interviews |
| `schedule_interview` | tool | no | DB + Google Calendar | Schedule an interview and create the Calendar invite |
| `submit_scorecard` | tool | no | DB | Record interviewer feedback |
| `summarize_candidate` | tool | yes | DB + Claude (optional) | Chronological candidate history + optional Claude brief (orchestrator) |
| `compare_candidates` | tool | yes | DB | Side-by-side scorecard aggregation (orchestrator) |
| `pipeline_health_for_job` | tool | yes | DB | Per-stage funnel + timing (orchestrator) |

## The AI angle

Two tools earn their keep here:

- **`schedule_interview`** — pass `candidateEmail` and a `scheduledAt` and the handler creates a real Google Calendar event with both parties on the invite, optionally with a Meet link (`createMeetLink: true`). The returned Interview row carries the eventId and link so the assistant can show "I scheduled the interview, here's the join URL" with one MCP call. Calendar failures don't fail the interview create — the error string is captured on the row so an agent can retry.
- **`summarize_candidate`** — pass `generateBrief: true` (and optionally `resumeText` and `briefTone`) and the orchestrator pulls the candidate, every application, every scorecard, then asks Claude to produce a 4-paragraph hiring brief: who they are, pipeline activity, scorecard themes, recommended next step. The raw timeline still ships in the response so the panel can audit the brief against the source.

## Extending

- **Swap Resend for Postmark / SES:** replace `modules/integrations/resend.ts`. The hand-off flow stays the same.
- **Microsoft 365 instead of Google Calendar:** swap `modules/integrations/google-calendar.ts` for a Graph API caller — keep the same shape.
- **Reject email automation:** add a `move_application_stage` extension that, when stage=rejected, calls `sendResendEmail()` with a Claude-drafted rejection.
- **Async resume parsing:** instead of passing `resumeText` inline, store a `resumeUrl` on the Application and have `summarize_candidate` fetch + parse it before handing to Claude.
- **Route Claude through Zuplo's AI Gateway:** set `AI_GATEWAY_URL` and every Claude call inherits caching, budgets, and prompt-injection scanning.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.
