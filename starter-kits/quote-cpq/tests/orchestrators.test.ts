import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import buildQuoteFromRequirements from "../modules/mcp-tools/build-quote-from-requirements.ts";
import explainPricing from "../modules/mcp-tools/explain-pricing.ts";
import routeForDiscountApproval from "../modules/mcp-tools/route-for-discount-approval.ts";
import sendQuote from "../modules/handlers/send-quote.ts";
import acceptQuote from "../modules/handlers/accept-quote.ts";
import createQuote from "../modules/handlers/create-quote.ts";
import getQuote from "../modules/handlers/get-quote.ts";
import addLineItem from "../modules/handlers/add-line-item.ts";
import listProducts from "../modules/handlers/list-products.ts";
import listPricingRules from "../modules/handlers/list-pricing-rules.ts";
import { quoteRepository } from "../modules/repositories/quotes.ts";
import { lineItemRepository } from "../modules/repositories/line-items.ts";
import { productRepository } from "../modules/repositories/products.ts";
import { pricingRuleRepository } from "../modules/repositories/pricing-rules.ts";

const routes = {
  "GET /products": listProducts,
  "GET /pricing-rules": listPricingRules,
  "POST /quotes": createQuote,
  "GET /quotes/:id": getQuote,
  "POST /quotes/:id/line-items": addLineItem,
};

async function clearAll(tenantId: string) {
  for (const repo of [
    quoteRepository,
    lineItemRepository,
    productRepository,
    pricingRuleRepository,
  ]) {
    let cursor: string | null | undefined = null;
    do {
      const page = await repo.list(tenantId, { limit: 200, cursor });
      for (const item of page.items) {
        await repo.delete(tenantId, item.id);
      }
      cursor = page.nextCursor;
    } while (cursor);
  }
}

describe("orchestrators/build-quote-from-requirements", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("creates quote, lines, and applies highest matching pricing rule", async () => {
    const product = await productRepository.create(tenantId, {
      sku: "P1",
      name: "Pro",
      listPriceCents: 50_000,
      recurringInterval: "yearly",
      category: "subs",
      active: true,
    });
    await pricingRuleRepository.create(tenantId, {
      name: "Volume 10%",
      productId: product.id,
      conditions: { minQuantity: 5 },
      discountPercent: 10,
      requiresApproval: false,
    });
    await pricingRuleRepository.create(tenantId, {
      name: "Enterprise 20%",
      productId: product.id,
      conditions: { customerSegment: "enterprise" },
      discountPercent: 20,
      requiresApproval: true,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/build-quote-from-requirements",
      method: "POST",
      body: {
        dealId: "d-1",
        customerId: "c-1",
        ownerEmail: "rep@example.com",
        productIds: [product.id],
        quantities: [10],
        customerSegment: "enterprise",
      },
      tenantId,
    });
    const response = await buildQuoteFromRequirements(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      quote: { id: string; subtotalCents: number; totalCents: number };
      lineItems: Array<{ id: string; discountPercent: number }>;
      rulesApplied: Array<{ ruleName: string; discountPercent: number }>;
    };
    expect(json.lineItems).toHaveLength(1);
    expect(json.rulesApplied).toHaveLength(1);
    // Highest matching: enterprise 20%
    expect(json.rulesApplied[0].discountPercent).toBe(20);
    expect(json.lineItems[0].discountPercent).toBe(20);
    expect(json.quote.subtotalCents).toBe(500_000);
    expect(json.quote.totalCents).toBe(400_000);
  });

  it("returns 400 when productIds and quantities mismatch", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/build-quote-from-requirements",
      method: "POST",
      body: {
        dealId: "d-1",
        customerId: "c-1",
        ownerEmail: "rep@example.com",
        productIds: ["p1", "p2"],
        quantities: [1],
      },
      tenantId,
    });
    const response = await buildQuoteFromRequirements(request, context);
    expect(response.status).toBe(400);
  });

  it("skips unknown product ids without crashing", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/build-quote-from-requirements",
      method: "POST",
      body: {
        dealId: "d-1",
        customerId: "c-1",
        ownerEmail: "rep@example.com",
        productIds: ["non-existent"],
        quantities: [1],
      },
      tenantId,
    });
    const response = await buildQuoteFromRequirements(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as { lineItems: unknown[] };
    expect(json.lineItems).toHaveLength(0);
  });

  it("isolates products and pricing rules to caller's tenant", async () => {
    // Tenant-b product exists but won't be visible.
    await productRepository.create("tenant-b", {
      sku: "OTHER",
      name: "Other",
      listPriceCents: 99_999,
      recurringInterval: "yearly",
      category: "x",
      active: true,
    });
    // Tenant-a real product
    const productA = await productRepository.create(tenantId, {
      sku: "MINE",
      name: "Mine",
      listPriceCents: 1_000,
      recurringInterval: "yearly",
      category: "x",
      active: true,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/build-quote-from-requirements",
      method: "POST",
      body: {
        dealId: "d-1",
        customerId: "c-1",
        ownerEmail: "rep@example.com",
        productIds: [productA.id],
        quantities: [1],
      },
      tenantId,
    });
    const response = await buildQuoteFromRequirements(request, context);
    const json = (await response.json()) as {
      quote: { subtotalCents: number };
    };
    expect(json.quote.subtotalCents).toBe(1_000);
  });
});

