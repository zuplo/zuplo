# Patient Intake / Healthcare Admin API

Headless patient-intake API that does the actual work — eligibility checks against payers, identity-gated intake submission, and signed consent forms — exposed as both an HTTP API and an MCP server.

Replaces: Jotform HIPAA, Phreesia, JotForm + manual phone-back patterns.

> **HIPAA note.** This kit handles PHI and is not a substitute for a HIPAA program. You're responsible for BAAs with Stedi, DocuSign, Twilio, your database provider, and Zuplo. Configure access logging, retention, and minimum-necessary controls in your tenant. Don't ship to production without a HIPAA review.

## Wires up

- **Stedi** — real-time 270/271 eligibility checks against the patient's payer. Replaces "call BCBS at 8am the day of."
- **Twilio Verify** — one-time SMS code that gates `/intake/{id}/submit`. A stolen `patientId` alone can't submit.
- **DocuSign eSignature** — sends a templated HIPAA / treatment / telehealth consent envelope to the patient. The DocuSign Connect webhook materializes a `Consent` row when the envelope completes.

## Architecture at a glance

```
Front desk / patient ──▶ Zuplo Gateway ──▶ Integration handlers
                              │                  ├── Stedi      (verify_insurance_pre_visit)
                              │                  ├── Twilio     (start_intake_verification + submit_intake)
                              │                  └── DocuSign   (send_consent_envelope + /webhooks/docusign)
                              ▼
                      Database adapter (Supabase / Firestore / Neon / Upstash)
```

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

| `DB_PROVIDER` | Adapter |
|---|---|
| `in-memory` | In-Memory (tests/local) — default |
| `supabase` | Supabase (PostgREST) |
| `firestore` | Firestore (REST) |
| `neon` | Neon (HTTP serverless) |
| `upstash-redis` | Upstash Redis (REST) |

The kit boots with `in-memory` so you can try it without credentials before wiring up storage. **Don't run real PHI through `in-memory` — it's stored in process memory and not encrypted at rest.**

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll need credentials for:

- `STEDI_API_KEY`, `STEDI_PROVIDER_NPI`, `STEDI_PROVIDER_ORG_NAME`
- `DOCUSIGN_ACCESS_TOKEN`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_BASE_URL`, `DOCUSIGN_HMAC_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`

Tools that depend on a missing key will throw clearly. `verify_insurance_pre_visit` falls back to stored eligibility flags if `STEDI_API_KEY` is unset; `submit_intake` skips the OTP gate if `TWILIO_VERIFY_SERVICE_SID` is unset (dev mode).

## API surface

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/appointment/{id}/schedule` | `schedule_appointment` | tool |
| GET | `/appointments` | `list_appointments` | tool |
| POST | `/consent` | `record_consent` | tool |
| GET | `/consents` | `list_consents` | tool |
| POST | `/consent/send-envelope` | `send_consent_envelope` | tool |
| POST | `/flag-missing-consents` | `flag_missing_consents` | tool |
| GET | `/insurance` | `list_insurance` | tool |
| POST | `/insurance` | `create_insurance` | tool |
| POST | `/intake-form` | `create_intake_form` | tool |
| GET | `/intake-forms` | `list_intake_forms` | tool |
| GET | `/intake-submission/{id}` | `get_intake_submission` | tool |
| GET | `/intake-submissions` | `list_intake_submissions` | tool |
| POST | `/intake/{id}/submit` | `submit_intake` | tool |
| POST | `/intake/start-verification` | `start_intake_verification` | tool |
| POST | `/patient` | `create_patient` | tool |
| GET | `/patient/{id}` | `get_patient` | tool |
| GET | `/patients` | `list_patients` | tool |
| POST | `/review-intake-submission` | `review_intake_submission` | tool |
| POST | `/summarize-intake-for-provider` | `summarize_intake_for_provider` | tool |
| POST | `/verify-insurance-pre-visit` | `verify_insurance_pre_visit` | tool |
| POST | `/webhooks/docusign` | `webhook_docusign` | — |
| POST | `/mcp` | `mcp_handler` | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Provider | Behavior |
|---|---|---|
| `POST /webhooks/docusign` | DocuSign Connect | Verifies `x-docusign-signature-1` HMAC, parses `envelope-completed` events, records a `Consent` row from the envelope's prefill metadata. |

Configure DocuSign Connect to POST `envelope-completed` to `https://<your-zuplo>/webhooks/docusign` and set `DOCUSIGN_HMAC_KEY` to the shared secret from the Connect listener.

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| `verify_insurance_pre_visit` | Stedi | Walk upcoming appointments, run live 270/271 eligibility per insurance plan, surface gaps. |
| `start_intake_verification` | Twilio Verify | Send an SMS OTP to the patient on file. |
| `submit_intake` | Twilio Verify | Reject the submission unless the OTP from `start_intake_verification` validates. |
| `send_consent_envelope` | DocuSign | Send a HIPAA / treatment / telehealth consent envelope (email or embedded signing URL). |
| `summarize_intake_for_provider` | — | Joins submission + form + patient and shapes a provider-facing summary. |
| `flag_missing_consents` | — | Cross-checks consents on file vs. policy. |

Plus the CRUD tools: `list_patients`, `get_patient`, `create_patient`, `list_insurance`, `create_insurance`, `list_intake_forms`, `create_intake_form`, `list_intake_submissions`, `get_intake_submission`, `review_intake_submission`, `list_appointments`, `schedule_appointment`, `list_consents`, `record_consent`.

## The AI angle

`verify_insurance_pre_visit` is the canonical orchestrator: an agent (or a 5am cron-replacement that fires the route on schedule) walks every appointment in the next N days, hits Stedi for each plan on file, and returns a structured list of which patients need someone to call them today. The agent decides what to do — draft a call list, send a reminder, or flag for the office manager — but the eligibility data is real, not fake.

The same agent gets two more concrete tools: `start_intake_verification` to dispatch an SMS OTP when a patient claims to be on the line, and `send_consent_envelope` to fire the right DocuSign template based on visit type. None of these are nice-to-haves: each one replaces a tab someone keeps open all day.

## Extending

- **Swap eligibility provider.** Replace `modules/integrations/stedi.ts` with Change Healthcare or Availity. The orchestrator only depends on the `checkStediEligibility` shape.
- **Swap signature provider.** Replace `modules/integrations/docusign.ts` with Dropbox Sign or Adobe Sign — keep the `sendDocuSignEnvelope` / `getDocuSignSigningUrl` signatures and the webhook handler shape.
- **Replace SMS OTP with passkey or one-tap email link.** Drop in a different `modules/integrations/twilio.ts` and update `submit-intake.ts`.
- **Add a clinic kiosk.** Use `embeddedSigning: true` on `/consent/send-envelope` to render the signing flow inside an iframe on a tablet. The Connect webhook still records the consent on completion.
- **Switch databases.** Change `DB_PROVIDER` in `.env`. Handler code never changes.
