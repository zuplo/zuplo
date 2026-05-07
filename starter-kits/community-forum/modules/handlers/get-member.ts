import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { memberRepository } from "../repositories/members.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const member = await memberRepository.get(tenantId, id);
  if (!member) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Member not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(member), {
    headers: { "content-type": "application/json" },
  });
}
