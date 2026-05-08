import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { expenseRepository } from "../repositories/expenses.ts";
import { sendResendEmail, defaultFrom } from "../integrations/resend.ts";
import { environment } from "@zuplo/runtime";

interface RejectBody {
  reason?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json().catch(() => ({}))) as RejectBody;

  try {
    const updated = await expenseRepository.update(tenantId, id, {
      status: "rejected",
    });

    // Best-effort email — only fires if RESEND_API_KEY is set, doesn't block
    // the response if it fails.
    if (environment.RESEND_API_KEY && updated.employeeEmail) {
      try {
        const reason = body.reason ?? "Please contact your manager for details.";
        await sendResendEmail({
          from: defaultFrom(),
          to: updated.employeeEmail,
          subject: `Expense rejected: ${updated.merchant}`,
          text: `Your expense for ${updated.merchant} (${updated.currency} ${(updated.amountCents / 100).toFixed(2)}) on ${updated.date} was rejected.\n\nReason: ${reason}\n\nIf this is a mistake, reply to this email or contact your approver.`,
          tags: [
            { name: "kit", value: "expense-tracking" },
            { name: "expense_id", value: updated.id },
          ],
        });
      } catch (err) {
        context.log.error(
          `reject_expense email failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
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
}
