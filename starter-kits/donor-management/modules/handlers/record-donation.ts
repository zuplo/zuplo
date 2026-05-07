import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { donationRepository } from "../repositories/donations.ts";
import { donorRepository } from "../repositories/donors.ts";

interface Body {
  donorId: string;
  campaignId?: string;
  amountCents: number;
  currency: string;
  paymentMethod: string;
  taxDeductibleAmountCents?: number;
  anonymous?: boolean;
  restrictedFund?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const donor = await donorRepository.get(tenantId, body.donorId);
  if (!donor) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Donor not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  const donation = await donationRepository.create(tenantId, {
    donorId: body.donorId,
    campaignId: body.campaignId ?? null,
    amountCents: body.amountCents,
    currency: body.currency,
    receivedAt: now,
    paymentMethod: body.paymentMethod,
    taxDeductibleAmountCents: body.taxDeductibleAmountCents ?? body.amountCents,
    anonymous: body.anonymous ?? false,
    restrictedFund: body.restrictedFund ?? null,
  });

  try {
    await donorRepository.update(tenantId, donor.id, {
      lifetimeGivingCents: donor.lifetimeGivingCents + body.amountCents,
      lastGiftDate: now,
      giftCount: donor.giftCount + 1,
    });
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  return new Response(JSON.stringify(donation), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
