import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { surveyRepository } from "../repositories/surveys.ts";

interface Body {
  recipients: string[];
}

/**
 * Mock send. Real implementations would enqueue an email-send job per
 * recipient via SES, Postmark, or your transactional provider; for the
 * starter kit we just acknowledge the call.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  const survey = await surveyRepository.get(tenantId, id);
  if (!survey) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Survey not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  if (survey.status !== "active") {
    return new Response(
      JSON.stringify({ error: { type: "conflict", message: "Survey is paused" } }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      surveyId: id,
      queued: body.recipients.length,
      sentAt: new Date().toISOString(),
      productionNote: "This handler is a stub. Wire up SES/Postmark/etc to actually deliver.",
    }),
    { status: 202, headers: { "content-type": "application/json" } },
  );
}
