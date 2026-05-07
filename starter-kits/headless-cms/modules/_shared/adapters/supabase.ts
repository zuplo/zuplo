import {
  Adapter,
  AdapterCapabilities,
  ConflictError,
  Entity,
  EntityCreate,
  EntityUpdate,
  ListQuery,
  NotFoundError,
  Page,
  Repository,
} from "./repository.ts";

/**
 * Supabase adapter — uses PostgREST over HTTP.
 *
 * Tables must have `id text primary key default gen_random_uuid()` and a
 * `tenant_id text not null` column. Recommended: enable RLS and add a policy
 * `tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id'`
 * to enforce isolation at the database. The adapter still passes `tenant_id`
 * as a hard filter regardless.
 *
 * Field naming: TypeScript uses camelCase, the database uses snake_case. The
 * adapter does NOT translate — declare your tables with camelCase columns
 * (`tenantId`, `createdAt`) wrapped in double quotes, OR add a translation
 * layer in your repository wrapper.
 */

export interface SupabaseRepositoryOptions {
  /** Project URL, e.g. https://xxxx.supabase.co */
  url: string;
  /** Service role key (used server-side; do not expose to clients). */
  serviceKey: string;
  /** Table name. */
  table: string;
}

export function supabaseRepository<T extends Entity>(
  entityName: string,
  options: SupabaseRepositoryOptions,
): Repository<T> & Adapter {
  const { url, serviceKey, table } = options;
  const baseUrl = `${url.replace(/\/$/, "")}/rest/v1/${table}`;

  function headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async function request(
    path: string,
    init: RequestInit & { headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: headers(init.headers ?? {}),
    });
    if (!res.ok && res.status !== 406) {
      const body = await res.text();
      if (res.status === 409) {
        throw new ConflictError(`${entityName}: ${body}`);
      }
      throw new Error(`Supabase ${res.status}: ${body}`);
    }
    return res;
  }

  const capabilities: AdapterCapabilities = {
    transactions: true,
    fullTextSearch: true,
    aggregations: "sql",
  };

  return {
    capabilities,

    async get(tenantId, id) {
      const res = await request(
        `?id=eq.${encodeURIComponent(id)}&tenantId=eq.${encodeURIComponent(tenantId)}&limit=1`,
        { method: "GET" },
      );
      const rows = (await res.json()) as T[];
      return rows[0] ?? null;
    },

    async list(tenantId, query = {}) {
      const params = new URLSearchParams();
      params.append("tenantId", `eq.${tenantId}`);

      if (query.where) {
        for (const [field, value] of Object.entries(query.where)) {
          if (value == null) continue;
          params.append(field, `eq.${value}`);
        }
      }
      const limit = query.limit ?? 50;
      params.append("limit", String(limit + 1)); // +1 to detect next page
      if (query.orderBy) {
        params.append("order", `${String(query.orderBy.field)}.${query.orderBy.direction}`);
      }
      if (query.cursor) {
        params.append("offset", query.cursor);
      }

      const res = await request(`?${params}`, { method: "GET" });
      const rows = (await res.json()) as T[];
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
      return {
        items,
        nextCursor: hasMore ? String(offset + items.length) : null,
      };
    },

    async create(tenantId, data) {
      const res = await request("", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ ...(data as object), tenantId }),
      });
      const rows = (await res.json()) as T[];
      return rows[0];
    },

    async update(tenantId, id, patch) {
      const res = await request(
        `?id=eq.${encodeURIComponent(id)}&tenantId=eq.${encodeURIComponent(tenantId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(patch),
        },
      );
      const rows = (await res.json()) as T[];
      if (!rows[0]) throw new NotFoundError(entityName, id);
      return rows[0];
    },

    async delete(tenantId, id) {
      const res = await request(
        `?id=eq.${encodeURIComponent(id)}&tenantId=eq.${encodeURIComponent(tenantId)}`,
        {
          method: "DELETE",
          headers: { Prefer: "return=representation" },
        },
      );
      const rows = (await res.json()) as T[];
      if (!rows[0]) throw new NotFoundError(entityName, id);
    },
  };
}
