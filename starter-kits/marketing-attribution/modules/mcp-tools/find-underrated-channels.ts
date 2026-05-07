import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type {
  Conversion,
  Touchpoint,
} from "../repositories/touchpoints.ts";

/**
 * Orchestrator MCP tool: find_underrated_channels.
 *
 * Compares last-touch attribution against linear and position-based
 * attribution. Channels that look weak under last-touch but strong under
 * linear/position-based are commonly under-funded "assist" channels —
 * brand search, podcast ads, retargeting display, etc.
 */

interface Body {
  windowDays?: number;
}

interface TouchpointPage {
  items: Touchpoint[];
  nextCursor: string | null;
}

interface ConversionPage {
  items: Conversion[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const windowDays = Math.max(1, Math.min(365, body.windowDays ?? 30));
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  const auth = request.headers.get("authorization") ?? "";

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

  const channels = new Set<string>([
    ...Object.keys(lastTouch),
    ...Object.keys(linear),
    ...Object.keys(positionBased),
  ]);

  const ranked = Array.from(channels)
    .map((channel) => {
      const lt = lastTouch[channel] ?? 0;
      const lin = linear[channel] ?? 0;
      const pos = positionBased[channel] ?? 0;
      const blended = (lin + pos) / 2;
      const ratio = lt === 0 ? Infinity : blended / lt;
      return { channel, lastTouchCents: lt, linearCents: lin, positionBasedCents: pos, blendedCents: blended, underratedRatio: ratio };
    })
    .sort((a, b) => b.underratedRatio - a.underratedRatio);

  const underrated = ranked.filter((r) => r.underratedRatio >= 1.5 && r.blendedCents > 0);

  return new Response(
    JSON.stringify({
      windowDays,
      cutoff,
      conversionCount: conversions.length,
      channelCount: ranked.length,
      underratedChannels: underrated,
      allChannelsRanked: ranked,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
