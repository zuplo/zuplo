# Zuplo Starter Kits — Conventions

Every kit in this directory conforms to the same shape. This file is the contract.

## Kit structure

```
<kit-name>/
├── config/
│   ├── routes.oas.json     # OpenAPI + x-zuplo-route + MCP annotations
│   └── policies.json       # api-key-inbound, rate-limit, prompt-injection-outbound, secret-masking-outbound
├── modules/
│   ├── _shared/            # GENERATED — vendored copy of starter-kits/_shared/. Do not hand-edit.
│   ├── handlers/           # one file per CRUD endpoint
│   ├── mcp-tools/          # orchestrator tools — use context.invokeRoute() to call sibling routes
│   ├── domain/             # pure business logic (no I/O)
│   └── repositories/       # entity repositories that depend on the Repository<T> adapter
├── docs/                   # zudoku site (optional)
├── tests/                  # vitest, in-memory adapter
├── env.example
├── README.md               # follows the README contract below
├── CLAUDE.md
├── AGENTS.md
├── package.json
├── tsconfig.json
└── zuplo.jsonc
```

## MCP wiring (two-layer opt-in)

**MCP exposure is not automatic from OpenAPI.** Both layers must agree per tool:

**Layer 1 — annotation on the operation:**

```json
"x-zuplo-route": {
  "handler": { "export": "default", "module": "$import(./modules/handlers/create-invoice)" },
  "policies": { "inbound": ["api-key-inbound", "rate-limit"] },
  "mcp": {
    "type": "tool",
    "annotations": { "readOnlyHint": false }
  }
}
```

Use `annotations.readOnlyHint: true` on read endpoints, `destructiveHint: true` on DELETE/cancel/void, `idempotentHint: true` on upsert/PUT.

**Layer 2 — registration in the `/mcp` handler's `operations` array:**

```json
"options": {
  "name": "<kit-name>-server",
  "version": "1.0.0",
  "operations": [
    { "file": "./config/routes.oas.json", "id": "create_invoice" }
  ]
}
```

Use the `operations: [{ file, id }]` form — not the legacy `openApiFilePaths` form.

## Tool design rules

- `operationId` is the tool name. Use snake_case action verbs: `get_invoice`, `list_invoices`, `chase_overdue_invoices`. Never UUIDs or `op1`.
- Every operation gets a `description`. The LLM grounds on this.
- Every schema property gets a `description`. Bare `{ type: "string" }` wastes a slot.
- Validation is automatic — Zuplo validates request bodies against the OpenAPI schema before invoking handlers. Don't re-validate in TS.
- Curate. Each kit ships **5–8 CRUD tools** (only the ones an agent needs) plus **3–5 orchestrator tools** (the "AI angle").
- Orchestrator handlers stay inside the gateway: use `context.invokeRoute("/internal/...")` rather than `fetch` to a public URL.

## Default policy stack

```json
{
  "/api/*": {
    "inbound": ["api-key-inbound", "rate-limit"]
  },
  "/mcp": {
    "inbound": ["api-key-inbound", "rate-limit"],
    "outbound": ["prompt-injection-outbound", "secret-masking-outbound"]
  }
}
```

The two outbound policies are built-in Zuplo defenses for MCP traffic. Leave them on.

## Vendored shared code

Each kit ships self-contained: it does **not** import a workspace package. Common code lives in `starter-kits/_shared/` and is vendored into every kit at `<kit>/modules/_shared/`. Imports inside a kit use relative paths to that vendored copy (e.g. `../_shared/auth/index.ts`).

- `modules/_shared/` is **generated** — never hand-edit it. Edit the canonical files in `starter-kits/_shared/` instead.
- After editing `_shared/`, run `node starter-kits/_shared/regenerate-shared.mjs` to re-vendor into every kit.
- The script also drops `@zuplo/starter-kit-shared` from each kit's `package.json` if it sneaks back in, so a kit's deps stay clean.
- A new kit copied from `_template` already has `modules/_shared/` populated; running the script keeps it in sync.

## Auth and multi-tenancy

- API key metadata stores `tenantId`
- `request.user.data.tenantId` is the tenant for the request
- Helper: `import { requireTenant } from "../_shared/auth/index.ts";` (vendored — see "Vendored shared code" below)
- Every repository call requires a `tenantId` argument — the type system enforces this

## Database adapters

Every kit picks adapters from `../_shared/adapters/index.ts` (vendored). Available:

- `supabaseRepository` — PostgREST HTTP
- `firestoreRepository` — Firestore REST
- `clickhouseRepository` — ClickHouse HTTP (events/analytics)
- `upstashRedisRepository` — Upstash Redis REST (KV/queues)
- `neonRepository` — Neon HTTP serverless driver
- `inMemoryRepository` — for tests

Pick which adapter to use via the `DB_PROVIDER` env var. A kit doesn't have to support all five — declare supported adapters in the kit's README.

## Per-kit README contract

Every kit's README has these headings, in order:

1. What it is + replaces what
2. Quickstart
3. Choosing a database (matrix of supported adapters)
4. Environment variables
5. API surface
6. MCP tools
7. The AI angle (one paragraph)
8. Extending

## Tests

- Vitest with `inMemoryRepository`
- Fixture-based tests for each MCP custom (orchestrator) tool
- Optional integration tests gated on env vars (e.g. `SUPABASE_URL`)

## Common commands

- `npm run dev` — local dev server (`http://localhost:9000`)
- `npm run test` — vitest
- `zuplo deploy` — deploy to Zuplo cloud
