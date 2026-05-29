import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Asset, Assignment } from "../repositories/assets.ts";

/**
 * Orchestrator MCP tool: assign_laptop_to_hire.
 *
 * Picks the first in_stock asset of the requested kind, creates an Assignment
 * for the new hire, and flips the asset to assigned. The LLM hands the agent
 * a single tool instead of teaching it to filter, choose, and call POST.
 */

interface Body {
  employeeEmail: string;
  kind?: Asset["kind"];
}

interface AssetPage {
  items: Asset[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const kind: Asset["kind"] = body.kind ?? "laptop";
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Find an in_stock asset of the requested kind.
  let chosen: Asset | undefined;
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<AssetPage>(context, `/assets?${qs}`, { headers: auth });
    chosen = page.items.find((a) => a.status === "in_stock" && a.kind === kind);
    if (chosen) break;
    cursor = page.nextCursor;
  } while (cursor);

  if (!chosen) {
    return new Response(
      JSON.stringify({
        error: {
          type: "no_inventory",
          message: `No in_stock ${kind} available. Procure one or pick a different kind.`,
        },
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }

  const assignment = await invokeJson<Assignment>(context, `/assignments`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      assetId: chosen.id,
      employeeEmail: body.employeeEmail,
    }),
  });

  return new Response(
    JSON.stringify({
      asset: chosen,
      assignment,
      message: `Assigned ${chosen.make} ${chosen.model} (${chosen.assetTag}) to ${body.employeeEmail}.`,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
