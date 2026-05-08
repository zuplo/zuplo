import { environment } from "@zuplo/runtime";

/**
 * ClickHouse integration — direct HTTP-interface client used by the
 * product-analytics kit's funnel + cohort orchestrators. Lives next to
 * the kit's repository adapter; this module is for analytical queries
 * (HogQL-style aggregations, funnels) that don't fit the Repository<T>
 * shape.
 *
 * Env vars:
 *   CLICKHOUSE_URL         — https://xxxx.clickhouse.cloud (no trailing slash needed)
 *   CLICKHOUSE_USERNAME    — usually "default" on Cloud
 *   CLICKHOUSE_PASSWORD    — Cloud-generated password
 *   CLICKHOUSE_DATABASE    — defaults to "default"
 *   CLICKHOUSE_EVENTS_TABLE — defaults to "events"
 */

export interface ClickHouseQueryRequest {
  /** SQL string. Caller is responsible for escaping. */
  sql: string;
  /** ClickHouse format. JSONEachRow returns one row per JSON line. */
  format?: "JSONEachRow" | "JSON" | "TabSeparated" | null;
  /** Optional read-only flag — sets readonly=1 query param. */
  readOnly?: boolean;
}

export interface ClickHouseQueryResult<T = Record<string, unknown>> {
  rows: T[];
  /** Raw text body, in case the caller wanted a specific format. */
  raw: string;
}

function endpoint(): string {
  const url = (environment as Record<string, string | undefined>).CLICKHOUSE_URL;
  if (!url) throw new Error("CLICKHOUSE_URL is not set");
  return url.replace(/\/$/, "");
}

function basicAuth(): string {
  const env = environment as Record<string, string | undefined>;
  const username = env.CLICKHOUSE_USERNAME ?? "default";
  const password = env.CLICKHOUSE_PASSWORD;
  if (!password) throw new Error("CLICKHOUSE_PASSWORD is not set");
  return `Basic ${btoa(`${username}:${password}`)}`;
}

export function clickhouseDatabase(): string {
  return (
    (environment as Record<string, string | undefined>).CLICKHOUSE_DATABASE ?? "default"
  );
}

export function eventsTable(): string {
  return (
    (environment as Record<string, string | undefined>).CLICKHOUSE_EVENTS_TABLE ?? "events"
  );
}

export function eventsTableId(): string {
  const db = clickhouseDatabase();
  const tbl = eventsTable();
  return `${escapeIdent(db)}.${escapeIdent(tbl)}`;
}

