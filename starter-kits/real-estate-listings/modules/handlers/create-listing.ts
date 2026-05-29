import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { listingRepository, type Listing } from "../repositories/listings.ts";

interface Body {
  mlsNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  listPriceCents: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  lotSizeSqft?: number;
  propertyType: Listing["propertyType"];
  listingAgentEmail: string;
  listedAt?: string;
  description?: string;
  status?: Listing["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await listingRepository.create(tenantId, {
    mlsNumber: body.mlsNumber,
    address: body.address,
    city: body.city,
    state: body.state,
    zip: body.zip,
    listPriceCents: body.listPriceCents,
    status: body.status ?? "active",
    bedrooms: body.bedrooms,
    bathrooms: body.bathrooms,
    squareFeet: body.squareFeet,
    lotSizeSqft: body.lotSizeSqft ?? 0,
    propertyType: body.propertyType,
    listingAgentEmail: body.listingAgentEmail,
    listedAt: body.listedAt ?? now,
    soldAt: null,
    soldPriceCents: null,
    description: body.description ?? "",
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
