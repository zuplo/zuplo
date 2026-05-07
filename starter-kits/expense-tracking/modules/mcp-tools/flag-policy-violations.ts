import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Expense, ExpenseCategory, ExpensePolicy } from "../repositories/expenses.ts";

/**
 * Orchestrator MCP tool: flag_policy_violations.
 *
 * Walks expenses, joins categories + policies, and returns expenses that
 * either exceed a daily/per-diem cap or are missing a receipt where one is
 * required.
 */

interface Body {
  employeeEmail?: string;
}

interface ExpensePage { items: Expense[]; nextCursor: string | null }
interface CategoryPage { items: ExpenseCategory[]; nextCursor: string | null }
interface PolicyPage { items: ExpensePolicy[]; nextCursor: string | null }

interface Violation {
  expense: Expense;
  reasons: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Pull all expenses (optionally filtered by employee in TS).
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

  const categories: ExpenseCategory[] = [];
  let cCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cCursor) qs.set("cursor", cCursor);
    const page = await invokeJson<CategoryPage>(context, `/expense-categories?${qs}`, { headers: auth });
    categories.push(...page.items);
    cCursor = page.nextCursor;
    if (categories.length > 1000) break;
  } while (cCursor);
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  const policies: ExpensePolicy[] = [];
  let pCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (pCursor) qs.set("cursor", pCursor);
    const page = await invokeJson<PolicyPage>(context, `/expense-policies?${qs}`, { headers: auth });
    policies.push(...page.items);
    pCursor = page.nextCursor;
    if (policies.length > 1000) break;
  } while (pCursor);

  // Default policy = the strictest dailyLimitCents across all policies, or unlimited.
  const dailyLimit = policies.reduce(
    (acc, p) => (p.dailyLimitCents > 0 ? Math.min(acc, p.dailyLimitCents) : acc),
    Number.POSITIVE_INFINITY,
  );
  const requireReceiptAbove = policies.reduce(
    (acc, p) => (p.requireReceiptAbove > 0 ? Math.min(acc, p.requireReceiptAbove) : acc),
    Number.POSITIVE_INFINITY,
  );

  const candidates = body.employeeEmail
    ? expenses.filter((e) => e.employeeEmail === body.employeeEmail)
    : expenses;

  const violations: Violation[] = [];
  for (const e of candidates) {
    const reasons: string[] = [];
    const cat = categoryByName.get(e.category);
    if (cat?.maxAmountCents != null && e.amountCents > cat.maxAmountCents) {
      reasons.push(`amount ${e.amountCents}c exceeds category ${cat.name} cap of ${cat.maxAmountCents}c`);
    }
    if (cat?.requiresReceipt && !e.receiptUrl) {
      reasons.push(`category ${cat.name} requires a receipt`);
    }
    if (Number.isFinite(requireReceiptAbove) && e.amountCents > requireReceiptAbove && !e.receiptUrl) {
      reasons.push(`amount ${e.amountCents}c is above policy receipt threshold ${requireReceiptAbove}c and no receipt is attached`);
    }
    if (Number.isFinite(dailyLimit) && e.amountCents > dailyLimit) {
      reasons.push(`amount ${e.amountCents}c exceeds daily policy limit ${dailyLimit}c`);
    }
    if (reasons.length > 0) violations.push({ expense: e, reasons });
  }

  return new Response(
    JSON.stringify({
      count: violations.length,
      totalExposureCents: violations.reduce((s, v) => s + v.expense.amountCents, 0),
      violations,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
