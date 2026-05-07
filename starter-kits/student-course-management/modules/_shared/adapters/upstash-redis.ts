import {
  Adapter,
  AdapterCapabilities,
  Entity,
  EntityCreate,
  EntityUpdate,
  ListQuery,
  NotFoundError,
  Page,
  Repository,
} from "./repository.ts";

/**
 * Upstash Redis adapter — uses the Upstash REST API.
 *
 * Best for KV-shaped data (tokens, counters, sessions, queues, rate-limits)
 * and small ephemeral document storage. Not appropriate for relational data
 * or analytical queries.
 *
 * Storage layout:
 *   key:    {keyPrefix}:{tenantId}:doc:{id}              (JSON-stringified entity)
 *   index:  {keyPrefix}:{tenantId}:index                 (Redis SET of all ids for the tenant)
 *
 * Filtering is done client-side after fetching all docs in the tenant set.
 * For tenants with many entities, prefer Supabase or Firestore.
 */

export interface UpstashRedisRepositoryOptions {
  /** Upstash REST URL, e.g. https://us1-xxx.upstash.io */
  url: string;
  /** Upstash REST token (per-database). */
  token: string;
  /** Key prefix for this entity, e.g. "invoices". */
  keyPrefix: string;
}

export function upstashRedisRepository<T extends Entity>(
  entityName: string,
  options: UpstashRedisRepositoryOptions,
): Repository<T> & Adapter {
  const { url, token, keyPrefix } = options;
  const baseUrl = url.replace(/\/$/, "");

  function docKey(tenantId: string, id: string) {
    return `${keyPrefix}:${tenantId}:doc:${id}`;
  }

  function indexKey(tenantId: string) {
    return `${keyPrefix}:${tenantId}:index`;
  }

  async function command<R>(...args: (string | number)[]): Promise<R> {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { result: R };
    return body.result;
  }

  async function pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await fetch(`${baseUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { result: unknown }[];
    return body.map((b) => b.result);
  }

  const capabilities: AdapterCapabilities = {
    transactions: false, // pipeline isn't fully transactional
    fullTextSearch: false,
    aggregations: "none",
  };

  return {
    capabilities,

    async get(tenantId, id) {
      const value = await command<string | null>("GET", docKey(tenantId, id));
      return value ? (JSON.parse(value) as T) : null;
    },

    async list(tenantId, query = {}) {
      const ids = (await command<string[]>("SMEMBERS", indexKey(tenantId))) ?? [];
      if (ids.length === 0) return { items: [], nextCursor: null };

      const cmds = ids.map((id) => ["GET", docKey(tenantId, id)]);
      const results = (await pipeline(cmds)) as (string | null)[];
      let items = results
        .filter((s): s is string => typeof s === "string")
        .map((s) => JSON.parse(s) as T);

      if (query.where) {
        items = items.filter((item) => {
          for (const [k, v] of Object.entries(query.where!)) {
            if ((item as Record<string, unknown>)[k] !== v) return false;
          }
          return true;
        });
      }
      if (query.orderBy) {
        const { field, direction } = query.orderBy;
        items.sort((a, b) => {
          const av = a[field];
          const bv = b[field];
          if (av === bv) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av < bv ? -1 : 1) * (direction === "asc" ? 1 : -1);
        });
      }

      const limit = query.limit ?? 50;
      const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
      const slice = items.slice(offset, offset + limit);
      const nextCursor =
        offset + slice.length < items.length ? String(offset + slice.length) : null;
      return { items: slice, nextCursor };
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      const item = { ...(data as object), id, tenantId } as T;
      await pipeline([
        ["SET", docKey(tenantId, id), JSON.stringify(item)],
        ["SADD", indexKey(tenantId), id],
      ]);
      return item;
    },

    async update(tenantId, id, patch) {
      const existing = await command<string | null>("GET", docKey(tenantId, id));
      if (!existing) throw new NotFoundError(entityName, id);
      const merged = { ...(JSON.parse(existing) as T), ...patch, id, tenantId } as T;
      await command<"OK">("SET", docKey(tenantId, id), JSON.stringify(merged));
      return merged;
    },

    async delete(tenantId, id) {
      const existed = await command<number>("EXISTS", docKey(tenantId, id));
      if (!existed) throw new NotFoundError(entityName, id);
      await pipeline([
        ["DEL", docKey(tenantId, id)],
        ["SREM", indexKey(tenantId), id],
      ]);
    },
  };
}
