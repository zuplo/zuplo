# Testing the Starter Kits

Every kit ships with a smoke test. The full 50-kit suite plus the shared
adapter unit tests run together via vitest workspaces.

## Quickstart

```bash
# from repo root
npm install
npm run test:starter-kits
```

That runs:

- `_shared` adapter unit tests (in-memory)
- A smoke test for every kit (`tests/smoke.test.ts`)
- `_template` smoke test (acts as a canary for new kits)

Expected: `52 passed` test files, `465 passed | 4 skipped` (the 4 are Postgres
integration tests, gated on `KIT_TEST_PG_URL`).

## What the smoke test verifies

`tests/smoke.test.ts` is the same generated three-line file in every kit:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runKitSmokeSuite } from "@zuplo/starter-kit-shared/testing";

runKitSmokeSuite(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
```

`runKitSmokeSuite()` lives in [`_shared/testing/smoke.ts`](./_shared/testing/smoke.ts).
It reads the kit's `config/routes.oas.json` and asserts:

1. **Required files exist** — `config/routes.oas.json`, `config/policies.json`, `package.json`
2. **Package is wired** — `package.json` depends on `@zuplo/starter-kit-shared`
3. **OpenAPI is valid JSON** with a `paths` object
4. **Two-layer MCP wiring agrees** — every operation tagged `mcp: { type: "tool" }` is in
   the `/mcp` route's `operations: [...]` array, and vice versa
5. **Every MCP tool has a description** — LLMs ground tool calls on this string
6. **All operationIds are snake_case action verbs** — `list_invoices`, `chase_overdue_invoices`,
   never UUIDs or `op1`
7. **All handler modules import cleanly** — catches typos, broken imports, dependency
   issues at the module-load level
8. **Each handler exports a default function** — Zuplo's wiring requires this

`_shared/testing/runtime-stub.ts` substitutes for `@zuplo/runtime` during
tests because the real package ships gateway-only initialization that crashes
in plain Node. The stub provides only what kits actually use (`environment`,
shape stubs for types).

## Postgres integration test

`_shared/adapters/postgres-integration.test.ts` validates the Neon HTTP
adapter against a real Postgres instance. It mocks `globalThis.fetch` so
the adapter's POSTs to `/sql` are intercepted and run as actual `pg` queries —
proving every SQL statement the adapter constructs is valid Postgres.

Run locally:

```bash
docker run --rm -d -p 5432:5432 \
  -e POSTGRES_USER=kit -e POSTGRES_PASSWORD=kit -e POSTGRES_DB=kit \
  postgres:16
KIT_TEST_PG_URL="postgres://kit:kit@localhost:5432/kit" \
  npm run test:starter-kits
```

In CI, the [`postgres-integration` job](../.github/workflows/starter-kits.yml)
runs this against a Postgres service container.

## Running a single kit's tests

```bash
cd starter-kits/<kit-slug>
npx vitest run
```

Kits do not install vitest themselves — they pick up the hoisted root copy.
The `vitest.config.ts` in each kit is a one-liner that re-exports the shared
config from `@zuplo/starter-kit-shared/testing/vitest.config`.

## CI — `.github/workflows/starter-kits.yml`

| Job | What it does | Required? |
|-----|--------------|-----------|
| `smoke` | Full 50-kit smoke suite + shared adapter tests + MCP layer verification | Yes |
| `typecheck` | `tsc --noEmit` on `_shared` and `_template` | Yes |
| `postgres-integration` | Neon-adapter SQL parity against local Postgres service | Yes |

Triggers on push to `main` and on PRs touching `starter-kits/**`.

## Adding a new kit

`_shared/generate-tests.mjs` regenerates `tests/smoke.test.ts` and
`vitest.config.ts` for every kit (idempotent — re-running rewrites them
exactly). Run it after creating a new kit directory:

```bash
node starter-kits/_shared/generate-tests.mjs
```

It also adds `vitest` as a `devDependency` in each kit's `package.json` if
missing. Then add the kit to `vitest.workspace.ts` in this directory and
to the root `package.json` workspaces array.

## Adding a kit-specific test

The smoke test is generic. To add behavior tests for your kit's handlers,
create `tests/<your-test>.test.ts` next to `smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeRequest, makeContext } from "@zuplo/starter-kit-shared/testing";
import createInvoice from "../modules/handlers/create-invoice.ts";

describe("create_invoice", () => {
  it("creates and returns 201", async () => {
    const request = makeRequest({
      url: "https://kit.test/invoices",
      method: "POST",
      body: { customerId: "cus_1", amount: 100 },
      tenantId: "tenant-a",
    });
    const { context } = makeContext();
    const response = await createInvoice(request, context);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.tenantId).toBe("tenant-a");
  });
});
```

Available helpers in `@zuplo/starter-kit-shared/testing`:

- `makeRequest(opts)` — build a `ZuploRequest` with `user.data.tenantId` populated
- `makeContext({ routes })` — `ZuploContext` whose `invokeRoute` dispatches to a route map (use this when testing orchestrator MCP tools that fan out to sibling endpoints)
- `runKitSmokeSuite(kitDir)` — the generic smoke-test factory used by every kit
