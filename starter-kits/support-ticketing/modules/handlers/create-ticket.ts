import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { ticketRepository, type Ticket } from "../repositories/tickets.ts";

interface Body {
  customerEmail: string;
  subject: string;
  body: string;
  priority?: Ticket["priority"];
  channel?: Ticket["channel"];
  assigneeEmail?: string | null;
  tags?: string[];
  slaBreachAt?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const now = new Date().toISOString();
  const created = await ticketRepository.create(tenantId, {
    customerEmail: body.customerEmail,
    subject: body.subject,
    body: body.body,
    status: "new",
    priority: body.priority ?? "normal",
    channel: body.channel ?? "api",
    assigneeEmail: body.assigneeEmail ?? null,
    tags: body.tags ?? [],
    slaBreachAt: body.slaBreachAt ?? null,
    openedAt: now,
    resolvedAt: null,
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
