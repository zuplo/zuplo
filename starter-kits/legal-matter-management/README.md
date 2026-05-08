# Legal Matter Management API

Headless matter management for law firms with the actual workflow plumbing wired in: send engagement letters via DocuSign, drop court deadlines onto an attorney's Google Calendar, mail status letters via Resend, and let an MCP-aware assistant orchestrate it all.

Replaces: Clio, MyCase, PracticePanther.

## Wires up

DocuSign sends and tracks signature envelopes (`send_for_signature`); the inbound `/webhooks/docusign` route receives Connect events (HMAC-signed) and updates the local `signature_envelopes` row so a Claude Desktop session can ask "is the engagement letter signed?" without ever calling DocuSign. Google Calendar receives every deadline created via `add_deadline` so a court date is on the lead attorney's calendar the moment it's logged. Resend ships the `draft_status_letter_to_client` orchestrator's output to the client when the agent flips `send: true`.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Handlers
                │                  ├── add_deadline           ──▶ Google Calendar
                │                  ├── complete_deadline      ──▶ Google Calendar (delete)
                │                  └── DB adapter (matters, deadlines, envelopes)
                │
                ▼
         /mcp ──▶ MCP server ──▶ orchestrator tools
                                   ├── send_for_signature     ──▶ DocuSign envelopes.create
                                   ├── draft_status_letter_to_client ──▶ Resend (when send=true)
                                   ├── summarize_matter_status
                                   └── check_conflict_before_intake
                ▼
         /webhooks/docusign ──▶ verify HMAC ──▶ update signature_envelopes
```

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/legal-matter-management
cd legal-matter-management
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

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`.

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- **DocuSign** — `DOCUSIGN_BASE_URL` (e.g. `https://demo.docusign.net`), `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_ACCESS_TOKEN` (refresh externally), `DOCUSIGN_CONNECT_SECRET` (HMAC secret you configure on the Connect listener).
- **Google Calendar** — `GOOGLE_CALENDAR_ACCESS_TOKEN`, optional `GOOGLE_CALENDAR_ID`.
- **Resend** — `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

If any integration is unset and a request still calls it, the kit returns the persisted record with a `*_Error` field describing what failed; the caller can retry without losing data.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clients` | List clients |
| GET | `/clients/{id}` | Get a client |
| POST | `/clients` | Create a client |
| GET | `/matters` | List matters |
| GET | `/matters/{id}` | Get a matter |
| POST | `/matters` | Open a matter |
| PATCH | `/matters/{id}/close` | Close a matter |
| GET | `/documents` | List matter documents |
| POST | `/documents` | Attach a document |
| GET | `/deadlines` | List deadlines |
| POST | `/deadlines` | Add a deadline (creates Google Calendar event) |
| PATCH | `/deadlines/{id}/complete` | Mark deadline complete (deletes Calendar event) |
| GET | `/time-entries` | List time entries |
| POST | `/time-entries` | Log a time entry |
| GET | `/conflicts` | List conflict-check records |
| POST | `/conflicts` | Record a conflict check |
| POST | `/check-conflict-before-intake` | Orchestrator: pre-flight intake screen |
| POST | `/summarize-matter-status` | Orchestrator: matter status summary |
| POST | `/draft-status-letter-to-client` | Orchestrator: draft and (optionally) send the status letter via Resend |
| POST | `/send-for-signature` | Orchestrator: create a DocuSign envelope for the client |
| POST | `/webhooks/docusign` | Inbound: DocuSign Connect status updates (HMAC-signed) |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Verifies | Purpose |
|---|---|---|
| `/webhooks/docusign` | HMAC SHA-256 of raw body using `DOCUSIGN_CONNECT_SECRET` (header `X-DocuSign-Signature-1`, base64) | Updates the local `signature_envelopes` row's status (sent → delivered → completed → voided). The `tenantId` is read from a custom field the kit attaches on send, so events route to the right tenant without being authenticated. |

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| CRUD: `list_clients`, `get_client`, `create_client`, `list_matters`, `get_matter`, `open_matter`, `close_matter`, `list_documents`, `upload_document`, `list_deadlines`, `add_deadline`, `complete_deadline`, `list_time_entries`, `log_time_entry`, `list_conflicts`, `run_conflict_check` | DB | Standard reads/writes. `add_deadline` and `complete_deadline` also call Google Calendar. |
| `check_conflict_before_intake` | DB | Pre-flight intake conflict screen. |
| `summarize_matter_status` | DB | One-screen matter status. |
| `draft_status_letter_to_client` | DB + Resend (when `send=true`) | Build a structured status letter and optionally send via Resend. |
| `send_for_signature` | DB + DocuSign | Create a DocuSign envelope for a matter document with the client (and optional extra signers) in routing order. Persists a tracker row that the inbound webhook updates. |

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

`send_for_signature` is the headline. Drop the engagement letter (or any matter document) on the client for signature in one MCP call from a Claude Desktop session — the kit creates the envelope, persists the tracker, and DocuSign Connect updates the status without you having to poll. Pair with `summarize_matter_status` to give the agent the rest of the picture, and `draft_status_letter_to_client` to mail the client an update through Resend.

Behind the scenes, `add_deadline` keeps every court / client / internal deadline visible on a calendar — so the firm can't miss a date hidden in the database.

## Extending

- **Swap DocuSign for Adobe Sign / HelloSign**: replace `modules/integrations/docusign.ts` with the alternate provider's REST API. The orchestrator's `createDocuSignEnvelope(...)` call is the only touchpoint.
- **Calendar provider**: swap `modules/integrations/google-calendar.ts` for an Outlook/Microsoft Graph version.
- **Email provider**: replace `modules/integrations/resend.ts` with Postmark/SendGrid.
- **New entity** (e.g. `Invoice`, `TrustAccount`): add it to `modules/repositories/matters.ts`, then add a CRUD route in `routes.oas.json`.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.
