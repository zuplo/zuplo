import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { invoiceRepository } from "../repositories/invoices.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const invoice = await invoiceRepository.get(tenantId, id);
  if (!invoice) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Invoice not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(invoice), {
    headers: { "content-type": "application/json" },
  });
}
