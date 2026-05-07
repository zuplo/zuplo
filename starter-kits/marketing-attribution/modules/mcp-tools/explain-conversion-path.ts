import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type {
  AttributionModel,
  Conversion,
  Touchpoint,
} from "../repositories/touchpoints.ts";

/**
 * Orchestrator MCP tool: explain_conversion_path.
 *
 * Pulls a visitor's chronological touchpoints, the visitor's conversions,
 * and the configured attribution models, then computes how each model would
 * split the most recent conversion's value across the prior touchpoints.
 */

interface Body {
  visitorId: string;
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

function attributeValue(
  model: AttributionModel,
  touchpoints: Touchpoint[],
  totalCents: number,
): Array<{ touchpointId: string; channel: string; weight: number; valueCents: number }> {
  if (touchpoints.length === 0) return [];
  const weights: number[] = touchpoints.map(() => 0);

  switch (model.kind) {
    case "first":
      weights[0] = 1;
      break;
    case "last":
      weights[weights.length - 1] = 1;
      break;
    case "linear": {
      const w = 1 / weights.length;
      for (let i = 0; i < weights.length; i++) weights[i] = w;
      break;
    }
    case "position_based": {
      if (weights.length === 1) {
        weights[0] = 1;
      } else if (weights.length === 2) {
        weights[0] = 0.5;
        weights[1] = 0.5;
      } else {
        weights[0] = 0.4;
        weights[weights.length - 1] = 0.4;
        const middle = (1 - 0.8) / (weights.length - 2);
        for (let i = 1; i < weights.length - 1; i++) weights[i] = middle;
      }
      break;
    }
    case "time_decay": {
      // Each step doubles in importance; later touches get more weight.
      let total = 0;
      for (let i = 0; i < weights.length; i++) {
        weights[i] = Math.pow(2, i);
        total += weights[i];
      }
      for (let i = 0; i < weights.length; i++) weights[i] = weights[i] / total;
      break;
    }
  }

  return touchpoints.map((tp, i) => ({
    touchpointId: tp.id,
    channel: tp.channel,
    weight: weights[i] ?? 0,
    valueCents: Math.round(totalCents * (weights[i] ?? 0)),
  }));
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.visitorId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "visitorId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = request.headers.get("authorization") ?? "";

  const touchpoints: Touchpoint[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", visitorId: body.visitorId });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TouchpointPage>(context, `/touchpoints?${qs}`, {
      headers: { authorization: auth },
    });
    touchpoints.push(...page.items);
    cursor = page.nextCursor;
    if (touchpoints.length > 1000) break;
  } while (cursor);
  touchpoints.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const conversions: Conversion[] = [];
  cursor = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", visitorId: body.visitorId });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ConversionPage>(context, `/conversions?${qs}`, {
      headers: { authorization: auth },
    });
    conversions.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  conversions.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const lastConversion = conversions[conversions.length - 1] ?? null;

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

  const totalCents = lastConversion?.valueCents ?? 0;
  const priorTouchpoints = lastConversion
    ? touchpoints.filter((t) => t.occurredAt <= lastConversion.occurredAt)
    : touchpoints;

  const attribution: Record<string, ReturnType<typeof attributeValue>> = {};
  for (const model of models) {
    attribution[model.slug] = attributeValue(model, priorTouchpoints, totalCents);
  }

  return new Response(
    JSON.stringify({
      visitorId: body.visitorId,
      touchpointCount: touchpoints.length,
      conversionCount: conversions.length,
      lastConversion,
      path: priorTouchpoints.map((tp) => ({
        touchpointId: tp.id,
        channel: tp.channel,
        campaignName: tp.campaignName,
        occurredAt: tp.occurredAt,
        url: tp.url,
      })),
      attribution,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
