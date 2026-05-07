import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { ticketRepository, type IncidentTicket } from "../repositories/tickets.ts";

interface Body {
  requesterEmail: string;
  subject: string;
  body: string;
  category?: IncidentTicket["category"];
  priority?: IncidentTicket["priority"];
  assigneeEmail?: string | null;
  tags?: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await ticketRepository.create(tenantId, {
    requesterEmail: body.requesterEmail,
    subject: body.subject,
    body: body.body,
    category: body.category ?? "other",
    priority: body.priority ?? "med",
    status: "new",
    assigneeEmail: body.assigneeEmail ?? null,
    slaBreachAt: null,
    openedAt: new Date().toISOString(),
    resolvedAt: null,
    tags: body.tags ?? [],
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
