import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { expenseRepository } from "../repositories/expenses.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const expense = await expenseRepository.get(tenantId, id);
  if (!expense) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Expense not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(expense), {
    headers: { "content-type": "application/json" },
  });
}
