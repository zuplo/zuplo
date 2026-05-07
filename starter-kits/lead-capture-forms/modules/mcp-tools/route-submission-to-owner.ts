import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Submission } from "../repositories/submissions.ts";

/**
 * Orchestrator MCP tool: route_submission_to_owner.
 *
 * Loads the submission, picks an owner from the supplied pool (or
 * `['unassigned']` if none) using a deterministic hash of the submission id,
 * and PATCHes the submission via `set_submission_owner`. Returns the chosen
 * owner plus a short trace explaining the choice.
 */
interface Body {
  submissionId: string;
  owners?: string[];
}

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const submission = await invokeJson<Submission>(
    context,
    `/submissions/${encodeURIComponent(body.submissionId)}`,
    { headers: { authorization: auth } },
  );

  const owners = (body.owners?.length ? body.owners : ["unassigned"]).filter(Boolean);
  const idx = hash(submission.id) % owners.length;
  const chosen = owners[idx];

  await invokeJson(
    context,
    `/submissions/${encodeURIComponent(submission.id)}/route`,
    {
      method: "PATCH",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({ routedTo: chosen }),
    },
  );

  return new Response(
    JSON.stringify({
      submissionId: submission.id,
      routedTo: chosen,
      trace: `Hashed ${submission.id} mod ${owners.length} = ${idx} → ${chosen}`,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
