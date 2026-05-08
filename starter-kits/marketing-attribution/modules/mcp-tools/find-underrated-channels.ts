import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type {
  Conversion,
  Touchpoint,
} from "../repositories/touchpoints.ts";
import {
  lastTouchByChannel,
  linearByChannel,
} from "../integrations/clickhouse.ts";
import { fetchMetaInsights } from "../integrations/meta-ads.ts";
import { fetchCampaignSpend } from "../integrations/google-ads.ts";

/**
 * Orchestrator MCP tool: find_underrated_channels.
 *
 * Compares last-touch attribution against linear and position-based
 * attribution, then layers in real ad-platform spend (Meta + Google) and
 * computes a per-channel ROAS gap. Channels that look weak under last-touch
 * but strong under linear/position-based, AND have meaningful spend, are
 * commonly under-funded "assist" channels — brand search, podcast ads,
 * retargeting display, etc.
 *
 * Backends:
 *   - ClickHouse, when DB_PROVIDER=clickhouse — pushes attribution into SQL.
 *   - In-memory walk via /touchpoints + /conversions — fallback for the
 *     starter-kit smoke test.
 *
 * Spend layer (optional, set the relevant env vars):
 *   - Meta Ads /insights for "social" / "paid_search" Meta campaigns
 *   - Google Ads searchStream for "paid_search" Google campaigns
 */

interface Body {
  windowDays?: number;
  /** Force the in-memory path even when DB_PROVIDER=clickhouse. */
  forceMemory?: boolean;
  /** Skip pulling spend insights from the ad platforms. */
  skipSpend?: boolean;
}

interface TouchpointPage {
  items: Touchpoint[];
  nextCursor: string | null;
}

interface ConversionPage {
  items: Conversion[];
  nextCursor: string | null;
}

interface AttributionMap {
  lastTouch: Record<string, number>;
  linear: Record<string, number>;
  positionBased: Record<string, number>;
}

