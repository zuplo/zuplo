import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { hireRepository } from "../repositories/hires.ts";
import type { OnboardingTask } from "../repositories/onboarding-tasks.ts";
import {
  postSlackMessage,
  lookupSlackUserByEmail,
  openSlackDm,
} from "../integrations/slack.ts";

/**
 * Orchestrator MCP tool: notify_buddy.
 *
 * Reads the hire + their first-week buddy-category tasks and posts a Slack
 * DM to the buddy with the first-week checklist. Resolves the buddy's
 * Slack user id from their email (users.lookupByEmail) and opens a DM
 * channel before posting.
 *
 * Set `dryRun: true` to return the drafted message without sending — useful
 * for review or audit.
 */

interface Body {
  hireId: string;
  /** When true, return the drafted message but don't actually post to Slack. */
  dryRun?: boolean;
  /** Override the buddy's Slack user id (skip the email lookup). */
  buddySlackUserId?: string;
}

interface TaskPage {
  items: OnboardingTask[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.hireId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "hireId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const hire = await hireRepository.get(tenantId, body.hireId);
  if (!hire) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Hire not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  if (!hire.buddyEmail) {
    return new Response(
      JSON.stringify({ error: { type: "no_buddy", message: "No buddy assigned to this hire" } }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }

  // Pull all tasks for this hire and pick the buddy-category ones with a
  // dueDate inside the first week.
  const allTasks: OnboardingTask[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      hireId: body.hireId,
      category: "buddy",
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TaskPage>(
      context,
      `/tasks?${qs}`,
      { headers: { authorization: auth } },
    );
    allTasks.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const start = new Date(`${hire.startDate}T00:00:00Z`);
  const weekEnd = new Date(start);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekEndIso = weekEnd.toISOString().slice(0, 10);
  const firstWeekTasks = allTasks.filter(
    (t) => t.dueDate >= hire.startDate && t.dueDate <= weekEndIso,
  );

  // Build a Slack-formatted message (mrkdwn).
  const lines = [
    `:wave: *Buddy check-in*`,
    `${hire.firstName} ${hire.lastName} starts on *${hire.startDate}* as ${hire.role}, and you've been paired as their buddy.`,
    ``,
    `*First-week checklist:*`,
    ...firstWeekTasks.map(
      (t) => `• \`${t.dueDate}\` ${t.title} — ${t.description}`,
    ),
    ``,
    `Let HR know if anything looks off. Thanks!`,
  ];
  const text = lines.join("\n");

  // Resolve the buddy's Slack user id and open a DM.
  let dmChannel: string | null = null;
  let slackUserId: string | null = null;
  let resolveError: string | undefined;

  if (!body.dryRun) {
    try {
      slackUserId =
        body.buddySlackUserId ??
        (await lookupSlackUserByEmail(hire.buddyEmail)).userId;
      const dm = await openSlackDm({ userId: slackUserId });
      dmChannel = dm.channelId;
    } catch (err) {
      resolveError = (err as Error).message;
    }
  }

  let postResult: { sent: boolean; channel?: string; ts?: string; error?: string } | undefined;
  if (!body.dryRun && dmChannel) {
    try {
      const result = await postSlackMessage({
        channel: dmChannel,
        text,
      });
      postResult = { sent: true, channel: result.channel, ts: result.ts };
    } catch (err) {
      postResult = { sent: false, error: (err as Error).message };
    }
  } else if (!body.dryRun && resolveError) {
    postResult = { sent: false, error: resolveError };
  }

  return new Response(
    JSON.stringify({
      buddy: {
        email: hire.buddyEmail,
        slackUserId,
        dmChannel,
      },
      hire: {
        id: hire.id,
        firstName: hire.firstName,
        lastName: hire.lastName,
        startDate: hire.startDate,
        role: hire.role,
      },
      taskCount: firstWeekTasks.length,
      tasks: firstWeekTasks,
      message: { text },
      post: postResult,
      dryRun: Boolean(body.dryRun),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
