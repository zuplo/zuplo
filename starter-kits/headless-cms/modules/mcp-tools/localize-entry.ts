import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Entry } from "../repositories/entries.ts";

/**
 * Orchestrator MCP tool: localize_entry.
 *
 * Reads the source entry, then creates a new draft entry in the target
 * locale that copies all fields verbatim. Translators then edit the draft.
 */

interface Body {
  entryId: string;
  targetLocale: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.entryId || !body.targetLocale) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "entryId and targetLocale are required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";

  const source = await invokeJson<Entry>(context, `/entries/${body.entryId}`, {
    headers: { authorization: auth },
  });

  const created = await invokeJson<Entry>(context, `/entries`, {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify({
      contentTypeSlug: source.contentTypeSlug,
      slug: `${source.slug}-${body.targetLocale}`,
      locale: body.targetLocale,
      status: "draft",
      title: source.title,
      body: source.body,
      excerpt: source.excerpt,
      authorEmail: source.authorEmail,
      fields: source.fields,
    }),
  });

  return new Response(
    JSON.stringify({
      sourceEntryId: source.id,
      sourceLocale: source.locale,
      targetLocale: body.targetLocale,
      newEntryId: created.id,
      newEntry: created,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
