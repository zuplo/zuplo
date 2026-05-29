import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { commentRepository, type Comment } from "../repositories/tickets.ts";

interface Body {
  ticketId: string;
  authorEmail: string;
  body: string;
  kind?: Comment["kind"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await commentRepository.create(tenantId, {
    ticketId: body.ticketId,
    authorEmail: body.authorEmail,
    body: body.body,
    kind: body.kind ?? "public",
    postedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
