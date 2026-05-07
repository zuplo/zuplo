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
 * Neon adapter — uses the Neon HTTP serverless driver protocol.
 *
 * The Neon serverless API speaks a JSON-over-HTTPS protocol that proxies
 * SQL queries to a Neon Postgres branch. It works in edge runtimes because
 * it never opens a TCP socket from the worker.
 *
 * Tables must include `id text primary key`, `tenant_id text not null` (or
 * `"tenantId"`, depending on your naming) plus your domain columns.
 *
 * This adapter assumes camelCase columns (`tenantId`, `createdAt`) so the
 * TypeScript and DB shapes match. Adjust your table DDL accordingly:
 *
 *   create table invoices (
 *     id text primary key default gen_random_uuid(),
 *     "tenantId" text not null,
 *     ...
 *   );
 */

export interface NeonRepositoryOptions {
  /**
   * The Neon HTTP endpoint.
   *
   * For Neon Cloud, use the connection string-derived endpoint, e.g.:
   *   https://<endpoint>.neon.tech/sql
   * with the `Neon-Connection-String` header carrying the full connection.
   */
  url: string;
  /** Postgres connection string for the Neon branch. */
  connectionString: string;
  /** Table name. */
  table: string;
}

interface NeonResponse {
  command: string;
  rowCount: number;
  rows: Record<string, unknown>[];
  fields: { name: string; dataTypeID: number }[];
}

export function neonRepository<T extends Entity>(
  entityName: string,
  options: NeonRepositoryOptions,
): Repository<T> & Adapter {
  const { url, connectionString, table } = options;

  async function exec<R = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<R[]> {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Neon-Connection-String": connectionString,
      },
      body: JSON.stringify({ query: sql, params }),
    });
    if (!res.ok) throw new Error(`Neon ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as NeonResponse;
    return body.rows as R[];
  }

  function ident(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
  }

  const tableId = ident(table);

  const capabilities: AdapterCapabilities = {
    transactions: true,
    fullTextSearch: true,
    aggregations: "sql",
  };

  return {
    capabilities,

    async get(tenantId, id) {
      const rows = await exec<T>(
        `SELECT * FROM ${tableId} WHERE "tenantId" = $1 AND id = $2 LIMIT 1`,
        [tenantId, id],
      );
      return rows[0] ?? null;
    },

    async list(tenantId, query = {}) {
      const limit = query.limit ?? 50;
      const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
      const params: unknown[] = [tenantId];
      const wheres: string[] = [`"tenantId" = $1`];

      if (query.where) {
        for (const [field, value] of Object.entries(query.where)) {
          if (value == null) continue;
          params.push(value);
          wheres.push(`${ident(field)} = $${params.length}`);
        }
      }
      let sql = `SELECT * FROM ${tableId} WHERE ${wheres.join(" AND ")}`;
      if (query.orderBy) {
        sql += ` ORDER BY ${ident(String(query.orderBy.field))} ${
          query.orderBy.direction === "desc" ? "DESC" : "ASC"
        }`;
      }
      params.push(limit + 1);
      sql += ` LIMIT $${params.length}`;
      params.push(offset);
      sql += ` OFFSET $${params.length}`;

      const rows = await exec<T>(sql, params);
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return {
        items,
        nextCursor: hasMore ? String(offset + items.length) : null,
      };
    },

    async create(tenantId, data) {
      const fullRow = { ...(data as object), tenantId } as Record<string, unknown>;
      const fields = Object.keys(fullRow);
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(", ");
      const cols = fields.map(ident).join(", ");
      const values = fields.map((f) => fullRow[f]);

      const rows = await exec<T>(
        `INSERT INTO ${tableId} (${cols}) VALUES (${placeholders}) RETURNING *`,
        values,
      );
      return rows[0];
    },

    async update(tenantId, id, patch) {
      const fields = Object.keys(patch);
      if (fields.length === 0) {
        const existing = await this.get(tenantId, id);
        if (!existing) throw new NotFoundError(entityName, id);
        return existing;
      }
      const sets = fields.map((f, i) => `${ident(f)} = $${i + 1}`).join(", ");
      const values = fields.map((f) => (patch as Record<string, unknown>)[f]);
      values.push(tenantId, id);
      const rows = await exec<T>(
        `UPDATE ${tableId} SET ${sets} WHERE "tenantId" = $${
          fields.length + 1
        } AND id = $${fields.length + 2} RETURNING *`,
        values,
      );
      if (!rows[0]) throw new NotFoundError(entityName, id);
      return rows[0];
    },

    async delete(tenantId, id) {
      const rows = await exec<{ id: string }>(
        `DELETE FROM ${tableId} WHERE "tenantId" = $1 AND id = $2 RETURNING id`,
        [tenantId, id],
      );
      if (!rows[0]) throw new NotFoundError(entityName, id);
    },
  };
}
