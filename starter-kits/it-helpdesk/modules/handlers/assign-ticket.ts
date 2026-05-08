import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { ticketRepository } from "../repositories/tickets.ts";
import { dmSlackUserByEmail, postSlackMessage } from "../integrations/slack.ts";

interface Body {
  assigneeEmail: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  let updated;
  try {
    updated = await ticketRepository.update(tenantId, id, {
      assigneeEmail: body.assigneeEmail,
      status: "in_progress",
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }

  // Notify the assigned engineer in Slack. DM by email when a bot token is
  // configured; fall back to a channel post via incoming webhook. Slack
  // failures don't fail the assignment.
  const text = [
    `New ticket assigned: *${updated.id}* (${updated.priority} / ${updated.category})`,
    `> ${updated.subject}`,
    `Requester: ${updated.requesterEmail}`,
  ].join("\n");

  try {
    await dmSlackUserByEmail(body.assigneeEmail, { text });
  } catch (dmErr) {
    context.log.warn(
      `Slack DM failed for ${body.assigneeEmail}: ${(dmErr as Error).message}. Falling back to channel.`,
    );
    try {
      await postSlackMessage({ text });
    } catch (chanErr) {
      context.log.warn(`Slack notify failed: ${(chanErr as Error).message}`);
    }
  }

  return new Response(JSON.stringify(updated), {
    headers: { "content-type": "application/json" },
  });
}
