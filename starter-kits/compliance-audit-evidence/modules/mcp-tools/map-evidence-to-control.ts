import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Control, Evidence } from "../repositories/evidence.ts";

/**
 * Orchestrator MCP tool: map_evidence_to_control.
 *
 * Returns every Evidence row tied to a control along with a `currentness`
 * flag (`current` | `stale`) computed from `collectedAt` and the control's
 * `evidenceFrequencyDays`. The LLM gets a single tool to answer
 * "what evidence do we have for CC6.1, and is it fresh?".
 */

interface Body {
  controlId: string;
}

interface EvidencePage {
  items: Evidence[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const control = await invokeJson<Control>(context, `/controls/${body.controlId}`, {
    headers: auth,
  });

  // Pull all evidence and filter — repository abstraction doesn't expose
  // arbitrary `where` clauses across all adapters.
  const allEvidence: Evidence[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<EvidencePage>(context, `/evidence?${qs}`, { headers: auth });
    allEvidence.push(...page.items);
    cursor = page.nextCursor;
    if (allEvidence.length > 10000) break;
  } while (cursor);

  const now = Date.now();
  const linked = allEvidence
    .filter((e) => e.controlId === control.id)
    .map((e) => {
      const collectedMs = new Date(e.collectedAt).getTime();
      const expiresMs = collectedMs + control.evidenceFrequencyDays * 24 * 60 * 60 * 1000;
      const currentness: "current" | "stale" = now < expiresMs ? "current" : "stale";
      return {
        evidence: e,
        currentness,
        daysUntilExpiry: Math.floor((expiresMs - now) / (1000 * 60 * 60 * 24)),
      };
    });

  return new Response(
    JSON.stringify({
      control,
      count: linked.length,
      currentCount: linked.filter((l) => l.currentness === "current").length,
      staleCount: linked.filter((l) => l.currentness === "stale").length,
      evidence: linked,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
