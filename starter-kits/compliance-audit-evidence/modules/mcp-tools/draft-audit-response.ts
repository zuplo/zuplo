import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Control, Evidence, Finding } from "../repositories/evidence.ts";

/**
 * Orchestrator MCP tool: draft_audit_response.
 *
 * Given a Finding id, hydrates the linked Control + all evidence on that
 * control and returns a structured "draft response" the LLM can rewrite for
 * tone. Saves the agent from chaining 3 tool calls + a join.
 */

interface Body {
  findingId: string;
}

interface FindingPage {
  items: Finding[];
  nextCursor: string | null;
}

interface EvidencePage {
  items: Evidence[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Find the finding by scanning the list (no GET-by-id route exposed).
  const allFindings: Finding[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<FindingPage>(context, `/findings?${qs}`, { headers: auth });
    allFindings.push(...page.items);
    cursor = page.nextCursor;
    if (allFindings.length > 10000) break;
  } while (cursor);

  const finding = allFindings.find((f) => f.id === body.findingId);
  if (!finding) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Finding not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const control = await invokeJson<Control>(context, `/controls/${finding.controlId}`, {
    headers: auth,
  });

  const allEvidence: Evidence[] = [];
  let eCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (eCursor) qs.set("cursor", eCursor);
    const page = await invokeJson<EvidencePage>(context, `/evidence?${qs}`, { headers: auth });
    allEvidence.push(...page.items);
    eCursor = page.nextCursor;
    if (allEvidence.length > 10000) break;
  } while (eCursor);
  const linkedEvidence = allEvidence.filter((e) => e.controlId === control.id);

  const evidenceLines = linkedEvidence
    .map((e) => `- ${e.title} (${e.kind}, collected ${e.collectedAt}, sha256: ${e.sha256})`)
    .join("\n");
  const draftResponse = [
    `Finding: ${finding.severity.toUpperCase()} severity on control ${control.slug} — ${control.title}.`,
    "",
    `Description: ${finding.description}`,
    "",
    `Owner: ${finding.owner}`,
    "",
    "Supporting evidence:",
    evidenceLines || "- No evidence linked to this control yet.",
    "",
    "Proposed remediation: <fill in remediation steps>.",
    "Target completion: <fill in date>.",
  ].join("\n");

  return new Response(
    JSON.stringify({
      finding,
      control,
      linkedEvidence,
      draftResponse,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
