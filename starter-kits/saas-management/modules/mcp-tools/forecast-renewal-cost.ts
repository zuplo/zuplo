import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { SaaSApp } from "../repositories/apps.ts";

/**
 * Orchestrator: forecast_renewal_cost.
 *
 * Returns the sum of annualCostCents across SaaS apps whose renewalDate
 * falls within the next `monthsAhead` months. Use to budget upcoming spend.
 */

interface Body {
  monthsAhead?: number;
}

interface AppPage {
  items: SaaSApp[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const monthsAhead = Math.max(1, Math.min(36, body.monthsAhead ?? 12));
  const auth = request.headers.get("authorization") ?? "";

  const horizon = new Date();
  horizon.setMonth(horizon.getMonth() + monthsAhead);
  const horizonMs = horizon.getTime();
  const nowMs = Date.now();

  let totalCents = 0;
  const upcoming: Array<Pick<SaaSApp, "slug" | "name" | "renewalDate" | "annualCostCents">> = [];

  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<AppPage>(context, `/apps?${qs}`, {
      headers: { authorization: auth },
    });
    for (const app of page.items) {
      const renewalMs = Date.parse(app.renewalDate);
      if (Number.isNaN(renewalMs)) continue;
      if (renewalMs < nowMs || renewalMs > horizonMs) continue;
      totalCents += app.annualCostCents;
      upcoming.push({
        slug: app.slug,
        name: app.name,
        renewalDate: app.renewalDate,
        annualCostCents: app.annualCostCents,
      });
    }
    cursor = page.nextCursor;
  } while (cursor);

  upcoming.sort((a, b) => a.renewalDate.localeCompare(b.renewalDate));

  return new Response(
    JSON.stringify({
      monthsAhead,
      count: upcoming.length,
      totalCents,
      upcoming,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
