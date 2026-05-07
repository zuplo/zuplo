import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { neonRepository } from "./neon.ts";
import { NotFoundError } from "./repository.ts";

/**
 * Integration test: validates the Neon HTTP adapter's SQL against a real
 * Postgres instance.
 *
 * The adapter calls `fetch(url, ...)` to talk to Neon's serverless HTTP
 * endpoint. In CI we substitute a local pg-backed shim that:
 *   - intercepts those POSTs (via a global `fetch` mock scoped to one URL)
 *   - parses `{ query, params }` out of the request body
 *   - executes the SQL through `pg.Client`
 *   - returns the rows in the shape the adapter expects
 *
 * This proves every SQL string the adapter constructs is valid Postgres SQL
 * and round-trips a tenant-scoped CRUD test through it.
 *
 * Skipped unless `KIT_TEST_PG_URL` is set (pointing at a service-container
 * Postgres). Locally:
 *   docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=kit -e POSTGRES_USER=kit -e POSTGRES_DB=kit postgres:16
 *   KIT_TEST_PG_URL=postgres://kit:kit@localhost:5432/kit npx vitest run
 */

interface Invoice {
  id: string;
  tenantId: string;
  amount: number;
  status: string;
  createdAt: string;
}

const PG_URL = process.env.KIT_TEST_PG_URL;
const SHIM_URL = "https://test.neon.local/sql";
const TABLE = "invoices_test";

const itIfPg = PG_URL ? it : it.skip;
const describeIfPg = PG_URL ? describe : describe.skip;

describeIfPg("neonRepository (Postgres-backed shim integration)", () => {
  let client: pg.Client;
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: PG_URL });
    await client.connect();
    await client.query(`drop table if exists ${TABLE}`);
    await client.query(`
      create table ${TABLE} (
        id text primary key,
        "tenantId" text not null,
        amount integer not null,
        status text not null,
        "createdAt" text not null
      )
    `);

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url !== SHIM_URL) return originalFetch(input as Request, init);

      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query: string;
        params?: unknown[];
      };
      const result = await client.query(body.query, body.params ?? []);
      const responseBody = {
        command: result.command,
        rowCount: result.rowCount,
        rows: result.rows,
        fields: result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })) ?? [],
      };
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (client) {
      await client.query(`drop table if exists ${TABLE}`);
      await client.end();
    }
  });

  function makeRepo() {
    return neonRepository<Invoice>("Invoice", {
      url: SHIM_URL,
      connectionString: PG_URL!,
      table: TABLE,
    });
  }

  itIfPg("create + get round-trips", async () => {
    const repo = makeRepo();
    const created = await repo.create("tenant-a", {
      id: "inv-1",
      amount: 100,
      status: "open",
      createdAt: "2026-01-01T00:00:00Z",
    } as Invoice);
    expect(created.id).toBe("inv-1");
    expect(created.tenantId).toBe("tenant-a");
    expect(created.amount).toBe(100);

    const fetched = await repo.get("tenant-a", "inv-1");
    expect(fetched).toEqual(created);
  });

  itIfPg("isolates by tenantId", async () => {
    const repo = makeRepo();
    await repo.create("tenant-a", {
      id: "inv-2",
      amount: 50,
      status: "open",
      createdAt: "2026-01-02T00:00:00Z",
    } as Invoice);

    expect(await repo.get("tenant-b", "inv-2")).toBeNull();
    expect(await repo.get("tenant-a", "inv-2")).not.toBeNull();
  });

  itIfPg("list filters by tenant + paginates", async () => {
    const repo = makeRepo();
    await client.query(`delete from ${TABLE}`);
    for (let i = 0; i < 5; i++) {
      await repo.create("tenant-x", {
        id: `inv-${i}`,
        amount: i * 10,
        status: "open",
        createdAt: `2026-01-0${i + 1}T00:00:00Z`,
      } as Invoice);
    }
    await repo.create("tenant-y", {
      id: "inv-other",
      amount: 999,
      status: "open",
      createdAt: "2026-01-09T00:00:00Z",
    } as Invoice);

    const page1 = await repo.list("tenant-x", { limit: 3 });
    expect(page1.items).toHaveLength(3);
    expect(page1.nextCursor).toBe("3");

    const page2 = await repo.list("tenant-x", { limit: 3, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();

    const allTenantX = [...page1.items, ...page2.items].map((i) => i.id).sort();
    expect(allTenantX).toEqual(["inv-0", "inv-1", "inv-2", "inv-3", "inv-4"]);
  });

  itIfPg("update + delete", async () => {
    const repo = makeRepo();
    await repo.create("tenant-u", {
      id: "inv-u",
      amount: 200,
      status: "open",
      createdAt: "2026-01-01T00:00:00Z",
    } as Invoice);

    const updated = await repo.update("tenant-u", "inv-u", { status: "paid" });
    expect(updated.status).toBe("paid");
    expect(updated.amount).toBe(200);

    await repo.delete("tenant-u", "inv-u");
    expect(await repo.get("tenant-u", "inv-u")).toBeNull();

    await expect(repo.delete("tenant-u", "inv-u")).rejects.toBeInstanceOf(NotFoundError);
  });
});
