import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  subscriberRepository,
  type Subscriber,
} from "../repositories/subscribers.ts";

interface Body {
  email: string;
  components?: string[];
  notifyOnImpact?: Subscriber["notifyOnImpact"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await subscriberRepository.create(tenantId, {
    email: body.email,
    components: body.components ?? [],
    notifyOnImpact: body.notifyOnImpact ?? "minor",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
