import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import parseBill from "../modules/mcp-tools/parse-bill.ts";
import reconcileWithBank from "../modules/mcp-tools/reconcile-with-bank.ts";
import detectDuplicateBills from "../modules/mcp-tools/detect-duplicate-bills.ts";
import matchBillToPo from "../modules/mcp-tools/match-bill-to-po.ts";
import listBills from "../modules/handlers/list-bills.ts";
import listBillPayments from "../modules/handlers/list-bill-payments.ts";
import {
  billRepository,
  billPaymentRepository,
} from "../modules/repositories/bills.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const routes = {
  "GET /bills": listBills,
  "GET /bill-payments": listBillPayments,
};

async function clearAll() {
  for (const t of ["tenant-a", "tenant-b"]) {
    for (const repo of [billRepository, billPaymentRepository]) {
      const items = await repo.list(t, { limit: 200 });
      for (const i of items.items) await repo.delete(t, i.id);
    }
  }
}

describe("orchestrators/parse_bill", () => {
  beforeEach(clearAll);
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("MINDEE_API_KEY");
  });

  it("happy path: returns ready=true when fields are confident", async () => {
    setEnv("MINDEE_API_KEY", "mindee_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          document: {
            inference: {
              prediction: {
                total_amount: { value: 100, confidence: 0.95 },
                currency: { value: "USD", confidence: 0.9 },
                date: { value: "2024-05-01", confidence: 0.9 },
                supplier_name: { value: "Vendor", confidence: 0.85 },
              },
            },
          },
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/parse-bill",
      method: "POST",
      body: { attachmentUrl: "https://x.test/bill.pdf" },
    });
    const res = await parseBill(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { vendor: string; ready: boolean; amountCents: number };
    expect(json.vendor).toBe("Vendor");
    expect(json.amountCents).toBe(10000);
    expect(json.ready).toBe(true);
  });

  it("returns 400 when attachmentUrl is missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/parse-bill",
      method: "POST",
      body: {},
    });
    const res = await parseBill(request, context);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ready=false when confidence is low", async () => {
    setEnv("MINDEE_API_KEY", "mindee_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          document: {
            inference: {
              prediction: {
                total_amount: { value: 1, confidence: 0.1 },
                currency: { value: "USD", confidence: 0 },
                date: { value: null, confidence: 0 },
                supplier_name: { value: null, confidence: 0 },
              },
            },
          },
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/parse-bill",
      method: "POST",
      body: { attachmentUrl: "https://x.test/bill.pdf" },
    });
    const res = await parseBill(request, context);
    const json = (await res.json()) as { ready: boolean };
    expect(json.ready).toBe(false);
  });
});

describe("orchestrators/reconcile_with_bank", () => {
  beforeEach(clearAll);
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("PLAID_CLIENT_ID");
    clearEnv("PLAID_SECRET");
    clearEnv("PLAID_ACCESS_TOKEN");
  });

  async function seed(tenantId: string) {
    const bill = await billRepository.create(tenantId, {
      vendorId: "v1",
      billNumber: "B-1",
      amountCents: 10000,
      currency: "usd",
      dueDate: "2024-04-15",
      status: "approved",
      glCode: "5000",
      poNumber: null,
      attachmentUrl: null,
      approverEmail: null,
      approvedAt: "2024-04-10T00:00:00Z",
      paidAt: null,
      createdAt: "2024-04-01T00:00:00Z",
    } as any);
    const payment = await billPaymentRepository.create(tenantId, {
      billId: bill.id,
      amountCents: 10000,
      method: "ach",
      scheduledFor: "2024-04-15",
      paidAt: null,
      reference: "REF-1",
      createdAt: "2024-04-10T00:00:00Z",
    });
    return { bill, payment };
  }

  it("happy path: pulls Plaid txns and proposes a match", async () => {
    setEnv("PLAID_CLIENT_ID", "cid");
    setEnv("PLAID_SECRET", "sec");
    setEnv("PLAID_ACCESS_TOKEN", "access-1");
    const tenantId = "tenant-a";
    await seed(tenantId);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          transactions: [
            {
              transaction_id: "txn_1",
              account_id: "a1",
              amount: 100.0,
              iso_currency_code: "USD",
              date: "2024-04-15",
              authorized_date: null,
              name: "Vendor X",
              merchant_name: "Vendor X",
              pending: false,
              category: ["service"],
            },
          ],
          total_transactions: 1,
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/reconcile-with-bank",
      method: "POST",
      body: { startDate: "2024-04-01", endDate: "2024-04-30" },
      tenantId,
    });
    const res = await reconcileWithBank(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      matchCount: number;
      matches: { payment: { billId: string } }[];
    };
    expect(json.matchCount).toBe(1);
    expect(json.matches[0].payment.billId).toBeTruthy();
  });

  it("returns 400 when PLAID_ACCESS_TOKEN is missing (plaid_not_configured)", async () => {
    clearEnv("PLAID_ACCESS_TOKEN");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/reconcile-with-bank",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await reconcileWithBank(request, context);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { type: string } };
    expect(json.error.type).toBe("plaid_not_configured");
  });

  it("isolates tenants: only tenant-a payments considered", async () => {
    setEnv("PLAID_CLIENT_ID", "cid");
    setEnv("PLAID_SECRET", "sec");
    setEnv("PLAID_ACCESS_TOKEN", "access-1");
    await seed("tenant-a");
    await seed("tenant-b");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          transactions: [
            {
              transaction_id: "txn_1",
              account_id: "a1",
              amount: 100,
              iso_currency_code: "USD",
              date: "2024-04-15",
              authorized_date: null,
              name: "v",
              merchant_name: "v",
              pending: false,
              category: null,
            },
          ],
          total_transactions: 1,
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/reconcile-with-bank",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await reconcileWithBank(request, context);
    const json = (await res.json()) as { matches: { payment: { tenantId: string } }[] };
    // Each tenant has 1 matching payment in this seed; match should be tenant-a's.
    expect(json.matches.every((m) => m.payment.tenantId === "tenant-a")).toBe(true);
  });
});

