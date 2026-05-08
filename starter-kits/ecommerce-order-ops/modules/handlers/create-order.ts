import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { orderRepository, type Order } from "../repositories/orders.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    customerId: string;
    orderNumber: string;
    subtotalCents: number;
    shippingCents?: number;
    taxCents?: number;
    totalCents: number;
    currency?: string;
    fraudScore?: number;
    channel?: Order["channel"];
    buyerPhone?: string;
    shipToName?: string;
    shipToAddressLine1?: string;
    shipToAddressLine2?: string;
    shipToCityLocality?: string;
    shipToStateProvince?: string;
    shipToPostalCode?: string;
    shipToCountryCode?: string;
    parcelWeightOz?: number;
  };

  const created = await orderRepository.create(tenantId, {
    customerId: body.customerId,
    orderNumber: body.orderNumber,
    status: "pending",
    subtotalCents: body.subtotalCents,
    shippingCents: body.shippingCents ?? 0,
    taxCents: body.taxCents ?? 0,
    totalCents: body.totalCents,
    currency: body.currency ?? "USD",
    placedAt: new Date().toISOString(),
    paidAt: null,
    shippedAt: null,
    fraudScore: body.fraudScore ?? 0,
    channel: body.channel ?? "web",
    stripePaymentIntentId: null,
    buyerPhone: body.buyerPhone ?? null,
    shipToName: body.shipToName ?? null,
    shipToAddressLine1: body.shipToAddressLine1 ?? null,
    shipToAddressLine2: body.shipToAddressLine2 ?? null,
    shipToCityLocality: body.shipToCityLocality ?? null,
    shipToStateProvince: body.shipToStateProvince ?? null,
    shipToPostalCode: body.shipToPostalCode ?? null,
    shipToCountryCode: body.shipToCountryCode ?? null,
    parcelWeightOz: body.parcelWeightOz ?? null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
