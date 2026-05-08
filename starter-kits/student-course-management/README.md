# Student / Course Management API

Students, courses, enrollments, lessons, and grades — wired to Google Calendar so every lesson lands on the instructor's *and* enrolled students' calendars (Meet link optional), and to Resend so progress reports go straight to parents.

Replaces: TeachWorks, Thinkific admin, Google Classroom.

## Wires up

Google Calendar receives a calendar event for every lesson scheduled — the instructor and all actively-enrolled students are added as attendees, and Calendar can provision a Meet link in the same call. Resend ships progress reports composed by `send_progress_report` (which delegates to the existing `draft_progress_report` orchestrator) to the parent email on file (falling back to the student email). Together they make the kit a real "school operations" surface, not just rows in a database.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Handlers
                │                  ├── create_lesson  ──▶ Google Calendar (instructor + students + optional Meet link)
                │                  └── DB adapter (Supabase / Firestore / Neon / Upstash)
                ▼
         /mcp ──▶ MCP server ──▶ orchestrator tools
                                   ├── send_progress_report ──▶ Resend (parent / student email)
                                   ├── draft_progress_report
                                   ├── flag_at_risk_students
                                   └── recommend_remediation
```

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

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- **Google Calendar** — `GOOGLE_CALENDAR_ACCESS_TOKEN` (OAuth2 access token, refresh externally), optional `GOOGLE_CALENDAR_ID`.
- **Resend** — `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

If either integration is unset, the affected handler still records the lesson / draft, but the response includes a `*_Error` field describing what failed.

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
| GET | `/attendance` | `list_attendance` | List Attendance | tool |
| POST | `/course` | `create_course` | Create Course | tool |
| GET | `/course/{id}` | `get_course` | Get Course | tool |
| GET | `/courses` | `list_courses` | List Courses | tool |
| POST | `/draft-progress-report` | `draft_progress_report` | Draft Progress Report | tool |
| POST | `/send-progress-report` | `send_progress_report` | Compose + send progress report via Resend | tool |
| POST | `/enrollment` | `create_enrollment` | Create Enrollment | tool |
| PATCH | `/enrollment-status/{id}` | `update_enrollment_status` | Update Enrollment Status | tool |
| GET | `/enrollment/{id}` | `get_enrollment` | Get Enrollment | tool |
| GET | `/enrollments` | `list_enrollments` | List Enrollments | tool |
| POST | `/flag-at-risk-students` | `flag_at_risk_students` | Flag At Risk Students | tool |
| POST | `/grade` | `record_grade` | Record Grade | tool |
| GET | `/grades` | `list_grades` | List Grades | tool |
| POST | `/lesson` | `create_lesson` | Create Lesson (Google Calendar event + roster invites) | tool |
| GET | `/lessons` | `list_lessons` | List Lessons | tool |
| POST | `/mark-attendance` | `mark_attendance` | Mark Attendance | tool |
| POST | `/recommend-remediation` | `recommend_remediation` | Recommend Remediation | tool |
| POST | `/student` | `create_student` | Create Student | tool |
| GET | `/student/{id}` | `get_student` | Get Student | tool |
| GET | `/students` | `list_students` | List Students | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| CRUD: `create_course`, `create_enrollment`, `create_student`, `get_course`, `get_enrollment`, `get_student`, `list_attendance`, `list_courses`, `list_enrollments`, `list_grades`, `list_lessons`, `list_students`, `mark_attendance`, `record_grade`, `update_enrollment_status` | DB | Standard reads/writes. |
| `create_lesson` | DB + Google Calendar | Save the lesson AND put it on the instructor's + enrolled students' calendars. Pass `createMeetLink: true` to provision a Hangouts Meet on the same call. |
| `draft_progress_report` | DB | Per-student narrative across enrolled courses (grades + attendance). |
| `send_progress_report` | DB + Resend | Compose `draft_progress_report` and ship it via Resend. Pass `send: false` to dry-run. |
| `flag_at_risk_students` | DB | Score students by attendance + grades and surface the bottom slice. |
| `recommend_remediation` | DB | For a flagged student, suggest specific remediation steps. |

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

`send_progress_report` is where the loop closes. The MCP-aware assistant runs `flag_at_risk_students`, picks one, calls `recommend_remediation` to see what to do, and then `send_progress_report` to put a coherent update in the parent's inbox — three calls, one outcome the family can act on. `create_lesson` makes the schedule durable: instructor and students see the lesson on their calendars within seconds of it being created.

## Extending

- **Swap Resend for Postmark/SendGrid**: replace `modules/integrations/resend.ts`. The orchestrator's `sendResendEmail(...)` call is a single function.
- **Calendar provider**: replace `modules/integrations/google-calendar.ts` with Outlook/Microsoft Graph.
- **SMS reminders**: add a Twilio integration and have `create_lesson` text day-of reminders to students whose phones are on file.
- **New entity:** add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`).
- **Switch databases:** change `DB_PROVIDER` in `.env` — the handlers don't change.
