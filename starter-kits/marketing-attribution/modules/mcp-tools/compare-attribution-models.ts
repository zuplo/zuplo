import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type {
  AttributionModel,
  Conversion,
  Touchpoint,
} from "../repositories/touchpoints.ts";

/**
 * Orchestrator MCP tool: compare_attribution_models.
 *
 * For every conversion in the date window (optionally filtered to a set of
 * channels), compute attribution under each configured model and return a
 * side-by-side comparison: model x channel -> attributed value.
 */

interface Body {
  dateFrom: string;
  dateTo: string;
  channelSlugs?: string[];
}

interface TouchpointPage {
  items: Touchpoint[];
  nextCursor: string | null;
}

interface ConversionPage {
  items: Conversion[];
  nextCursor: string | null;
}

interface AttributionModelPage {
  items: AttributionModel[];
  nextCursor: string | null;
}

function modelWeights(model: AttributionModel, n: number): number[] {
  const weights = new Array(n).fill(0) as number[];
  if (n === 0) return weights;
  switch (model.kind) {
    case "first":
      weights[0] = 1;
      return weights;
    case "last":
      weights[n - 1] = 1;
      return weights;
    case "linear":
      return weights.map(() => 1 / n);
    case "position_based":
      if (n === 1) {
        weights[0] = 1;
      } else if (n === 2) {
        weights[0] = 0.5;
        weights[1] = 0.5;
      } else {
        weights[0] = 0.4;
        weights[n - 1] = 0.4;
        const mid = 0.2 / (n - 2);
        for (let i = 1; i < n - 1; i++) weights[i] = mid;
      }
      return weights;
    case "time_decay": {
      let total = 0;
      for (let i = 0; i < n; i++) {
        weights[i] = Math.pow(2, i);
        total += weights[i];
      }
      for (let i = 0; i < n; i++) weights[i] = weights[i] / total;
      return weights;
    }
  }
  return weights;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.dateFrom || !body.dateTo) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "dateFrom and dateTo are required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const channelFilter = body.channelSlugs ? new Set(body.channelSlugs) : null;

  const conversions: Conversion[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ConversionPage>(context, `/conversions?${qs}`, {
      headers: { authorization: auth },
    });
    for (const c of page.items) {
      if (c.occurredAt >= body.dateFrom && c.occurredAt <= body.dateTo) {
        conversions.push(c);
      }
    }
    cursor = page.nextCursor;
    if (conversions.length > 5000) break;
  } while (cursor);

  const models: AttributionModel[] = [];
  cursor = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<AttributionModelPage>(context, `/attribution-models?${qs}`, {
      headers: { authorization: auth },
    });
    models.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const byVisitor = new Map<string, Conversion[]>();
  for (const c of conversions) {
    const list = byVisitor.get(c.visitorId) ?? [];
    list.push(c);
    byVisitor.set(c.visitorId, list);
  }

  const summary: Record<string, Record<string, number>> = {};
  for (const model of models) summary[model.slug] = {};

  for (const [visitorId, vConversions] of byVisitor) {
    const touchpoints: Touchpoint[] = [];
    cursor = undefined;
    do {
      const qs = new URLSearchParams({ limit: "200", visitorId });
      if (cursor) qs.set("cursor", cursor);
      const page = await invokeJson<TouchpointPage>(context, `/touchpoints?${qs}`, {
        headers: { authorization: auth },
      });
      touchpoints.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    touchpoints.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    for (const conv of vConversions) {
      const prior = touchpoints.filter((t) => t.occurredAt <= conv.occurredAt);
      const filtered = channelFilter
        ? prior.filter((t) => channelFilter.has(t.channel))
        : prior;
      if (filtered.length === 0) continue;

      for (const model of models) {
        const weights = modelWeights(model, filtered.length);
        for (let i = 0; i < filtered.length; i++) {
          const tp = filtered[i];
          if (!tp) continue;
          const attributed = Math.round(conv.valueCents * (weights[i] ?? 0));
          const bucket = summary[model.slug];
          if (bucket) bucket[tp.channel] = (bucket[tp.channel] ?? 0) + attributed;
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      channelSlugs: body.channelSlugs ?? null,
      conversionCount: conversions.length,
      modelCount: models.length,
      attributionByModel: summary,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
