import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { announcementRepository } from "../repositories/announcements.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const announcement = await announcementRepository.get(tenantId, id);
  if (!announcement) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Announcement not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(announcement), {
    headers: { "content-type": "application/json" },
  });
}
