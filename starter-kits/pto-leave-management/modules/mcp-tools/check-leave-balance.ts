import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  leaveBalanceRepository,
} from "../repositories/leave-balances.ts";
import { completeWithClaude } from "../integrations/claude.ts";

/**
 * Orchestrator MCP tool: check_leave_balance.
 *
 * Reads the snapshot LeaveBalance rows for an employee and returns
 * available days by leave type. When `draftReply: true`, also asks Claude
 * to write a short, friendly reply the requester can paste into Slack or
 * email — turning a raw balance lookup into a polished response.
 */

interface Body {
  employeeId: string;
  /** When true, ask Claude to draft a personalized text response. */
  draftReply?: boolean;
  /** Optional context for the reply (e.g. "Maria asked if she can take June 14-21"). */
  question?: string;
  /** Optional employee display name for the reply ("Maria" instead of "emp-42"). */
  employeeName?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.employeeId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "employeeId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Production note: compute from accrual rules + approved leave requests.
  // For this starter kit we read from a snapshot repository.
  const page = await leaveBalanceRepository.list(tenantId, { limit: 200 });
  const balances = page.items.filter((b) => b.employeeId === body.employeeId);

  const byType: Record<string, { balanceDays: number; accruedYtd: number }> = {};
  for (const b of balances) {
    byType[b.type] = {
      balanceDays: b.balanceDays,
      accruedYtd: b.accruedYtd,
    };
  }

  // Optional: ask Claude to draft a friendly reply with these numbers in plain English.
  let draftedReply: { text: string; model: string; inputTokens: number; outputTokens: number } | undefined;
  if (body.draftReply) {
    const summary = Object.entries(byType)
      .map(([type, b]) => `- ${type}: ${b.balanceDays} day${b.balanceDays === 1 ? "" : "s"} available (accrued ${b.accruedYtd} YTD)`)
      .join("\n");
    const subject =
      body.question ??
      `What is ${body.employeeName ?? body.employeeId}'s remaining leave balance?`;
    try {
      const completion = await completeWithClaude({
        system:
          "You are an HR assistant at a small company. Reply to the manager's question in 2-3 short sentences. Use the provided balance data. Be warm but precise. If the balance can't satisfy the request, say so directly. Never invent numbers — only use the data you're given.",
        messages: [
          {
            role: "user",
            content:
              `Question: ${subject}\n\n` +
              `Employee: ${body.employeeName ?? body.employeeId}\n` +
              `Current leave balance:\n${summary || "(no balance records)"}\n\n` +
              `Write the reply.`,
          },
        ],
        temperature: 0.3,
        maxTokens: 400,
      });
      draftedReply = {
        text: completion.text,
        model: completion.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      };
    } catch (err) {
      draftedReply = {
        text: `(Claude draft unavailable: ${(err as Error).message})`,
        model: "",
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  return new Response(
    JSON.stringify({
      employeeId: body.employeeId,
      balances: byType,
      asOf: new Date().toISOString(),
      productionNote: "Snapshot-based. Real implementations compute balances from accrual policies + approved/pending leave.",
      draftedReply,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
