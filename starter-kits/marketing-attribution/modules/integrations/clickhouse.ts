import { environment } from "@zuplo/runtime";

/**
 * ClickHouse integration — direct HTTP-interface client used by the
 * marketing-attribution kit's orchestrator MCP tools to compute
 * cross-channel attribution at SQL speed.
 *
 * Two tables are expected in production:
 *   touchpoints — append-mostly visitor interactions
 *   conversions — append-mostly revenue events
 *
 * Both must contain at least: id, tenantId, visitorId, occurredAt.
 *
 * Env vars:
 *   CLICKHOUSE_URL                 — https://xxxx.clickhouse.cloud
 *   CLICKHOUSE_USERNAME            — usually "default"
 *   CLICKHOUSE_PASSWORD
 *   CLICKHOUSE_DATABASE            — default "default"
 *   CLICKHOUSE_TOUCHPOINTS_TABLE   — default "touchpoints"
 *   CLICKHOUSE_CONVERSIONS_TABLE   — default "conversions"
 */

export interface ClickHouseQueryRequest {
  sql: string;
  format?: "JSONEachRow" | "JSON" | "TabSeparated" | null;
  readOnly?: boolean;
}

export interface ClickHouseQueryResult<T = Record<string, unknown>> {
  rows: T[];
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

export function database(): string {
  return (
    (environment as Record<string, string | undefined>).CLICKHOUSE_DATABASE ?? "default"
  );
}

export function touchpointsTableId(): string {
  const tbl =
    (environment as Record<string, string | undefined>).CLICKHOUSE_TOUCHPOINTS_TABLE ??
    "touchpoints";
  return `${escapeIdent(database())}.${escapeIdent(tbl)}`;
}

export function conversionsTableId(): string {
  const tbl =
    (environment as Record<string, string | undefined>).CLICKHOUSE_CONVERSIONS_TABLE ??
    "conversions";
  return `${escapeIdent(database())}.${escapeIdent(tbl)}`;
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
  if (Array.isArray(value)) return `[${value.map(escapeValue).join(", ")}]`;
  return escapeString(JSON.stringify(value));
}

/**
 * Run a SQL query against ClickHouse.
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
 * Append a touchpoint row. Used by the lead-gen webhook handlers (Meta, Google)
 * to land touchpoints directly without going through the kit's REST POST.
 */
export async function insertTouchpoint(args: {
  id: string;
  tenantId: string;
  visitorId: string;
  channel: string;
  campaignName: string;
  source: string;
  medium: string;
  occurredAt: string;
  url: string;
  sessionId: string;
}): Promise<void> {
  const cols = [
    "id",
    "tenantId",
    "visitorId",
    "channel",
    "campaignName",
    "source",
    "medium",
    "occurredAt",
    "url",
    "sessionId",
  ];
  const values = [
    args.id,
    args.tenantId,
    args.visitorId,
    args.channel,
    args.campaignName,
    args.source,
    args.medium,
    args.occurredAt,
    args.url,
    args.sessionId,
  ];
  const sql = `
    INSERT INTO ${touchpointsTableId()} (${cols.map(escapeIdent).join(", ")})
    VALUES (${values.map(escapeValue).join(", ")})
  `;
  await clickhouseQuery({ sql, format: null });
}

/**
 * Append a conversion row.
 */
export async function insertConversion(args: {
  id: string;
  tenantId: string;
  visitorId: string;
  kind: string;
  valueCents: number;
  occurredAt: string;
  dealId: string | null;
}): Promise<void> {
  const cols = [
    "id",
    "tenantId",
    "visitorId",
    "kind",
    "valueCents",
    "occurredAt",
    "dealId",
  ];
  const values = [
    args.id,
    args.tenantId,
    args.visitorId,
    args.kind,
    args.valueCents,
    args.occurredAt,
    args.dealId,
  ];
  const sql = `
    INSERT INTO ${conversionsTableId()} (${cols.map(escapeIdent).join(", ")})
    VALUES (${values.map(escapeValue).join(", ")})
  `;
  await clickhouseQuery({ sql, format: null });
}

/**
 * Last-touch attribution by channel for a date range.
 */
export interface ChannelRow {
  channel: string;
  attributedCents: number;
  conversions: number;
}

export async function lastTouchByChannel(args: {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<ChannelRow[]> {
  const sql = `
    WITH conv AS (
      SELECT id, visitorId, valueCents, occurredAt
      FROM ${conversionsTableId()}
      WHERE tenantId = ${escapeString(args.tenantId)}
        AND occurredAt >= ${escapeString(args.dateFrom)}
        AND occurredAt <= ${escapeString(args.dateTo)}
    ),
    last_tp AS (
      SELECT
        c.id AS conversion_id,
        c.valueCents AS valueCents,
        argMax(t.channel, t.occurredAt) AS channel
      FROM conv c
      LEFT JOIN ${touchpointsTableId()} t
        ON t.tenantId = ${escapeString(args.tenantId)}
        AND t.visitorId = c.visitorId
        AND t.occurredAt <= c.occurredAt
      GROUP BY c.id, c.valueCents
    )
    SELECT
      coalesce(channel, 'unknown') AS channel,
      sum(valueCents) AS attributedCents,
      count() AS conversions
    FROM last_tp
    GROUP BY channel
    ORDER BY attributedCents DESC
  `;
  const res = await clickhouseQuery<{
    channel: string;
    attributedCents: string;
    conversions: string;
  }>({ sql });
  return res.rows.map((r) => ({
    channel: r.channel,
    attributedCents: Number(r.attributedCents),
    conversions: Number(r.conversions),
  }));
}

/**
 * Linear attribution by channel for a date range. Each touchpoint prior
 * to a conversion gets `valueCents / N` credit.
 */
export async function linearByChannel(args: {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<ChannelRow[]> {
  // Two-step: first compute (conversion_id, n_touches) once, then join on it.
  // Avoids window functions for ClickHouse versions that don't support them
  // and keeps each side scannable.
  const sql = `
    WITH conv AS (
      SELECT id AS conversion_id, visitorId, valueCents, occurredAt
      FROM ${conversionsTableId()}
      WHERE tenantId = ${escapeString(args.tenantId)}
        AND occurredAt >= ${escapeString(args.dateFrom)}
        AND occurredAt <= ${escapeString(args.dateTo)}
    ),
    counts AS (
      SELECT c.conversion_id AS conversion_id, count() AS n_touches
      FROM conv c
      INNER JOIN ${touchpointsTableId()} t
        ON t.tenantId = ${escapeString(args.tenantId)}
        AND t.visitorId = c.visitorId
        AND t.occurredAt <= c.occurredAt
      GROUP BY c.conversion_id
    )
    SELECT
      t.channel AS channel,
      sum(toFloat64(c.valueCents) / nullIf(counts.n_touches, 0)) AS attributedCents,
      uniq(c.conversion_id) AS conversions
    FROM conv c
    INNER JOIN ${touchpointsTableId()} t
      ON t.tenantId = ${escapeString(args.tenantId)}
      AND t.visitorId = c.visitorId
      AND t.occurredAt <= c.occurredAt
    INNER JOIN counts ON counts.conversion_id = c.conversion_id
    GROUP BY channel
    ORDER BY attributedCents DESC
  `;
  const res = await clickhouseQuery<{
    channel: string;
    attributedCents: string;
    conversions: string;
  }>({ sql });
  return res.rows.map((r) => ({
    channel: r.channel,
    attributedCents: Math.round(Number(r.attributedCents)),
    conversions: Number(r.conversions),
  }));
}

/**
 * Pull a single visitor's chronological touchpoint path up to (and including)
 * their most recent conversion. Returned in occurredAt ascending order.
 */
export interface PathRow {
  conversionId: string;
  conversionValueCents: number;
  conversionAt: string;
  touchpoints: Array<{
    id: string;
    channel: string;
    campaignName: string;
    source: string;
    medium: string;
    occurredAt: string;
    url: string;
  }>;
}

export async function explainPath(args: {
  tenantId: string;
  visitorId: string;
}): Promise<PathRow | null> {
  const conversionSql = `
    SELECT id, valueCents, occurredAt
    FROM ${conversionsTableId()}
    WHERE tenantId = ${escapeString(args.tenantId)}
      AND visitorId = ${escapeString(args.visitorId)}
    ORDER BY occurredAt DESC
    LIMIT 1
  `;
  const conv = await clickhouseQuery<{ id: string; valueCents: string; occurredAt: string }>({
    sql: conversionSql,
  });
  if (conv.rows.length === 0) return null;
  const c = conv.rows[0]!;

  const tpSql = `
    SELECT id, channel, campaignName, source, medium, occurredAt, url
    FROM ${touchpointsTableId()}
    WHERE tenantId = ${escapeString(args.tenantId)}
      AND visitorId = ${escapeString(args.visitorId)}
      AND occurredAt <= ${escapeString(c.occurredAt)}
    ORDER BY occurredAt ASC
  `;
  const tps = await clickhouseQuery<{
    id: string;
    channel: string;
    campaignName: string;
    source: string;
    medium: string;
    occurredAt: string;
    url: string;
  }>({ sql: tpSql });

  return {
    conversionId: c.id,
    conversionValueCents: Number(c.valueCents),
    conversionAt: c.occurredAt,
    touchpoints: tps.rows,
  };
}
