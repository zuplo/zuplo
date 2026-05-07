import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Client, Matter } from "../repositories/matters.ts";

/**
 * Orchestrator MCP tool: check_conflict_before_intake.
 *
 * Given a prospect's name, scan existing clients (by name and conflicts list)
 * and matters (by title and description) for any name overlap. Returns flagged
 * matches so the agent can summarize them for the partner.
 */

interface Body {
  prospectName: string;
}

interface ClientPage { items: Client[]; nextCursor: string | null; }
interface MatterPage { items: Matter[]; nextCursor: string | null; }

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.prospectName) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "prospectName is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const clients: Client[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ClientPage>(context, `/clients?${qs}`, { headers: auth });
    clients.push(...page.items);
    cursor = page.nextCursor;
    if (clients.length > 5000) break;
  } while (cursor);

  const matters: Matter[] = [];
  let mCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (mCursor) qs.set("cursor", mCursor);
    const page = await invokeJson<MatterPage>(context, `/matters?${qs}`, { headers: auth });
    matters.push(...page.items);
    mCursor = page.nextCursor;
    if (matters.length > 5000) break;
  } while (mCursor);

  const prospectTokens = tokens(body.prospectName);
  const overlap = (s: string) => {
    const t = tokens(s);
    for (const p of prospectTokens) if (t.has(p)) return true;
    return false;
  };

  const flaggedClients = clients.filter(
    (c) => overlap(c.name) || c.conflicts.some((conf) => overlap(conf)),
  );
  const flaggedMatters = matters.filter(
    (m) => overlap(m.title) || overlap(m.description),
  );

  return new Response(
    JSON.stringify({
      prospectName: body.prospectName,
      hasFlags: flaggedClients.length > 0 || flaggedMatters.length > 0,
      flaggedClients,
      flaggedMatters,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
