# Student / Course Management API

Students, courses, enrollments, lessons, and grades with MCP tools that flag at-risk students, draft progress reports, and recommend remediation.

**Replaces:** TeachWorks, Thinkific admin, Google Classroom.
**SEO target:** "api for course management".

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/student-course-management
cd student-course-management
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
| GET | `/attendance` | `list_attendance` | List Attendance | tool |
| POST | `/course` | `create_course` | Create Course | tool |
| GET | `/course/{id}` | `get_course` | Get Course | tool |
| GET | `/courses` | `list_courses` | List Courses | tool |
| POST | `/draft-progress-report` | `draft_progress_report` | Draft Progress Report | tool |
| POST | `/enrollment` | `create_enrollment` | Create Enrollment | tool |
| PATCH | `/enrollment-status/{id}` | `update_enrollment_status` | Update Enrollment Status | tool |
| GET | `/enrollment/{id}` | `get_enrollment` | Get Enrollment | tool |
| GET | `/enrollments` | `list_enrollments` | List Enrollments | tool |
| POST | `/flag-at-risk-students` | `flag_at_risk_students` | Flag At Risk Students | tool |
| POST | `/grade` | `record_grade` | Record Grade | tool |
| GET | `/grades` | `list_grades` | List Grades | tool |
| POST | `/lesson` | `create_lesson` | Create Lesson | tool |
| GET | `/lessons` | `list_lessons` | List Lessons | tool |
| POST | `/mark-attendance` | `mark_attendance` | Mark Attendance | tool |
| POST | `/recommend-remediation` | `recommend_remediation` | Recommend Remediation | tool |
| POST | `/student` | `create_student` | Create Student | tool |
| GET | `/student/{id}` | `get_student` | Get Student | tool |
| GET | `/students` | `list_students` | List Students | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

19 tools registered: `create_course`, `create_enrollment`, `create_lesson`, `create_student`, `get_course`, `get_enrollment`, `get_student`, `list_attendance`, `list_courses`, `list_enrollments`, `list_grades`, `list_lessons`, `list_students`, `mark_attendance`, `record_grade`, `update_enrollment_status`, `draft_progress_report`, `flag_at_risk_students`, `recommend_remediation`.

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
