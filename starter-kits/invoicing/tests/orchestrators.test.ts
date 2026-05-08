import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import chaseOverdueInvoices from "../modules/mcp-tools/chase-overdue-invoices.ts";
import listInvoices from "../modules/handlers/list-invoices.ts";
import listCustomers from "../modules/handlers/list-customers.ts";
import {
  invoiceRepository,
  customerRepository,
} from "../modules/repositories/invoices.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const routes = {
  "GET /invoices": listInvoices,
  "GET /customers": listCustomers,
};

describe("orchestrators/chase_overdue_invoices", () => {
  beforeEach(async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "billing@example.com");
    // Clean repos between tests
    for (const t of ["tenant-a", "tenant-b"]) {
      const invs = await invoiceRepository.list(t, { limit: 200 });
      for (const i of invs.items) await invoiceRepository.delete(t, i.id);
      const custs = await customerRepository.list(t, { limit: 200 });
      for (const c of custs.items) await customerRepository.delete(t, c.id);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
    clearEnv("RESEND_API_KEY");
    clearEnv("RESEND_FROM_EMAIL");
  });

  async function seedOverdue(tenantId: string, opts: { customerId?: string } = {}) {
    const customer = await customerRepository.create(tenantId, {
      name: "Acme Corp",
      email: "ap@acme.com",
      billingAddress: "123 St",
      currency: "usd",
      createdAt: new Date().toISOString(),
    });
    const inv = await invoiceRepository.create(tenantId, {
      customerId: opts.customerId ?? customer.id,
      number: "INV-1",
      status: "sent",
      subtotalCents: 9000,
      taxCents: 1000,
      totalCents: 10000,
      currency: "usd",
      dueDate: "2024-01-01",
      sentAt: "2024-01-01T00:00:00.000Z",
      paidAt: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    return { customer, invoice: inv };
  }

  it("happy path: dispatches Stripe + Resend per overdue invoice", async () => {
    const tenantId = "tenant-a";
    const { invoice, customer } = await seedOverdue(tenantId);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: string | URL | Request) => {
        const u = String(input);
        if (u.includes("/customers/search")) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        if (u.includes("api.stripe.com/v1/customers") && !u.includes("search")) {
          return new Response(
            JSON.stringify({ id: "cus_123", email: customer.email, name: customer.name, metadata: {} }),
            { status: 200 },
          );
        }
        if (u.includes("/invoiceitems")) {
          return new Response(JSON.stringify({ id: "ii_1" }), { status: 200 });
        }
        if (u.includes("/finalize")) {
          return new Response(JSON.stringify({ id: "in_1" }), { status: 200 });
        }
        if (u.includes("/send")) {
          return new Response(
            JSON.stringify({
              id: "in_1",
              customer: "cus_123",
              status: "open",
              amount_due: invoice.totalCents,
              amount_paid: 0,
              currency: "usd",
              hosted_invoice_url: "https://stripe.test/i/in_1",
              invoice_pdf: null,
              metadata: {},
            }),
            { status: 200 },
          );
        }
        if (u.includes("api.stripe.com/v1/invoices")) {
          return new Response(
            JSON.stringify({
              id: "in_1",
              customer: "cus_123",
              status: "draft",
              amount_due: invoice.totalCents,
              amount_paid: 0,
              currency: "usd",
              hosted_invoice_url: "https://stripe.test/i/in_1",
              invoice_pdf: null,
              metadata: {},
            }),
            { status: 200 },
          );
        }
        if (u.includes("api.resend.com/emails")) {
          return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
        }
        return new Response("unmocked: " + u, { status: 500 });
      });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/mcp/chase_overdue_invoices",
      method: "POST",
      body: { dryRun: false },
      tenantId,
    });

    const res = await chaseOverdueInvoices(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      dryRun: boolean;
      count: number;
      invoices: { emailId: string | null; stripeHostedInvoiceUrl: string | null; errors?: string[] }[];
    };
    expect(json.dryRun).toBe(false);
    expect(json.count).toBe(1);
    expect(json.invoices[0].emailId).toBe("email_1");
    expect(json.invoices[0].stripeHostedInvoiceUrl).toBe("https://stripe.test/i/in_1");
    expect(json.invoices[0].errors).toBeUndefined();

    const resendCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith("https://api.resend.com"),
    );
    expect(resendCalls.length).toBe(1);
  });

  it("no-op when there are no overdue invoices", async () => {
    const tenantId = "tenant-a";
    // Seed a non-overdue invoice (paid)
    const customer = await customerRepository.create(tenantId, {
      name: "n",
      email: "n@x.com",
      billingAddress: "a",
      currency: "usd",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    await invoiceRepository.create(tenantId, {
      customerId: customer.id,
      number: "INV-paid",
      status: "paid",
      subtotalCents: 100,
      taxCents: 0,
      totalCents: 100,
      currency: "usd",
      dueDate: "2024-01-01",
      sentAt: "2024-01-01T00:00:00.000Z",
      paidAt: "2024-01-02T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unexpected", { status: 500 }),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/mcp/chase_overdue_invoices",
      method: "POST",
      body: { dryRun: false },
      tenantId,
    });
    const res = await chaseOverdueInvoices(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { count: number };
    expect(json.count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dryRun=true does not call Stripe or Resend (drafts only)", async () => {
    const tenantId = "tenant-a";
    await seedOverdue(tenantId);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 500 }));

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/mcp/chase_overdue_invoices",
      method: "POST",
      body: { dryRun: true },
      tenantId,
    });
    const res = await chaseOverdueInvoices(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      dryRun: boolean;
      count: number;
      invoices: { draftEmail: string; emailId: string | null; stripeHostedInvoiceUrl: string | null }[];
    };
    expect(json.dryRun).toBe(true);
    expect(json.count).toBe(1);
    expect(json.invoices[0].draftEmail).toContain("INV-1");
    expect(json.invoices[0].emailId).toBeNull();
    expect(json.invoices[0].stripeHostedInvoiceUrl).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates tenants: only tenant-a invoices appear when invoked as tenant-a", async () => {
    await seedOverdue("tenant-a");
    await seedOverdue("tenant-b");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/chase_overdue_invoices",
      method: "POST",
      body: { dryRun: true },
      tenantId: "tenant-a",
    });
    const res = await chaseOverdueInvoices(request, context);
    const json = (await res.json()) as {
      count: number;
      invoices: { invoice: { tenantId: string } }[];
    };
    expect(json.count).toBe(1);
    expect(json.invoices[0].invoice.tenantId).toBe("tenant-a");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
