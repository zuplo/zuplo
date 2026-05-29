import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Control, Evidence } from "../repositories/evidence.ts";

/**
 * Orchestrator MCP tool: flag_stale_evidence.
 *
 * Walks every evidence row, joins it to its Control to read
 * `evidenceFrequencyDays`, and marks the evidence `stale` if
 * `collectedAt + frequency < now`. Returns the affected list.
 */

interface Body {
  framework?: Control["framework"];
}

interface EvidencePage {
  items: Evidence[];
  nextCursor: string | null;
}

interface ControlPage {
  items: Control[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const framework = body.framework ?? null;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

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

  const allControls: Control[] = [];
  let cCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cCursor) qs.set("cursor", cCursor);
    const page = await invokeJson<ControlPage>(context, `/controls?${qs}`, { headers: auth });
    allControls.push(...page.items);
    cCursor = page.nextCursor;
    if (allControls.length > 5000) break;
  } while (cCursor);
  const controlById = new Map(allControls.map((c) => [c.id, c]));

  const now = Date.now();
  const flagged: Array<{
    evidence: Evidence;
    control: Control | null;
    daysOverdue: number;
  }> = [];

  for (const ev of allEvidence) {
    const control = controlById.get(ev.controlId) ?? null;
    if (!control) continue;
    if (framework && control.framework !== framework) continue;
    if (ev.status !== "current") continue;
    const collectedMs = new Date(ev.collectedAt).getTime();
    const expiresMs = collectedMs + control.evidenceFrequencyDays * 24 * 60 * 60 * 1000;
    if (now < expiresMs) continue;

    const daysOverdue = Math.floor((now - expiresMs) / (1000 * 60 * 60 * 24));

    // Mark stale via the public PATCH route so the same audit/policy chain runs.
    const patched = await invokeJson<Evidence>(context, `/evidence/${ev.id}/stale`, {
      method: "PATCH",
      headers: auth,
    });

    flagged.push({ evidence: patched, control, daysOverdue });
  }

  return new Response(
    JSON.stringify({
      framework,
      count: flagged.length,
      flagged,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
