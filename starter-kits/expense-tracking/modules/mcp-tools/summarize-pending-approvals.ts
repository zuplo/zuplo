import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Expense } from "../repositories/expenses.ts";

/**
 * Orchestrator MCP tool: summarize_pending_approvals.
 *
 * Lists expenses in `submitted` status grouped by employee, with counts and
 * totals. The optional `approverEmail` is informational metadata — this kit
 * doesn't model approver assignment, so the LLM can use the result to decide
 * what to ask the approver next.
 */

interface Body {
  approverEmail?: string;
}

interface ExpensePage { items: Expense[]; nextCursor: string | null }

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const expenses: Expense[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ExpensePage>(context, `/expenses?${qs}`, { headers: auth });
    expenses.push(...page.items);
    cursor = page.nextCursor;
    if (expenses.length > 10000) break;
  } while (cursor);

  const submitted = expenses.filter((e) => e.status === "submitted");

  const groupsMap = new Map<string, { employeeEmail: string; count: number; totalCents: number; expenses: Expense[] }>();
  for (const e of submitted) {
    const g = groupsMap.get(e.employeeEmail) ?? {
      employeeEmail: e.employeeEmail,
      count: 0,
      totalCents: 0,
      expenses: [],
    };
    g.count += 1;
    g.totalCents += e.amountCents;
    g.expenses.push(e);
    groupsMap.set(e.employeeEmail, g);
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) => b.totalCents - a.totalCents);

  return new Response(
    JSON.stringify({
      approverEmail: body.approverEmail ?? null,
      employeeCount: groups.length,
      pendingCount: submitted.length,
      pendingTotalCents: submitted.reduce((s, e) => s + e.amountCents, 0),
      groups,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
