import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { followUpRepository, type FollowUp } from "../repositories/follow-ups.ts";
import { responseRepository } from "../repositories/responses.ts";

interface Body {
  responseId: string;
  byEmail: string;
  kind: FollowUp["kind"];
  body: string;
}

/**
 * Log a follow-up and flip the response's `followedUp` flag so the
 * detractor tracker stops surfacing it.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await followUpRepository.create(tenantId, {
    responseId: body.responseId,
    byEmail: body.byEmail,
    kind: body.kind,
    body: body.body,
    sentAt: new Date().toISOString(),
  });

  try {
    await responseRepository.update(tenantId, body.responseId, {
      followedUp: true,
    });
  } catch (err) {
    // The follow-up itself was logged successfully; if the response was
    // since deleted just continue.
    if (!(err instanceof NotFoundError)) throw err;
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
