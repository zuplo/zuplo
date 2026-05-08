import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { pledgeRepository } from "../repositories/pledges.ts";
import { donorRepository } from "../repositories/donors.ts";
import { sendPledgeEnvelope } from "../integrations/docusign.ts";

interface Body {
  donorId: string;
  amountCents: number;
  dueDate: string;
  /** If true and DocuSign creds are configured, send a pledge agreement to the donor. */
  sendForSignature?: boolean;
  /** Optional currency code for the agreement. Defaults to USD. */
  currency?: string;
  /** Optional pledge term in years for the agreement copy. */
  termYears?: number;
  /** Optional inline base64 PDF for the pledge agreement. */
  documentBase64?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await pledgeRepository.create(tenantId, {
    donorId: body.donorId,
    amountCents: body.amountCents,
    fulfilledCents: 0,
    dueDate: body.dueDate,
    status: "open",
    createdAt: new Date().toISOString(),
    docusignEnvelopeId: null,
    docusignStatus: null,
  });

  if (body.sendForSignature && environment.DOCUSIGN_ACCESS_TOKEN) {
    try {
      const donor = await donorRepository.get(tenantId, body.donorId);
      const env = await sendPledgeEnvelope({
        donorEmail: donor.email,
        donorName: `${donor.firstName} ${donor.lastName}`.trim(),
        amountCents: body.amountCents,
        currency: body.currency ?? "USD",
        termYears: body.termYears ?? 1,
        documentBase64: body.documentBase64,
        metadata: {
          tenant_id: tenantId,
          tenant_pledge_id: created.id,
          tenant_donor_id: donor.id,
        },
      });
      await pledgeRepository.update(tenantId, created.id, {
        docusignEnvelopeId: env.envelopeId,
        docusignStatus: env.status,
      });
      const refreshed = await pledgeRepository.get(tenantId, created.id);
      return new Response(JSON.stringify(refreshed), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      context.log.error(
        `create_pledge docusign send failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
