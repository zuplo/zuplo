# Starter Kit Shared Code (canonical)

Shared adapters, auth helpers, and MCP utilities used by every Zuplo Starter Kit.

This directory is the **single source of truth**. It is **not** a published or workspace-imported package — Zuplo kits ship self-contained, so each kit gets its own copy of the relevant files at `<kit>/modules/_shared/`. The vendoring is done by `regenerate-shared.mjs` (see below).

The `package.json` here exists only so the standalone tests in this directory (`adapters/in-memory.test.ts`, `adapters/postgres-integration.test.ts`) can run as part of `npm run test:starter-kits`.

## Vendoring into kits

```bash
# Edit any file under starter-kits/_shared/, then:
node starter-kits/_shared/regenerate-shared.mjs
```

The script:

1. Scans every kit for `@zuplo/starter-kit-shared/<sub>` imports (legacy form) or already-relative imports of the vendored copy.
2. Mirrors `_shared/{mcp,adapters,auth,testing}/` into `<kit>/modules/_shared/` — only the subpaths a kit actually uses.
3. Rewrites any remaining `@zuplo/starter-kit-shared/...` imports to relative paths pointing at the vendored copy.
4. Drops `@zuplo/starter-kit-shared` from each kit's `package.json` deps if present.

Re-running the script is idempotent — it produces the same output every time.

## Imports inside a kit

```ts
import {
  createRepository,
  inMemoryRepository,
  Entity,
  Repository,
  NotFoundError,
} from "../_shared/adapters/index.ts";

import { requireTenant } from "../_shared/auth/index.ts";

import { invokeJson, jsonResponse } from "../_shared/mcp/helpers.ts";
```

Path depth depends on where the importing file lives (`modules/handlers/`, `modules/mcp-tools/`, etc.). The regenerate script computes the correct relative path per file.

## Adapters

All adapters implement `Repository<T extends Entity>` and require `tenantId` on every method.

| Adapter | Module | Best for |
|---|---|---|
| `inMemoryRepository` | `./adapters/in-memory` | Tests, local dev |
| `supabaseRepository` | `./adapters/supabase` | General Postgres (HTTP via PostgREST) |
| `firestoreRepository` | `./adapters/firestore` | Document/hierarchical data |
| `clickhouseRepository` | `./adapters/clickhouse` | Events, analytics, time-series |
| `upstashRedisRepository` | `./adapters/upstash-redis` | KV, queues, ephemeral state |
| `neonRepository` | `./adapters/neon` | Postgres without Supabase (HTTP serverless) |

The `createRepository(config)` factory in `adapters/index.ts` chooses the right adapter from a `RepositoryConfig`. Kits resolve config from environment variables and pass it in once at module-load time.

## Edge runtime constraint

All adapters are HTTP-only. **Never** add a TCP-based driver (`pg`, native `mongodb`, `@cloudflare/d1`, etc.). Kits run in Zuplo's edge runtime which has no socket access.

## Auth

`requireTenant(request)` throws `TenantMissingError` if the request doesn't carry a tenantId from the `api-key-inbound` policy. Use it at the top of every CRUD handler.

`tenantErrorResponse()` returns a standard 401 body if you want to convert the error in a try/catch.

## MCP helpers

`invokeJson(context, path, init?)` is the canonical way for orchestrator tools to call sibling routes. It uses `context.invokeRoute` and parses JSON, throwing on non-2xx — so orchestrator code reads top-down without nested error handling.
