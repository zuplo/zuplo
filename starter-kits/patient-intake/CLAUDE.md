# Patient Intake / Healthcare Admin API

Patients, intake forms, consents, insurance, and appointments with MCP tools that verify insurance pre-visit, summarize intake, and flag missing consents. NOT a substitute for HIPAA compliance work.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/appointment/{id}/schedule` | `schedule_appointment` | tool |
| GET | `/appointments` | `list_appointments` | tool |
| POST | `/consent` | `record_consent` | tool |
| GET | `/consents` | `list_consents` | tool |
| POST | `/flag-missing-consents` | `flag_missing_consents` | tool |
| GET | `/insurance` | `list_insurance` | tool |
| POST | `/insurance` | `create_insurance` | tool |
| POST | `/intake-form` | `create_intake_form` | tool |
| GET | `/intake-forms` | `list_intake_forms` | tool |
| GET | `/intake-submission/{id}` | `get_intake_submission` | tool |
| GET | `/intake-submissions` | `list_intake_submissions` | tool |
| POST | `/intake/{id}/submit` | `submit_intake` | tool |
| POST | `/patient` | `create_patient` | tool |
| GET | `/patient/{id}` | `get_patient` | tool |
| GET | `/patients` | `list_patients` | tool |
| POST | `/review-intake-submission` | `review_intake_submission` | tool |
| POST | `/summarize-intake-for-provider` | `summarize_intake_for_provider` | tool |
| POST | `/verify-insurance-pre-visit` | `verify_insurance_pre_visit` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

18 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `create_insurance`
- `list_insurance`
- `create_intake_form`
- `create_patient`
- `get_intake_submission`
- `get_patient`
- `list_appointments`
- `list_consents`
- `list_intake_forms`
- `list_intake_submissions`
- `list_patients`
- `record_consent`
- `review_intake_submission`
- `schedule_appointment`
- `submit_intake`
- `flag_missing_consents`
- `summarize_intake_for_provider`
- `verify_insurance_pre_visit`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 18 entries above.

## Replaces

- Jotform HIPAA
- Phreesia
