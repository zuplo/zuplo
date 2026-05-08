# Status Page API

A real fanout-driven status page: Datadog opens incidents, this gateway records them, then blasts subscribers across SMS (Twilio), email (Resend), and per-customer Slack channels — each subscriber picks their own delivery channels.

Replaces: Statuspage.io, Instatus, Atlassian Statuspage.

## Wires up

- **Datadog** → `/webhooks/datadog` opens an incident on `Triggered` (and resolves on `Recovered`), bumps affected components to `degraded` / `partial_outage` / `major_outage` based on a `severity:` tag, then triggers fanout.
- **Twilio** sends SMS to subscribers with `channels: ["sms"]` and a phone number.
- **Resend** emails subscribers with `channels: ["email"]`.
- **Slack** posts to per-subscriber webhook URLs for subscribers with `channels: ["slack"]` (e.g. enterprise customers get updates piped into their `#vendor-status` channel).

## Architecture at a glance

```
Datadog ─▶ POST /webhooks/datadog
              │
              ▼
       Zuplo Gateway
              │
   ┌──────────┼──────────────┐
   ▼          ▼              ▼
Incidents  Components     fanoutToSubscribers
   DB      DB (status)            │
              │      ┌────────────┼────────────┐
              ▼      ▼            ▼            ▼
            Public  Twilio     Resend       Slack
            Page     SMS        email       webhook
```

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/status-page
cd starter-kits/status-page
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
| `clickhouse` | Supported |
| `upstash-redis` | Supported |
| `neon` | Supported |

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER` the kit needs:

- **Datadog** (`DATADOG_WEBHOOK_SECRET`) for inbound monitor verification
- **Twilio** (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) for SMS fanout
- **Resend** (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) for email fanout
- **Slack** is per-subscriber by default; the global `SLACK_WEBHOOK_URL` / `SLACK_BOT_TOKEN` are only used when a subscriber lacks a webhook URL.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/components` | List components in display order |
| POST | `/components` | Register a new component |
| GET | `/components/{id}` | Get a component |
| PATCH | `/components/{id}/status` | Update a component's status |
| GET | `/incidents` | List incidents |
| POST | `/incidents` | Open a new incident (triggers fanout) |
| GET | `/incidents/{id}` | Get an incident |
| POST | `/incidents/{id}/updates` | Post a timeline update (triggers fanout) |
| PATCH | `/incidents/{id}/resolve` | Mark an incident resolved |
| GET | `/maintenance` | List maintenance windows |
| POST | `/maintenance` | Schedule a maintenance window |
| PATCH | `/maintenance/{id}/complete` | Mark a maintenance window complete |
| GET | `/subscribers` | List subscribers |
| POST | `/subscribers` | Add a subscriber (with channel preferences) |
| DELETE | `/subscribers/{id}` | Remove a subscriber |
| POST | `/open-incident-from-alert` | Orchestrator: open + announce + degrade |
| POST | `/draft-customer-update` | Orchestrator: draft a customer update |
| POST | `/post-postmortem-summary` | Orchestrator: post a final postmortem |
| POST | `/webhooks/datadog` | Datadog monitor → incident + fanout |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Provider | Notes |
|---|---|---|
| `POST /webhooks/datadog` | Datadog Webhooks integration | HMAC-SHA256 (`x-datadog-signature`). Tag the monitor with `severity:<minor\|major\|critical>` and one or more `component:<slug>` tags. `Triggered` → open + fanout; `Recovered` → resolve + fanout. |

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_components` | yes | DB | List components |
| `get_component` | yes | DB | Get a component |
| `create_component` | no | DB | Register a component |
| `update_component_status` | idempotent | DB | Change a component's status |
| `list_incidents` | yes | DB | List incidents |
| `get_incident` | yes | DB | Get an incident |
| `open_incident` | no | DB + Twilio + Resend + Slack | Open an incident, fan out to subscribers |
| `post_incident_update` | no | DB + Twilio + Resend + Slack | Append timeline update, fan out |
| `resolve_incident` | idempotent | DB | Mark an incident resolved |
| `list_maintenance` | yes | DB | List maintenance windows |
| `schedule_maintenance` | no | DB | Schedule maintenance |
| `complete_maintenance` | idempotent | DB | Complete maintenance |
| `list_subscribers` | yes | DB | List subscribers |
| `add_subscriber` | no | DB | Add a subscriber + channel preferences |
| `remove_subscriber` | destructive | DB | Remove a subscriber |
| `open_incident_from_alert` | no | DB + fanout | Orchestrator: open + announce + degrade |
| `draft_customer_update` | yes | DB | Draft a ready-to-post update |
| `post_postmortem_summary` | no | DB + fanout | Final postmortem update |

## The AI angle

The end-to-end story:

1. Datadog fires a monitor tagged `severity:major component:api component:dashboard`.
2. `/webhooks/datadog` verifies the HMAC, opens an incident in `investigating`, bumps both components to `partial_outage`, and triggers fanout.
3. `fanoutToSubscribers` walks every subscriber, filters by `notifyOnImpact` and component scope, then dispatches to each subscriber's enabled channels in parallel — Twilio SMS for ops oncall, Resend email for product PMs, Slack webhooks into customer workspaces.
4. As humans (or `post_incident_update`) post updates, fanout repeats with a stable `dedupKey` (`incident:<id>:update:<update id>`) so MCP-driven agents can re-broadcast safely.

When the underlying alert recovers, Datadog sends a `Recovered` event and the same webhook closes the loop: status flips to resolved and a final fanout goes out.

## Extending

- **Add a new channel**: drop a `pushover.ts` (or whatever) integration alongside `twilio.ts`, register the channel in the Subscriber type, and add a case in `fanout.ts`.
- **Re-publish to a static page**: push every status change to a Cloudflare Worker / Durable Object so the public page is read-only and globally cached.
- **Customer-portal opt-in**: add a verification flow on `add_subscriber` (Twilio Verify or a magic-link via Resend) before activating SMS / email.
- **Switch databases**: change `DB_PROVIDER` in `.env`.
