import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { subscriberRepository } from "../repositories/subscribers.ts";

interface Body {
  email: string;
  firstName?: string;
  lastName?: string;
  attributes?: Record<string, unknown>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await subscriberRepository.create(tenantId, {
    email: body.email,
    firstName: body.firstName ?? "",
    lastName: body.lastName ?? "",
    status: "subscribed",
    attributes: body.attributes ?? {},
    subscribedAt: now,
    unsubscribedAt: null,
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
