import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Discount } from "../repositories/discounts.ts";

interface Body {
  eventId: string;
  segmentName: string;
  percent: number;
  max: number;
  expiresAt?: string;
}

/**
 * Orchestrator: issue_discount_for_segment.
 *
 * Mints a percentage-off discount tagged with a segment name (alumni,
 * students, press, etc.) by composing the discount code from segment +
 * timestamp and persisting it through `create_discount`. Returns the
 * created discount so the agent can hand it to email/marketing.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.eventId || !body.segmentName || body.percent == null || body.max == null) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "eventId, segmentName, percent, and max are required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = request.headers.get("authorization") ?? "";

  const code = `${body.segmentName.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${Date.now().toString(36).toUpperCase()}`;
  const expiresAt =
    body.expiresAt ?? new Date(Date.now() + 30 * 86400000).toISOString();

  const created = await invokeJson<Discount>(context, `/discounts`, {
    method: "POST",
    headers: {
      authorization: auth,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      code,
      eventId: body.eventId,
      kind: "percent",
      value: body.percent,
      maxUses: body.max,
      expiresAt,
    }),
  });

  return new Response(
    JSON.stringify({
      discount: created,
      segment: body.segmentName,
      shareableCode: code,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
