import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { purchaseRequestRepository } from "../repositories/purchase-requests.ts";
import { sendResendEmail, defaultFrom } from "../integrations/resend.ts";

interface Body {
  approverEmail: string;
  reason?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;
  try {
    const updated = await purchaseRequestRepository.update(tenantId, id, {
      status: "rejected",
      approverEmail: body.approverEmail,
      approvedAt: new Date().toISOString(),
    });

    if (environment.RESEND_API_KEY && updated.requesterEmail) {
      try {
        const total = (updated.totalCents / 100).toFixed(2);
        await sendResendEmail({
          from: defaultFrom(),
          to: updated.requesterEmail,
          subject: `Purchase request ${updated.id} was rejected`,
          text: `Hi,\n\nYour purchase request ${updated.id} for ${updated.currency} ${total} (cost center ${updated.costCenter}) was rejected by ${body.approverEmail}.\n\nReason: ${body.reason ?? "No reason provided. Please reach out to the approver directly."}\n\nIf you'd like to revise and resubmit, raise a new request with updated justification.`,
          tags: [
            { name: "kit", value: "procurement-po" },
            { name: "request_id", value: updated.id },
          ],
        });
      } catch (err) {
        context.log.error(
          `reject_purchase_request email failed: ${err instanceof Error ? err.message : String(err)}`,
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
