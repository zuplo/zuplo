import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { verifyDocusignWebhook } from "../integrations/docusign.ts";
import { quoteRepository } from "../repositories/quotes.ts";

interface DocusignWebhookEnvelope {
  data?: {
    envelopeId?: string;
    envelopeSummary?: {
      status?: string;
      customFields?: {
        textCustomFields?: Array<{ name: string; value: string }>;
      };
    };
  };
  event?: string;
}

/**
 * Inbound webhook: DocuSign Connect.
 *
 * Verifies the HMAC signature from DocuSign Connect, parses the event,
 * and on "envelope-completed" finds the quote (via the quoteId custom
 * field set when sending the envelope) and flips it to status=accepted.
 *
 * Required headers:
 *   x-docusign-signature-1: HMAC-SHA256 signature, base64
 *
 * Configure your Connect webhook URL: https://<gateway>/webhooks/docusign
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const sig = request.headers.get("x-docusign-signature-1");
  if (!sig) {
    return new Response("missing signature", { status: 400 });
  }

  const raw = await request.text();
  let valid = false;
  try {
    valid = await verifyDocusignWebhook(raw, sig);
  } catch (err) {
    context.log.error(`DocuSign webhook verify error: ${(err as Error).message}`);
    return new Response("verification failed", { status: 500 });
  }
  if (!valid) {
    return new Response("invalid signature", { status: 401 });
  }

  let event: DocusignWebhookEnvelope;
  try {
    event = JSON.parse(raw) as DocusignWebhookEnvelope;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // The tenant id has to come from somewhere; for DocuSign Connect we
  // require the quote id custom field, then look up the quote across all
  // tenants by id. In multi-tenant deployments encode the tenant id in
  // the custom field too (e.g. "tenant_id:quote_id").
  const status = event.data?.envelopeSummary?.status?.toLowerCase();
  const customFields =
    event.data?.envelopeSummary?.customFields?.textCustomFields ?? [];
  const quoteIdField = customFields.find((f) => f.name === "quoteId");
  const quoteId = quoteIdField?.value;

  if (status === "completed" && quoteId) {
    // Multi-tenant: look up via a known DOCUSIGN_TENANT_HINT env or via a
    // tenant-prefixed custom field. For the kit we accept a TENANT_ID env.
    const tenantId =
      process.env.DOCUSIGN_TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "default";
    try {
      await quoteRepository.update(tenantId, quoteId, {
        status: "accepted",
        acceptedAt: new Date().toISOString(),
      });
    } catch (err) {
      context.log.warn(
        `Could not flip quote ${quoteId} to accepted: ${(err as Error).message}`,
      );
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
  });
}
