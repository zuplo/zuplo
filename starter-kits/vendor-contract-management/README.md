# Vendor & Contract Management Starter Kit

A real procurement-meets-CLM spine: log vendors and contracts, send draft contracts to DocuSign for signature, and notify the procurement Slack channel every time something changes.

Replaces: Vendr, Tropic, Ironclad-lite.

## Wires up

- **DocuSign** executes the contract: `send_contract_for_signature` mints a JWT-grant token, creates an envelope from the contract's documentUrl (or inline base64), invites the vendor + internal signers, and stamps the envelope id back onto the contract.
- **Slack** broadcasts to `#procurement`: every new vendor (`create_vendor`), every uploaded contract (`create_contract`), and every signature send-out gets a Slack post with the relevant context.

> **No renewal cron.** Zuplo's edge runtime is stateless and intentionally has no scheduled-task primitive. To get renewal-reminder emails, run `flag_upcoming_renewals` on a daily cadence from your own scheduler (GitHub Actions, EventBridge, Vercel Cron) and pipe the result into Resend / Slack. We ship `flag_upcoming_renewals` so you have the data the cron needs.

## Architecture at a glance

```
                 ┌──── create_vendor ─────────┐
                 │                            ▼
                 ├──── create_contract ──► Slack #procurement
Procurement / ───┤                            ▲
agent caller     │                            │
                 └──── send_contract_for      │
                       _signature ───────────┘
                              │
                              ▼
                         DocuSign envelope
                          (JWT grant flow)
```

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/vendor-contract-management
cd starter-kits/vendor-contract-management
cp env.example .env
npm install
npm run dev
```

Connect an MCP inspector at `http://localhost:9000/mcp`.

## Choosing a database

| Adapter | Status |
|---|---|
| `in-memory` | Default |
| `supabase` | Supported |
| `firestore` | Supported |
| `upstash-redis` | Supported |
| `neon` | Supported |

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER` you'll need:

- **DocuSign** (`DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_PRIVATE_KEY`) for envelope creation
- **Slack** (`SLACK_BOT_TOKEN` or `SLACK_WEBHOOK_URL`) for procurement notifications

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/contracts` | List contracts |
| POST | `/contracts` | Create contract (Slack notify) |
| GET | `/contracts/{id}` | Get contract |
| PATCH | `/contracts/{id}` | Update contract |
| POST | `/contracts/{id}/terminate` | Terminate (destructive) |
| GET | `/vendors` | List vendors |
| POST | `/vendors` | Create vendor (Slack notify) |
| GET | `/vendors/{id}` | Get vendor |
| GET | `/renewals` | List renewals |
| POST | `/renewals` | Schedule renewal |
| GET | `/risk-assessments` | List assessments |
| POST | `/risk-assessments` | Record assessment |
| GET | `/spend` | List spend records |
| POST | `/send-contract-for-signature` | Orchestrator: DocuSign envelope + Slack |
| POST | `/flag-upcoming-renewals` | Orchestrator: renewals on the horizon |
| POST | `/compare-vendor-pricing` | Orchestrator: vendor pricing in a category |
| POST | `/calc-total-spend` | Orchestrator: spend rollup |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_contracts` | yes | DB | List contracts |
| `get_contract` | yes | DB | Get a contract |
| `create_contract` | no | DB + Slack | Create a contract + procurement notify |
| `update_contract` | no | DB | Patch contract fields |
| `terminate_contract` | destructive | DB | Move contract to terminated |
| `list_vendors` | yes | DB | List vendors |
| `get_vendor` | yes | DB | Get a vendor |
| `create_vendor` | no | DB + Slack | Register a vendor + procurement notify |
| `list_renewals` | yes | DB | List renewals |
| `schedule_renewal` | no | DB | Schedule a renewal |
| `list_risk_assessments` | yes | DB | List assessments |
| `record_assessment` | no | DB | Record an assessment |
| `list_spend` | yes | DB | List spend records |
| `send_contract_for_signature` | no | DocuSign + DB + Slack | Send for signature, stamp envelope id |
| `flag_upcoming_renewals` | yes | DB | Renewals approaching their notice window |
| `compare_vendor_pricing` | yes | DB | Vendor pricing in a category |
| `calc_total_spend` | yes | DB | Spend rollup |

## The AI angle

`send_contract_for_signature` is the orchestrator that turns this from a contracts CRUD into a procurement automation. From an MCP client (or a procurement agent), one tool call:

1. Reads the draft contract.
2. Looks up the vendor's contact email (and adds them as a signer by default).
3. Mints a DocuSign access token via the JWT grant flow — service-account auth that doesn't require a user OAuth dance from an edge handler.
4. Creates the envelope from `contract.documentUrl` or inline base64, with anchor-based sign-here tabs (`/sn1/`).
5. Stamps the envelope id back onto the contract for cross-reference.
6. Posts a Slack notice to procurement so legal / finance can track the in-flight signature.

To close the loop on signed status, configure a DocuSign Connect webhook back to `/webhooks/docusign` (drop in your own handler) that flips `contract.status` to `active` when the envelope completes.

## Extending

- **Renewal reminders**: run `flag_upcoming_renewals` from your scheduler of choice (GitHub Actions, EventBridge, Vercel Cron) once a day, then pipe results into Resend or Slack. The kit deliberately doesn't include cron — Zuplo's edge runtime is stateless.
- **Swap DocuSign for HelloSign / Adobe Sign**: drop in a `dropbox-sign.ts` integration with the same `createEnvelope({ contractId, documentName, signers })` shape. Only `send-contract-for-signature.ts` imports it.
- **Auto-build the document**: integrate a doc generator (e.g. Docupilot, PandaDoc API) to produce the PDF inline before the DocuSign call so contract.documentUrl isn't a manual upload step.
- **Switch databases**: change `DB_PROVIDER` in `.env`.
