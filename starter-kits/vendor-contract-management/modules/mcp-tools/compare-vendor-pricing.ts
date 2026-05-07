import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Contract, Vendor } from "../repositories/contracts.ts";

/**
 * Orchestrator: compare_vendor_pricing.
 *
 * For a given vendor category, lists every vendor in that category along
 * with the annual value of their currently active contract(s). Useful when
 * sourcing alternatives or benchmarking pricing.
 */

interface Body {
  category: string;
}

interface VendorPage {
  items: Vendor[];
  nextCursor: string | null;
}

interface ContractPage {
  items: Contract[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.category) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "category is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = request.headers.get("authorization") ?? "";

  // Pull every vendor in the category.
  const vendorsInCategory: Vendor[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<VendorPage>(context, `/vendors?${qs}`, {
      headers: { authorization: auth },
    });
    for (const v of page.items) {
      if (v.category === body.category) vendorsInCategory.push(v);
    }
    cursor = page.nextCursor;
  } while (cursor);

  // Pull all active contracts to attribute back to each vendor.
  const activeByVendor = new Map<string, Contract[]>();
  cursor = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ContractPage>(context, `/contracts?${qs}`, {
      headers: { authorization: auth },
    });
    for (const c of page.items) {
      if (c.status !== "active") continue;
      const arr = activeByVendor.get(c.vendorId) ?? [];
      arr.push(c);
      activeByVendor.set(c.vendorId, arr);
    }
    cursor = page.nextCursor;
  } while (cursor);

  const comparison = vendorsInCategory
    .map((vendor) => {
      const contracts = activeByVendor.get(vendor.id) ?? [];
      const totalAnnualCents = contracts.reduce((acc, c) => acc + c.annualValueCents, 0);
      return {
        vendorId: vendor.id,
        vendorName: vendor.name,
        contractCount: contracts.length,
        totalAnnualCents,
        contracts: contracts.map((c) => ({
          id: c.id,
          title: c.title,
          kind: c.kind,
          annualValueCents: c.annualValueCents,
          currency: c.currency,
        })),
      };
    })
    .sort((a, b) => a.totalAnnualCents - b.totalAnnualCents);

  return new Response(
    JSON.stringify({
      category: body.category,
      vendorCount: vendorsInCategory.length,
      comparison,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
