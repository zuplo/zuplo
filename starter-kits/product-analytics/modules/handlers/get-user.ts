import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { userRepository } from "../repositories/events.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const user = await userRepository.get(tenantId, id);
  if (!user) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "User not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(user), {
    headers: { "content-type": "application/json" },
  });
}