describe("orchestrators/detect_duplicate_bills", () => {
  beforeEach(clearAll);

  it("happy path: groups bills with same vendor+amount within 7 days", async () => {
    const tenantId = "tenant-a";
    await billRepository.create(tenantId, {
      vendorId: "v1", billNumber: "B-1", amountCents: 10000, currency: "usd",
      dueDate: "2024-04-15", status: "pending_approval", glCode: "5000",
      poNumber: null, attachmentUrl: null, approverEmail: null,
      approvedAt: null, paidAt: null, createdAt: "2024-04-01T00:00:00Z",
    } as any);
    await billRepository.create(tenantId, {
      vendorId: "v1", billNumber: "B-1-DUP", amountCents: 10000, currency: "usd",
      dueDate: "2024-04-17", status: "pending_approval", glCode: "5000",
      poNumber: null, attachmentUrl: null, approverEmail: null,
      approvedAt: null, paidAt: null, createdAt: "2024-04-01T00:00:00Z",
    } as any);
    await billRepository.create(tenantId, {
      vendorId: "v2", billNumber: "B-OTHER", amountCents: 10000, currency: "usd",
      dueDate: "2024-04-15", status: "pending_approval", glCode: "5000",
      poNumber: null, attachmentUrl: null, approverEmail: null,
      approvedAt: null, paidAt: null, createdAt: "2024-04-01T00:00:00Z",
    } as any);
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/detect-duplicate-bills",
      method: "POST",
      body: {},
      tenantId,
    });
    const res = await detectDuplicateBills(request, context);
    const json = (await res.json()) as {
      duplicateGroupCount: number;
      duplicateBillCount: number;
    };
    expect(json.duplicateGroupCount).toBe(1);
    expect(json.duplicateBillCount).toBe(2);
  });

  it("no-op when there are no bills", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/detect-duplicate-bills",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await detectDuplicateBills(request, context);
    const json = (await res.json()) as { duplicateGroupCount: number };
    expect(json.duplicateGroupCount).toBe(0);
  });
});

describe("orchestrators/match_bill_to_po", () => {
  beforeEach(clearAll);

  it("happy path: returns candidate POs within 5% of bill amount", async () => {
    const tenantId = "tenant-a";
    const target = await billRepository.create(tenantId, {
      vendorId: "v1", billNumber: "B-1", amountCents: 10000, currency: "usd",
      dueDate: "2024-05-01", status: "pending_approval", glCode: "5000",
      poNumber: null, attachmentUrl: null, approverEmail: null,
      approvedAt: null, paidAt: null, createdAt: "2024-04-01T00:00:00Z",
    } as any);
    await billRepository.create(tenantId, {
      vendorId: "v1", billNumber: "PO-1", amountCents: 10100, currency: "usd",
      dueDate: "2024-05-01", status: "draft", glCode: "5000",
      poNumber: "PO-1", attachmentUrl: null, approverEmail: null,
      approvedAt: null, paidAt: null, createdAt: "2024-04-01T00:00:00Z",
    } as any);
    await billRepository.create(tenantId, {
      vendorId: "v1", billNumber: "PO-OFF", amountCents: 50000, currency: "usd",
      dueDate: "2024-05-01", status: "draft", glCode: "5000",
      poNumber: "PO-OFF", attachmentUrl: null, approverEmail: null,
      approvedAt: null, paidAt: null, createdAt: "2024-04-01T00:00:00Z",
    } as any);
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/match-bill-to-po",
      method: "POST",
      body: { billId: target.id },
      tenantId,
    });
    const res = await matchBillToPo(request, context);
    const json = (await res.json()) as { candidateCount: number };
    expect(json.candidateCount).toBe(1);
  });

  it("returns 400 when billId is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/match-bill-to-po",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await matchBillToPo(request, context);
    expect(res.status).toBe(400);
  });

  it("returns 404 when bill not found", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/match-bill-to-po",
      method: "POST",
      body: { billId: "missing" },
      tenantId: "tenant-a",
    });
    const res = await matchBillToPo(request, context);
    expect(res.status).toBe(404);
  });
});