export function escapeIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function escapeString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function escapeValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return escapeString(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return escapeString(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map(escapeValue).join(", ")}]`;
  }
  return escapeString(JSON.stringify(value));
}

/**
 * Run a SQL query against ClickHouse. Defaults to JSONEachRow so callers
 * get one parsed object per result row.
 */
export async function clickhouseQuery<T = Record<string, unknown>>(
  req: ClickHouseQueryRequest,
): Promise<ClickHouseQueryResult<T>> {
  const params = new URLSearchParams();
  const format = req.format === undefined ? "JSONEachRow" : req.format;
  if (format) params.set("default_format", format);
  if (req.readOnly) params.set("readonly", "1");

  const res = await fetch(`${endpoint()}/?${params}`, {
    method: "POST",
    headers: {
      authorization: basicAuth(),
      "content-type": "text/plain",
    },
    body: req.sql,
  });
  if (!res.ok) {
    throw new Error(`ClickHouse ${res.status}: ${await res.text()}`);
  }
  const raw = await res.text();
  if (format !== "JSONEachRow" || !raw.trim()) {
    return { rows: [], raw };
  }
  const rows = raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as T);
  return { rows, raw };
}

/**
 * Append a row (or batch) to the events table. Used by ingest_event /
 * ingest_events_batch when the kit is running on the ClickHouse adapter
 * AND wants the same event landing in PostHog. Each entry is normalised
 * to the kit's events schema: id, tenantId, userId, name, properties,
 * occurredAt, sessionId, deviceId, ip, createdAt.
 */
export interface ClickHouseEventRow {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  properties: Record<string, unknown>;
  occurredAt: string;
  sessionId?: string | null;
  deviceId?: string | null;
  ip?: string | null;
  createdAt: string;
}

export async function insertEventsRows(rows: ClickHouseEventRow[]): Promise<void> {
  if (rows.length === 0) return;
  const cols = [
    "id",
    "tenantId",
    "userId",
    "name",
    "properties",
    "occurredAt",
    "sessionId",
    "deviceId",
    "ip",
    "createdAt",
  ];
  const colsExpr = cols.map(escapeIdent).join(", ");
  const valuesExpr = rows
    .map((r) => {
      const orderedValues = [
        r.id,
        r.tenantId,
        r.userId,
        r.name,
        // Always serialize properties as a JSON string — ClickHouse `JSON` /
        // `String` columns both accept this.
        JSON.stringify(r.properties ?? {}),
        r.occurredAt,
        r.sessionId ?? null,
        r.deviceId ?? null,
        r.ip ?? null,
        r.createdAt,
      ];
      return `(${orderedValues.map(escapeValue).join(", ")})`;
    })
    .join(", ");
  const sql = `INSERT INTO ${eventsTableId()} (${colsExpr}) VALUES ${valuesExpr}`;
  await clickhouseQuery({ sql, format: null });
}

/**
 * Compute funnel step counts for an ordered list of event names within
 * a date window. Returns one row per step with absolute and step-to-step
 * conversion. Uses ClickHouse's `windowFunnel` for performance on big
 * event tables.
 */
export interface FunnelStepResult {
  stepIndex: number;
  eventName: string;
  count: number;
  conversionFromFirst: number;
  conversionFromPrev: number;
}

export async function computeFunnelInClickHouse(args: {
  tenantId: string;
  steps: Array<{ eventName: string; filters?: Record<string, unknown> }>;
  dateFrom: string;
  dateTo: string;
  /** Inclusive seconds between consecutive steps. Default 7 days. */
  windowSeconds?: number;
}): Promise<{ usersConsidered: number; steps: FunnelStepResult[] }> {
  if (args.steps.length === 0) {
    return { usersConsidered: 0, steps: [] };
  }
  const window = args.windowSeconds ?? 7 * 24 * 60 * 60;
  const stepConditions = args.steps.map((s, i) => {
    const conds: string[] = [`name = ${escapeString(s.eventName)}`];
    for (const [k, v] of Object.entries(s.filters ?? {})) {
      conds.push(
        `JSONExtractString(properties, ${escapeString(k)}) = ${escapeValue(v)}`,
      );
    }
    return `(${conds.join(" AND ")}) AS step_${i}`;
  });

  // windowFunnel returns the deepest reached step per user.
  const sql = `
    WITH funnel AS (
      SELECT
        userId,
        windowFunnel(${window})(
          toDateTime(occurredAt),
          ${args.steps.map((_, i) => `step_${i}`).join(",\n          ")}
        ) AS reached
      FROM (
        SELECT
          userId,
          name,
          properties,
          occurredAt,
          ${stepConditions.join(",\n          ")}
        FROM ${eventsTableId()}
        WHERE tenantId = ${escapeString(args.tenantId)}
          AND occurredAt >= ${escapeString(args.dateFrom)}
          AND occurredAt <= ${escapeString(args.dateTo)}
      )
      GROUP BY userId
    )
    SELECT reached, count() AS users
    FROM funnel
    GROUP BY reached
    ORDER BY reached
  `;
  const result = await clickhouseQuery<{ reached: number; users: string }>({ sql });

  const reachedCounts = new Map<number, number>();
  for (const row of result.rows) {
    reachedCounts.set(Number(row.reached), Number(row.users));
  }
  // Build cumulative step counts. windowFunnel returns max step index reached.
  const usersConsidered = Array.from(reachedCounts.values()).reduce((a, b) => a + b, 0);
  const stepCounts: number[] = args.steps.map(() => 0);
  for (let i = 0; i < args.steps.length; i++) {
    let count = 0;
    for (const [reached, users] of reachedCounts) {
      if (reached >= i + 1) count += users;
    }
    stepCounts[i] = count;
  }

  const steps: FunnelStepResult[] = args.steps.map((s, i) => {
    const count = stepCounts[i] ?? 0;
    const first = stepCounts[0] ?? 0;
    const prev = i === 0 ? count : stepCounts[i - 1] ?? 0;
    return {
      stepIndex: i,
      eventName: s.eventName,
      count,
      conversionFromFirst: first === 0 ? 0 : count / first,
      conversionFromPrev: prev === 0 ? 0 : count / prev,
    };
  });
  return { usersConsidered, steps };
}
