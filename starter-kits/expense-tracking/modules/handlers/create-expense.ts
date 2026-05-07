import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { expenseRepository } from "../repositories/expenses.ts";

interface Body {
  employeeEmail: string;
  amountCents: number;
  currency: string;
  merchant: string;
  category: string;
  date: string;
  description: string;
  receiptUrl?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await expenseRepository.create(tenantId, {
    employeeEmail: body.employeeEmail,
    amountCents: body.amountCents,
    currency: body.currency,
    merchant: body.merchant,
    category: body.category,
    date: body.date,
    description: body.description,
    receiptUrl: body.receiptUrl ?? null,
    status: "draft",
    policyViolation: false,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
