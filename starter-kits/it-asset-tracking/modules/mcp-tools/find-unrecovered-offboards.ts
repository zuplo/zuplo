import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Asset, Assignment } from "../repositories/assets.ts";

/**
 * Orchestrator MCP tool: find_unrecovered_offboards.
 *
 * Finds Assignments where returnedAt is null and the assignment was opened
 * more than `daysBack` days ago — i.e. equipment that has not been returned.
 * The LLM gets a list it can use to chase ex-employees or open a ticket.
 */

interface Body {
  daysBack?: number;
}

interface AssignmentPage {
  items: Assignment[];
  nextCursor: string | null;
}

interface AssetPage {
  items: Asset[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const daysBack = Math.max(0, Math.min(3650, body.daysBack ?? 30));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const allAssignments: Assignment[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<AssignmentPage>(context, `/assignments?${qs}`, { headers: auth });
    allAssignments.push(...page.items);
    cursor = page.nextCursor;
    if (allAssignments.length > 5000) break;
  } while (cursor);

  // Hydrate a map of assets so we can include the make/model/tag in the result.
  const allAssets: Asset[] = [];
  let aCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (aCursor) qs.set("cursor", aCursor);
    const page = await invokeJson<AssetPage>(context, `/assets?${qs}`, { headers: auth });
    allAssets.push(...page.items);
    aCursor = page.nextCursor;
    if (allAssets.length > 5000) break;
  } while (aCursor);
  const assetById = new Map(allAssets.map((a) => [a.id, a]));

  const now = Date.now();
  const cutoffMs = daysBack * 24 * 60 * 60 * 1000;

  const stale = allAssignments
    .filter((a) => a.returnedAt === null)
    .filter((a) => now - new Date(a.assignedAt).getTime() >= cutoffMs)
    .map((a) => ({
      assignment: a,
      asset: assetById.get(a.assetId) ?? null,
      daysOpen: Math.floor((now - new Date(a.assignedAt).getTime()) / (1000 * 60 * 60 * 24)),
    }));

  return new Response(
    JSON.stringify({
      count: stale.length,
      daysBack,
      assignments: stale,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