async function attributionFromMemory(
  context: ZuploContext,
  cutoff: string,
  auth: string,
): Promise<{ map: AttributionMap; conversionCount: number }> {
  const conversions: Conversion[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ConversionPage>(context, `/conversions?${qs}`, {
      headers: { authorization: auth },
    });
    for (const c of page.items) {
      if (c.occurredAt >= cutoff) conversions.push(c);
    }
    cursor = page.nextCursor;
    if (conversions.length > 5000) break;
  } while (cursor);

  const lastTouch: Record<string, number> = {};
  const linear: Record<string, number> = {};
  const positionBased: Record<string, number> = {};

  for (const conv of conversions) {
    const touchpoints: Touchpoint[] = [];
    cursor = undefined;
    do {
      const qs = new URLSearchParams({ limit: "200", visitorId: conv.visitorId });
      if (cursor) qs.set("cursor", cursor);
      const page = await invokeJson<TouchpointPage>(context, `/touchpoints?${qs}`, {
        headers: { authorization: auth },
      });
      touchpoints.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    touchpoints.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const prior = touchpoints.filter((t) => t.occurredAt <= conv.occurredAt);
    if (prior.length === 0) continue;

    const last = prior[prior.length - 1];
    if (last) lastTouch[last.channel] = (lastTouch[last.channel] ?? 0) + conv.valueCents;

    const linearShare = conv.valueCents / prior.length;
    for (const tp of prior) {
      linear[tp.channel] = (linear[tp.channel] ?? 0) + Math.round(linearShare);
    }

    if (prior.length === 1) {
      const tp = prior[0];
      if (tp) positionBased[tp.channel] = (positionBased[tp.channel] ?? 0) + conv.valueCents;
    } else if (prior.length === 2) {
      const half = conv.valueCents / 2;
      for (const tp of prior) {
        positionBased[tp.channel] = (positionBased[tp.channel] ?? 0) + Math.round(half);
      }
    } else {
      const first = prior[0];
      const lastP = prior[prior.length - 1];
      if (first) positionBased[first.channel] = (positionBased[first.channel] ?? 0) + Math.round(conv.valueCents * 0.4);
      if (lastP) positionBased[lastP.channel] = (positionBased[lastP.channel] ?? 0) + Math.round(conv.valueCents * 0.4);
      const middleShare = (conv.valueCents * 0.2) / (prior.length - 2);
      for (let i = 1; i < prior.length - 1; i++) {
        const tp = prior[i];
        if (tp) positionBased[tp.channel] = (positionBased[tp.channel] ?? 0) + Math.round(middleShare);
      }
    }
  }

  return {
    map: { lastTouch, linear, positionBased },
    conversionCount: conversions.length,
  };
}

async function attributionFromClickHouse(
  tenantId: string,
  windowDays: number,
): Promise<{ map: AttributionMap; conversionCount: number }> {
  const dateFrom = new Date(Date.now() - windowDays * 86400000).toISOString();
  const dateTo = new Date().toISOString();

  const [lt, lin] = await Promise.all([
    lastTouchByChannel({ tenantId, dateFrom, dateTo }),
    linearByChannel({ tenantId, dateFrom, dateTo }),
  ]);

  const lastTouch: Record<string, number> = {};
  const linear: Record<string, number> = {};
  const positionBased: Record<string, number> = {};
  let conversionCount = 0;
  for (const r of lt) {
    lastTouch[r.channel] = r.attributedCents;
    conversionCount = Math.max(conversionCount, r.conversions);
  }
  for (const r of lin) {
    linear[r.channel] = r.attributedCents;
    // Position-based isn't trivial in pure SQL; approximate from linear with
    // a 40/40/20 weighting only when last-touch and linear diverge cleanly.
    positionBased[r.channel] = Math.round((r.attributedCents + (lastTouch[r.channel] ?? 0)) / 2);
  }
  return { map: { lastTouch, linear, positionBased }, conversionCount };
}

async function pullSpend(windowDays: number, context: ZuploContext): Promise<Record<string, number>> {
  const env = environment as Record<string, string | undefined>;
  const spend: Record<string, number> = {};

  if (env.META_PAGE_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID) {
    try {
      const insights = await fetchMetaInsights({ windowDays, level: "campaign" });
      let total = 0;
      for (const row of insights) total += row.spendCents;
      // Most Meta lead-ad campaigns map to "social"; treat all Meta spend as social.
      spend["social"] = (spend["social"] ?? 0) + total;
    } catch (err) {
      context.log.warn("Meta /insights failed", { err: String(err) });
    }
  }

  if (env.GOOGLE_ADS_DEVELOPER_TOKEN && env.GOOGLE_ADS_OAUTH_ACCESS_TOKEN && env.GOOGLE_ADS_CUSTOMER_ID) {
    try {
      const campaigns = await fetchCampaignSpend({ windowDays });
      let total = 0;
      for (const c of campaigns) total += c.spendCents;
      spend["paid_search"] = (spend["paid_search"] ?? 0) + total;
    } catch (err) {
      context.log.warn("Google Ads searchStream failed", { err: String(err) });
    }
  }

  return spend;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const windowDays = Math.max(1, Math.min(365, body.windowDays ?? 30));
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  const auth = request.headers.get("authorization") ?? "";

  const env = environment as Record<string, string | undefined>;
  const useClickHouse =
    !body.forceMemory && env.DB_PROVIDER === "clickhouse" && Boolean(env.CLICKHOUSE_URL);

  const tenantId = useClickHouse ? requireTenant(request) : "";

  const { map, conversionCount } = useClickHouse
    ? await attributionFromClickHouse(tenantId, windowDays)
    : await attributionFromMemory(context, cutoff, auth);

  const spend = body.skipSpend ? {} : await pullSpend(windowDays, context);

  const channels = new Set<string>([
    ...Object.keys(map.lastTouch),
    ...Object.keys(map.linear),
    ...Object.keys(map.positionBased),
    ...Object.keys(spend),
  ]);

  const ranked = Array.from(channels)
    .map((channel) => {
      const lt = map.lastTouch[channel] ?? 0;
      const lin = map.linear[channel] ?? 0;
      const pos = map.positionBased[channel] ?? 0;
      const blended = (lin + pos) / 2;
      const ratio = lt === 0 ? Infinity : blended / lt;
      const channelSpend = spend[channel] ?? 0;
      const lastTouchRoas = channelSpend > 0 ? lt / channelSpend : null;
      const blendedRoas = channelSpend > 0 ? blended / channelSpend : null;
      return {
        channel,
        lastTouchCents: lt,
        linearCents: lin,
        positionBasedCents: pos,
        blendedCents: blended,
        underratedRatio: ratio,
        spendCents: channelSpend,
        lastTouchRoas,
        blendedRoas,
      };
    })
    .sort((a, b) => b.underratedRatio - a.underratedRatio);

  const underrated = ranked.filter((r) => r.underratedRatio >= 1.5 && r.blendedCents > 0);

  return new Response(
    JSON.stringify({
      windowDays,
      cutoff,
      conversionCount,
      channelCount: ranked.length,
      backend: useClickHouse ? "clickhouse" : "memory",
      spendSources: {
        meta: Boolean(env.META_PAGE_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID),
        google: Boolean(env.GOOGLE_ADS_OAUTH_ACCESS_TOKEN && env.GOOGLE_ADS_CUSTOMER_ID),
      },
      underratedChannels: underrated,
      allChannelsRanked: ranked,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
