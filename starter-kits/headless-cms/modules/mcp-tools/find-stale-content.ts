import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Entry } from "../repositories/entries.ts";

/**
 * Orchestrator MCP tool: find_stale_content.
 *
 * Iterates published entries and returns those whose `updatedAt` is older
 * than `olderThanDays`. Optionally constrained to a single content type.
 * Useful for quarterly content audits.
 */

interface Body {
  olderThanDays?: number;
  contentTypeSlug?: string;
}

interface EntryPage {
  items: Entry[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const olderThanDays = Math.max(1, Math.min(3650, body.olderThanDays ?? 90));
  const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
  const auth = request.headers.get("authorization") ?? "";

  const stale: Entry[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", status: "published" });
    if (body.contentTypeSlug) qs.set("contentTypeSlug", body.contentTypeSlug);
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<EntryPage>(context, `/entries?${qs}`, {
      headers: { authorization: auth },
    });
    for (const entry of page.items) {
      if (entry.status !== "published") continue;
      if (entry.updatedAt < cutoff) stale.push(entry);
    }
    cursor = page.nextCursor;
    if (stale.length > 1000) break;
  } while (cursor);

  return new Response(
    JSON.stringify({
      olderThanDays,
      contentTypeSlug: body.contentTypeSlug ?? null,
      cutoff,
      count: stale.length,
      entries: stale,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
