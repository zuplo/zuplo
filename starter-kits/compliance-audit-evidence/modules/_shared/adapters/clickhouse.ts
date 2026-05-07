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
 * ClickHouse adapter — uses the ClickHouse HTTP interface.
 *
 * Best for event/analytics-shaped data: billions of rows, append-mostly,
 * heavy aggregations. Updates and deletes are slow on ClickHouse and use
 * `ALTER TABLE ... UPDATE/DELETE` mutations — fine for occasional admin
 * ops but NOT for hot paths.
 *
 * Tables must include columns: `id String`, `tenantId String`, plus your
 * domain columns. Recommended ENGINE: `MergeTree() ORDER BY (tenantId, id)`.
 *
 * Auth: Basic auth with `username:password` (or `?user=...&password=...`
 * query params). For ClickHouse Cloud, use the `default` user with the
 * generated password.
 */

export interface ClickHouseRepositoryOptions {
  /** ClickHouse Cloud or self-hosted HTTP endpoint, e.g. https://abc.clickhouse.cloud */
  url: string;
  /** Username (e.g. "default"). */
  username: string;
  /** Password. */
  password: string;
  /** Database name. */
  database: string;
  /** Table name. */
  table: string;
}

function escapeIdentifier(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function escapeString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function escapeValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return escapeString(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return escapeString(value.toISOString());
  return escapeString(JSON.stringify(value));
}

export function clickhouseRepository<T extends Entity>(
  entityName: string,
  options: ClickHouseRepositoryOptions,
): Repository<T> & Adapter {
  const { url, username, password, database, table } = options;
  const tableId = `${escapeIdentifier(database)}.${escapeIdentifier(table)}`;

  async function query(sql: string, format: string | null = "JSONEachRow"): Promise<Response> {
    const params = new URLSearchParams();
    if (format) params.set("default_format", format);
    const res = await fetch(`${url.replace(/\/$/, "")}/?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${username}:${password}`)}`,
        "Content-Type": "text/plain",
      },
      body: sql,
    });
    if (!res.ok) {
      throw new Error(`ClickHouse ${res.status}: ${await res.text()}`);
    }
    return res;
  }

  async function queryRows<R>(sql: string): Promise<R[]> {
    const res = await query(sql);
    const text = await res.text();
    if (!text.trim()) return [];
    return text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as R);
  }

  const capabilities: AdapterCapabilities = {
    transactions: false,
    fullTextSearch: false, // ClickHouse has it, but we don't expose generically
    aggregations: "sql",
  };

  return {
    capabilities,

    async get(tenantId, id) {
      const rows = await queryRows<T>(
        `SELECT * FROM ${tableId} WHERE tenantId = ${escapeString(tenantId)} AND id = ${escapeString(id)} LIMIT 1`,
      );
      return rows[0] ?? null;
    },

    async list(tenantId, query: ListQuery<T> = {}) {
      const limit = query.limit ?? 50;
      const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
      let where = `tenantId = ${escapeString(tenantId)}`;
      if (query.where) {
        for (const [field, value] of Object.entries(query.where)) {
          if (value == null) continue;
          where += ` AND ${escapeIdentifier(field)} = ${escapeValue(value)}`;
        }
      }
      let sql = `SELECT * FROM ${tableId} WHERE ${where}`;
      if (query.orderBy) {
        sql += ` ORDER BY ${escapeIdentifier(String(query.orderBy.field))} ${
          query.orderBy.direction === "desc" ? "DESC" : "ASC"
        }`;
      }
      sql += ` LIMIT ${limit + 1} OFFSET ${offset}`;
      const rows = await queryRows<T>(sql);
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return {
        items,
        nextCursor: hasMore ? String(offset + items.length) : null,
      };
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      const fullRow = { ...(data as object), id, tenantId } as T;
      const cols = Object.keys(fullRow).map(escapeIdentifier).join(", ");
      const vals = Object.values(fullRow).map(escapeValue).join(", ");
      await query(`INSERT INTO ${tableId} (${cols}) VALUES (${vals})`, null);
      return fullRow;
    },

    async update(tenantId, id, patch) {
      const sets = Object.entries(patch)
        .map(([k, v]) => `${escapeIdentifier(k)} = ${escapeValue(v)}`)
        .join(", ");
      await query(
        `ALTER TABLE ${tableId} UPDATE ${sets} WHERE id = ${escapeString(id)} AND tenantId = ${escapeString(tenantId)}`,
        null,
      );
      // ClickHouse mutations are async; refetch to confirm the row exists.
      const rows = await queryRows<T>(
        `SELECT * FROM ${tableId} WHERE tenantId = ${escapeString(tenantId)} AND id = ${escapeString(id)} LIMIT 1`,
      );
      if (!rows[0]) throw new NotFoundError(entityName, id);
      return rows[0];
    },

    async delete(tenantId, id) {
      const rows = await queryRows<{ id: string }>(
        `SELECT id FROM ${tableId} WHERE tenantId = ${escapeString(tenantId)} AND id = ${escapeString(id)} LIMIT 1`,
      );
      if (!rows[0]) throw new NotFoundError(entityName, id);
      await query(
        `ALTER TABLE ${tableId} DELETE WHERE id = ${escapeString(id)} AND tenantId = ${escapeString(tenantId)}`,
        null,
      );
    },
  };
}
