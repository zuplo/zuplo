# Student / Course Management API

Students, courses, enrollments, lessons, and grades with MCP tools that flag at-risk students, draft progress reports, and recommend remediation.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| GET | `/attendance` | `list_attendance` | tool |
| POST | `/course` | `create_course` | tool |
| GET | `/course/{id}` | `get_course` | tool |
| GET | `/courses` | `list_courses` | tool |
| POST | `/draft-progress-report` | `draft_progress_report` | tool |
| POST | `/enrollment` | `create_enrollment` | tool |
| PATCH | `/enrollment-status/{id}` | `update_enrollment_status` | tool |
| GET | `/enrollment/{id}` | `get_enrollment` | tool |
| GET | `/enrollments` | `list_enrollments` | tool |
| POST | `/flag-at-risk-students` | `flag_at_risk_students` | tool |
| POST | `/grade` | `record_grade` | tool |
| GET | `/grades` | `list_grades` | tool |
| POST | `/lesson` | `create_lesson` | tool |
| GET | `/lessons` | `list_lessons` | tool |
| POST | `/mark-attendance` | `mark_attendance` | tool |
| POST | `/recommend-remediation` | `recommend_remediation` | tool |
| POST | `/student` | `create_student` | tool |
| GET | `/student/{id}` | `get_student` | tool |
| GET | `/students` | `list_students` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

19 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `create_course`
- `create_enrollment`
- `create_lesson`
- `create_student`
- `get_course`
- `get_enrollment`
- `get_student`
- `list_attendance`
- `list_courses`
- `list_enrollments`
- `list_grades`
- `list_lessons`
- `list_students`
- `mark_attendance`
- `record_grade`
- `update_enrollment_status`
- `draft_progress_report`
- `flag_at_risk_students`
- `recommend_remediation`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 19 entries above.

## Replaces

- TeachWorks
- Thinkific admin
- Google Classroom
