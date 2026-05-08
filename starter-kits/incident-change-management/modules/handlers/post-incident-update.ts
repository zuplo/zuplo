import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  incidentUpdateRepository,
  type IncidentUpdate,
} from "../repositories/incidents.ts";
import { postSlackMessage } from "../integrations/slack.ts";

interface Body {
  incidentId: string;
  body: string;
  postedBy: string;
  audience?: IncidentUpdate["audience"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await incidentUpdateRepository.create(tenantId, {
    incidentId: body.incidentId,
    body: body.body,
    postedBy: body.postedBy,
    postedAt: new Date().toISOString(),
    audience: body.audience ?? "internal",
  });

  // Mirror update to Slack — internal-only audience still goes to the
  // internal incidents channel. Customer-facing updates can be threaded
  // off the original incident message in a future iteration.
  try {
    const text = [
      `*Update on incident ${created.incidentId}* (${created.audience})`,
      `> ${created.body}`,
      `— ${created.postedBy}`,
    ].join("\n");
    await postSlackMessage({ text });
  } catch (err) {
    context.log.warn(
      `Slack mirror failed for incident ${created.incidentId}: ${(err as Error).message}`,
    );
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