describe("orchestrators/explain-pricing", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
  });
  afterEach(async () => {
    await clearAll(tenantId);
  });

  it("returns a pricing breakdown for an existing quote", async () => {
    const now = new Date().toISOString();
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "draft",
      subtotalCents: 100_000,
      discountCents: 20_000,
      totalCents: 80_000,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: null,
      acceptedAt: null,
      terms: "Net 30",
      createdAt: now,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/explain-pricing",
      method: "POST",
      body: { quoteId: quote.id },
      tenantId,
    });
    const response = await explainPricing(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      quoteId: string;
      listPriceCents: number;
      quoteDiscountCents: number;
      totalCents: number;
      summary: string;
    };
    expect(json.quoteId).toBe(quote.id);
    expect(json.listPriceCents).toBe(100_000);
    expect(json.quoteDiscountCents).toBe(20_000);
    expect(json.totalCents).toBe(80_000);
    expect(json.summary).toContain("100000");
  });

  it("propagates failure for non-existent quote", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/explain-pricing",
      method: "POST",
      body: { quoteId: "missing" },
      tenantId,
    });
    await expect(explainPricing(request, context)).rejects.toThrow(
      /Internal route .* failed/,
    );
  });
});

describe("orchestrators/route-for-discount-approval", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
  });
  afterEach(async () => {
    await clearAll(tenantId);
  });

  it("requires approval when discount >= threshold", async () => {
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "draft",
      subtotalCents: 100_000,
      discountCents: 25_000,
      totalCents: 75_000,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: null,
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-for-discount-approval",
      method: "POST",
      body: { quoteId: quote.id },
      tenantId,
    });
    const response = await routeForDiscountApproval(request, context);
    const json = (await response.json()) as {
      requiresApproval: boolean;
      effectiveDiscountPercent: number;
      thresholdPercent: number;
    };
    expect(json.requiresApproval).toBe(true);
    expect(json.effectiveDiscountPercent).toBeGreaterThanOrEqual(20);
  });

  it("does not require approval below threshold", async () => {
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "draft",
      subtotalCents: 100_000,
      discountCents: 5_000,
      totalCents: 95_000,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: null,
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-for-discount-approval",
      method: "POST",
      body: { quoteId: quote.id },
      tenantId,
    });
    const response = await routeForDiscountApproval(request, context);
    const json = (await response.json()) as { requiresApproval: boolean };
    expect(json.requiresApproval).toBe(false);
  });

  it("respects custom thresholdPercent override", async () => {
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "draft",
      subtotalCents: 100_000,
      discountCents: 12_000,
      totalCents: 88_000,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: null,
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-for-discount-approval",
      method: "POST",
      body: { quoteId: quote.id, thresholdPercent: 10 },
      tenantId,
    });
    const response = await routeForDiscountApproval(request, context);
    const json = (await response.json()) as { requiresApproval: boolean };
    expect(json.requiresApproval).toBe(true);
  });
});

