# Patient Intake / Healthcare Admin API

Patients, intake forms, consents, insurance, and appointments with MCP tools that verify insurance pre-visit, summarize intake, and flag missing consents. NOT a substitute for HIPAA compliance work.

**Replaces:** Jotform HIPAA, Phreesia.
**SEO target:** "api for patient intake".

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/patient-intake
cd patient-intake
cp env.example .env
npm install
npm run dev
```

The gateway boots at `http://localhost:9000`. To explore the MCP server:

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

## Choosing a database

This kit ships with HTTP-only adapters (the kits run in Zuplo's edge runtime — no TCP drivers). Set `DB_PROVIDER` in `.env` to one of:

| `DB_PROVIDER` | Adapter |
|---|---|
| `in-memory` | In-Memory (tests/local) |
| `supabase` | Supabase (PostgREST) |
| `firestore` | Firestore (REST) |
| `neon` | Neon (HTTP serverless) |
| `upstash-redis` | Upstash Redis (REST) |

`in-memory` is the default — the kit boots without any credentials so you can try it before wiring up storage.

## Environment variables

See [env.example](./env.example).

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
| POST | `/appointment/{id}/schedule` | `schedule_appointment` | Schedule Appointment | tool |
| GET | `/appointments` | `list_appointments` | List Appointments | tool |
| POST | `/consent` | `record_consent` | Record Consent | tool |
| GET | `/consents` | `list_consents` | List Consents | tool |
| POST | `/flag-missing-consents` | `flag_missing_consents` | Flag Missing Consents | tool |
| GET | `/insurance` | `list_insurance` | List Insurance | tool |
| POST | `/insurance` | `create_insurance` | Create Insurance | tool |
| POST | `/intake-form` | `create_intake_form` | Create Intake Form | tool |
| GET | `/intake-forms` | `list_intake_forms` | List Intake Forms | tool |
| GET | `/intake-submission/{id}` | `get_intake_submission` | Get Intake Submission | tool |
| GET | `/intake-submissions` | `list_intake_submissions` | List Intake Submissions | tool |
| POST | `/intake/{id}/submit` | `submit_intake` | Submit Intake | tool |
| POST | `/patient` | `create_patient` | Create Patient | tool |
| GET | `/patient/{id}` | `get_patient` | Get Patient | tool |
| GET | `/patients` | `list_patients` | List Patients | tool |
| POST | `/review-intake-submission` | `review_intake_submission` | Review Intake Submission | tool |
| POST | `/summarize-intake-for-provider` | `summarize_intake_for_provider` | Summarize Intake For Provider | tool |
| POST | `/verify-insurance-pre-visit` | `verify_insurance_pre_visit` | Verify Insurance Pre Visit | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

18 tools registered: `create_insurance`, `list_insurance`, `create_intake_form`, `create_patient`, `get_intake_submission`, `get_patient`, `list_appointments`, `list_consents`, `list_intake_forms`, `list_intake_submissions`, `list_patients`, `record_consent`, `review_intake_submission`, `schedule_appointment`, `submit_intake`, `flag_missing_consents`, `summarize_intake_for_provider`, `verify_insurance_pre_visit`.

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

The orchestrator MCP tools shipped with this kit are where the agentic value compounds — they read multi-source signals through `context.invokeRoute()` and shape the response for an LLM, rather than dumping raw rows. Agents work best when they can call a few purposeful tools (`triage_x`, `summarize_x`, `flag_x`) instead of every CRUD endpoint.

Per the [conventions doc](../CLAUDE.md), every CRUD endpoint inherits `api-key-inbound` + `rate-limit` policies, and the `/mcp` route adds `prompt-injection-outbound` + `secret-masking-outbound` defenses for AI traffic.

## Extending

- **New entity:** add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`).
- **New endpoint:** add a handler in `modules/handlers/`, append the route to `config/routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` route's `options.operations: [...]` array. Both layers must agree.
- **New orchestrator MCP tool:** drop a file in `modules/mcp-tools/` that uses `invokeJson` from `../_shared/mcp/helpers.ts` to compose existing endpoints. Pass the inbound `authorization` header through so the inner calls re-run policies.
- **Switch databases:** change `DB_PROVIDER` in `.env` — the handlers don't change.
