import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Asset, Assignment } from "../repositories/assets.ts";

/**
 * Orchestrator MCP tool: schedule_refresh_cycle.
 *
 * Returns a list of assets older than `ageYears` (computed from purchaseDate)
 * that need refreshing. Each entry includes the open Assignment so an agent
 * knows who to contact and what kind of replacement to procure.
 */

interface Body {
  ageYears: number;
  kind?: Asset["kind"];
}

interface AssetPage {
  items: Asset[];
  nextCursor: string | null;
}

interface AssignmentPage {
  items: Assignment[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const ageYears = Math.max(0, Math.min(20, body.ageYears));
  const kind = body.kind ?? null;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const allAssets: Asset[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<AssetPage>(context, `/assets?${qs}`, { headers: auth });
    allAssets.push(...page.items);
    cursor = page.nextCursor;
    if (allAssets.length > 10000) break;
  } while (cursor);

  const allAssignments: Assignment[] = [];
  let asCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (asCursor) qs.set("cursor", asCursor);
    const page = await invokeJson<AssignmentPage>(context, `/assignments?${qs}`, { headers: auth });
    allAssignments.push(...page.items);
    asCursor = page.nextCursor;
    if (allAssignments.length > 10000) break;
  } while (asCursor);

  // Index open assignments (returnedAt null) by assetId.
  const openByAsset = new Map<string, Assignment>();
  for (const a of allAssignments) {
    if (a.returnedAt === null && !openByAsset.has(a.assetId)) {
      openByAsset.set(a.assetId, a);
    }
  }

  const now = Date.now();
  const cutoffMs = ageYears * 365 * 24 * 60 * 60 * 1000;

  const due = allAssets
    .filter((a) => a.status !== "retired" && a.status !== "lost")
    .filter((a) => kind === null || a.kind === kind)
    .filter((a) => now - new Date(a.purchaseDate).getTime() >= cutoffMs)
    .map((a) => ({
      asset: a,
      ageYears: Number(((now - new Date(a.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365)).toFixed(2)),
      currentAssignment: openByAsset.get(a.id) ?? null,
    }));

  return new Response(
    JSON.stringify({
      count: due.length,
      ageYears,
      kind,
      assets: due,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
