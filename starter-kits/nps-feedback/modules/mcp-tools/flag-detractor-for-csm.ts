import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Response_ } from "../repositories/responses.ts";

interface Body {
  segment?: string;
  daysBack?: number;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Orchestrator: flag_detractor_for_csm.
 *
 * Returns recent detractor responses (score 0..6) where `followedUp` is
 * still false. Optionally filterable by segment so a segment-specific CSM
 * sees only their book.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const daysBack = body.daysBack ?? 14;
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();

  const detractors: Response_[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", category: "detractor" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<Page<Response_>>(context, `/responses?${qs}`, {
      headers: { authorization: auth },
    });
    for (const r of page.items) {
      if (r.followedUp) continue;
      if (r.respondedAt < cutoff) continue;
      if (body.segment && r.segment !== body.segment) continue;
      detractors.push(r);
    }
    cursor = page.nextCursor;
    if (detractors.length > 1000) break;
  } while (cursor);

  return new Response(
    JSON.stringify({
      filter: { segment: body.segment ?? null, daysBack },
      detractorCount: detractors.length,
      detractors,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
