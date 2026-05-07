import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Forecast } from "../repositories/forecasts.ts";

interface Body {
  period: string;
  managerEmail?: string;
  repEmails?: string[];
}

interface ForecastPage { items: Forecast[]; nextCursor: string | null; }

/**
 * Orchestrator: roll_up_forecast.
 *
 * Sums commit/upside/pipeline/closed across reps for a single period. If
 * `repEmails` is passed, restrict to those reps; otherwise pull every rep
 * who has a row this period. The rep's *latest* submission per category is
 * used (forecasts are append-only, so we de-dupe by (rep, category)).
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const restrict = body.repEmails ? new Set(body.repEmails.map((e) => e.toLowerCase())) : null;

  const latest: Record<string, Record<string, Forecast>> = {};
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ForecastPage>(context, `/forecasts?${qs}`, {
      headers: { authorization: auth },
    });
    for (const f of page.items) {
      if (f.period !== body.period) continue;
      if (restrict && !restrict.has(f.repEmail.toLowerCase())) continue;
      const repKey = f.repEmail.toLowerCase();
      const byCat = (latest[repKey] ??= {});
      const prev = byCat[f.category];
      if (!prev || prev.submittedAt < f.submittedAt) byCat[f.category] = f;
    }
    cursor = page.nextCursor;
  } while (cursor);

  const totals = { commit: 0, upside: 0, pipeline: 0, closed: 0 };
  const reps: Array<{ repEmail: string; commit: number; upside: number; pipeline: number; closed: number }> = [];
  for (const [repKey, byCat] of Object.entries(latest)) {
    const row = { repEmail: repKey, commit: 0, upside: 0, pipeline: 0, closed: 0 };
    for (const cat of ["commit", "upside", "pipeline", "closed"] as const) {
      const f = byCat[cat];
      if (f) {
        row[cat] = f.amountCents;
        totals[cat] += f.amountCents;
      }
    }
    reps.push(row);
  }

  return new Response(
    JSON.stringify({
      period: body.period,
      managerEmail: body.managerEmail ?? null,
      totals,
      reps,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
