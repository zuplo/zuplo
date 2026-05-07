# @zuplo/starter-kit-shared

Shared adapters, auth helpers, and MCP utilities used by every Zuplo Starter Kit.

This is a workspace package — kits import it as a local dependency in the monorepo. When a developer forks an individual kit via `npx create-zuplo-api@latest --example starter-kits/<name>`, the scaffold copies the relevant pieces into the kit so the fork is self-contained.

## Imports

```ts
import {
  createRepository,
  inMemoryRepository,
  Entity,
  Repository,
  NotFoundError,
} from "@zuplo/starter-kit-shared/adapters";

import { requireTenant } from "@zuplo/starter-kit-shared/auth";

import { invokeJson, jsonResponse } from "@zuplo/starter-kit-shared/mcp";
```

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