describe("handlers/send-quote (Resend + DocuSign fan-out)", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "quotes@example.com";
    await clearAll(tenantId);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.DOCUSIGN_BASE_URL;
    delete process.env.DOCUSIGN_ACCOUNT_ID;
    delete process.env.DOCUSIGN_ACCESS_TOKEN;
    await clearAll(tenantId);
  });

  it("sends Resend email when no DocuSign env / pdfBase64", async () => {
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "draft",
      subtotalCents: 100_000,
      discountCents: 0,
      totalCents: 100_000,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: null,
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "msg-r" }), { status: 200 }),
      );
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/quotes/${quote.id}/send`,
      method: "POST",
      body: {
        recipientEmail: "buyer@x.com",
        recipientName: "Buyer Person",
        hostedQuoteUrl: "https://portal/quote",
      },
      params: { id: quote.id },
      tenantId,
    });
    const response = await sendQuote(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      deliveryMode: string;
      resendId?: string;
      envelopeId?: string;
      status: string;
    };
    expect(json.deliveryMode).toBe("email");
    expect(json.resendId).toBe("msg-r");
    expect(json.envelopeId).toBeUndefined();
    expect(json.status).toBe("sent");
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.resend.com/emails",
    );
  });

  it("uses DocuSign envelope when pdfBase64 + DOCUSIGN_ACCESS_TOKEN", async () => {
    process.env.DOCUSIGN_BASE_URL = "https://demo.docusign.net";
    process.env.DOCUSIGN_ACCOUNT_ID = "acct-x";
    process.env.DOCUSIGN_ACCESS_TOKEN = "ds-token";
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "draft",
      subtotalCents: 100_000,
      discountCents: 0,
      totalCents: 100_000,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: null,
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          envelopeId: "env-x",
          uri: "/x",
          status: "sent",
          statusDateTime: "2026-04-01T00:00:00Z",
        }),
        { status: 201 },
      ),
    );
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/quotes/${quote.id}/send`,
      method: "POST",
      body: {
        recipientEmail: "buyer@x.com",
        recipientName: "Buyer",
        pdfBase64: "QUJD",
      },
      params: { id: quote.id },
      tenantId,
    });
    const response = await sendQuote(request, context);
    const json = (await response.json()) as {
      deliveryMode: string;
      envelopeId?: string;
    };
    expect(json.deliveryMode).toBe("esign");
    expect(json.envelopeId).toBe("env-x");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("docusign");
  });

  it("returns 400 when recipientEmail or recipientName missing", async () => {
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "draft",
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: null,
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/quotes/${quote.id}/send`,
      method: "POST",
      body: { recipientEmail: "buyer@x.com" },
      params: { id: quote.id },
      tenantId,
    });
    const response = await sendQuote(request, context);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("handlers/accept-quote (Stripe fan-out)", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    await clearAll(tenantId);
  });

  it("invoices customer via Stripe when STRIPE_SECRET_KEY set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "sent",
      subtotalCents: 100_000,
      discountCents: 0,
      totalCents: 100_000,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: new Date().toISOString(),
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    await lineItemRepository.create(tenantId, {
      quoteId: quote.id,
      productId: "p1",
      quantity: 1,
      unitPriceCents: 100_000,
      discountPercent: 0,
      totalCents: 100_000,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        const url = String(input);
        if (url.includes("/customers/search")) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        if (url.endsWith("/customers")) {
          return new Response(
            JSON.stringify({ id: "cus_1", email: "buyer@x.com", name: null }),
            { status: 200 },
          );
        }
        if (url.endsWith("/invoiceitems")) {
          return new Response(JSON.stringify({ id: "ii_1" }), { status: 200 });
        }
        if (url.endsWith("/invoices")) {
          return new Response(
            JSON.stringify({
              id: "in_1",
              status: "draft",
              hosted_invoice_url: null,
              invoice_pdf: null,
              amount_due: 100_000,
              currency: "usd",
              customer: "cus_1",
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/finalize")) {
          return new Response(
            JSON.stringify({
              id: "in_1",
              status: "open",
              hosted_invoice_url: "https://stripe.example/in_1",
              invoice_pdf: null,
              amount_due: 100_000,
              currency: "usd",
              customer: "cus_1",
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      },
    );

    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/quotes/${quote.id}/accept`,
      method: "POST",
      body: { customerEmail: "buyer@x.com" },
      params: { id: quote.id },
      tenantId,
    });
    const response = await acceptQuote(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      stripeInvoiceId?: string;
      hostedInvoiceUrl?: string;
      status: string;
    };
    expect(json.stripeInvoiceId).toBe("in_1");
    expect(json.hostedInvoiceUrl).toBe("https://stripe.example/in_1");
    expect(json.status).toBe("accepted");
    // Should have hit search, invoiceitems, invoices, finalize
    expect(fetchMock).toHaveBeenCalled();
  });

  it("does NOT call Stripe when invoiceCustomer=false (drafts-only path)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "sent",
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: null,
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/quotes/${quote.id}/accept`,
      method: "POST",
      body: { customerEmail: "buyer@x.com", invoiceCustomer: false },
      params: { id: quote.id },
      tenantId,
    });
    const response = await acceptQuote(request, context);
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const json = (await response.json()) as {
      stripeInvoiceId?: string;
      status: string;
    };
    expect(json.stripeInvoiceId).toBeUndefined();
    expect(json.status).toBe("accepted");
  });

  it("does NOT call Stripe when STRIPE_SECRET_KEY is unset", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "sent",
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: null,
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/quotes/${quote.id}/accept`,
      method: "POST",
      body: { customerEmail: "buyer@x.com" },
      params: { id: quote.id },
      tenantId,
    });
    const response = await acceptQuote(request, context);
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
