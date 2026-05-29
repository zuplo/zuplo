import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { IncidentUpdate } from "../repositories/incident-updates.ts";

/**
 * Orchestrator MCP tool: post_postmortem_summary.
 *
 * After an incident is resolved, posts a final timeline update containing
 * an excerpt of the postmortem (or full text, capped) plus a `link` reference
 * the LLM can include later. Calls the public post_incident_update endpoint
 * via context.invokeRoute so the timeline stays the source of truth.
 */

interface Body {
  incidentId: string;
  postmortemText: string;
  postmortemUrl?: string;
}

const EXCERPT_LIMIT = 800;

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.incidentId || !body.postmortemText) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "incidentId and postmortemText are required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const excerpt =
    body.postmortemText.length > EXCERPT_LIMIT
      ? `${body.postmortemText.slice(0, EXCERPT_LIMIT)}…`
      : body.postmortemText;

  const updateBody = body.postmortemUrl
    ? `Postmortem published. ${excerpt}\n\nFull writeup: ${body.postmortemUrl}`
    : `Postmortem published. ${excerpt}`;

  const update = await invokeJson<IncidentUpdate>(
    context,
    `/incidents/${body.incidentId}/updates`,
    {
      method: "POST",
      headers: {
        authorization: auth,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        body: updateBody,
        status: "resolved",
      }),
    },
  );

  return new Response(
    JSON.stringify({
      incidentId: body.incidentId,
      excerptLength: excerpt.length,
      truncated: body.postmortemText.length > EXCERPT_LIMIT,
      update,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
