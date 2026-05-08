import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import routeRequestForApproval from "../modules/mcp-tools/route-request-for-approval.ts";
import flagMaverickSpend from "../modules/mcp-tools/flag-maverick-spend.ts";
import matchInvoiceToPo from "../modules/mcp-tools/match-invoice-to-po.ts";
import getPurchaseRequest from "../modules/handlers/get-purchase-request.ts";
import listPurchaseRequests from "../modules/handlers/list-purchase-requests.ts";
import listPurchaseOrders from "../modules/handlers/list-purchase-orders.ts";
import { purchaseRequestRepository } from "../modules/repositories/purchase-requests.ts";
import { purchaseOrderRepository } from "../modules/repositories/purchase-orders.ts";
import { approvalStepRepository } from "../modules/repositories/approval-steps.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const routes = {
  "GET /purchase-requests": listPurchaseRequests,
  "GET /purchase-requests/{id}": getPurchaseRequest,
  "GET /purchase-orders": listPurchaseOrders,
};

async function clearAll() {
  for (const t of ["tenant-a", "tenant-b"]) {
    for (const repo of [purchaseRequestRepository, purchaseOrderRepository, approvalStepRepository]) {
      const items = await repo.list(t, { limit: 200 });
      for (const i of items.items) await repo.delete(t, i.id);
    }
  }
}

describe("orchestrators/route_request_for_approval", () => {
  beforeEach(clearAll);
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_BOT_TOKEN");
    clearEnv("SLACK_PROCUREMENT_CHANNEL");
  });

  async function seedRequest(tenantId: string, totalCents = 100000, costCenter = "eng") {
    return purchaseRequestRepository.create(tenantId, {
      requesterEmail: "alice@acme.com",
      vendorId: "v1",
      totalCents,
      currency: "USD",
      costCenter,
      justification: "Need software licenses",
      status: "submitted",
      approverEmail: null,
      approvedAt: null,
      rush: false,
      createdAt: "2024-04-01T00:00:00Z",
    });
  }

  it("happy path: builds chain and pings first approver in Slack", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb");
    const tenantId = "tenant-a";
    const pr = await seedRequest(tenantId, 3000000); // > $25k
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("users.lookupByEmail")) {
        return new Response(JSON.stringify({ ok: true, user: { id: "U1" } }), { status: 200 });
      }
      if (url.includes("chat.postMessage")) {
        return new Response(
          JSON.stringify({ ok: true, ts: "1.2", channel: "U1" }),
          { status: 200 },
        );
      }
      return new Response("nope " + url, { status: 500 });
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-request-for-approval",
      method: "POST",
      body: { requestId: pr.id },
      tenantId,
    });
    const res = await routeRequestForApproval(request, context);
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      requestId: string;
      steps: { stepOrder: number; approverEmail: string }[];
      slackTs: string | null;
    };
    expect(json.steps.length).toBe(3);
    expect(json.slackTs).toBe("1.2");
    const dmCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("chat.postMessage"),
    );
    expect(dmCall).toBeTruthy();
    const stored = await approvalStepRepository.list(tenantId, { limit: 10 });
    expect(stored.items.length).toBe(3);
  });

  it("skipSlack=true: creates chain but does not post to Slack", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb");
    const tenantId = "tenant-a";
    const pr = await seedRequest(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("oops", { status: 500 }),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-request-for-approval",
      method: "POST",
      body: { requestId: pr.id, skipSlack: true },
      tenantId,
    });
    const res = await routeRequestForApproval(request, context);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { steps: unknown[]; slackTs: string | null };
    expect(json.steps.length).toBe(1);
    expect(json.slackTs).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no SLACK_BOT_TOKEN: still creates chain, no DM attempt", async () => {
    clearEnv("SLACK_BOT_TOKEN");
    const tenantId = "tenant-a";
    const pr = await seedRequest(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-request-for-approval",
      method: "POST",
      body: { requestId: pr.id },
      tenantId,
    });
    const res = await routeRequestForApproval(request, context);
    const json = (await res.json()) as { steps: unknown[]; slackTs: string | null };
    expect(json.steps.length).toBe(1);
    expect(json.slackTs).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates tenants: only tenant-a chain created", async () => {
    const aPr = await seedRequest("tenant-a");
    await seedRequest("tenant-b");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/route-request-for-approval",
      method: "POST",
      body: { requestId: aPr.id, skipSlack: true },
      tenantId: "tenant-a",
    });
    const res = await routeRequestForApproval(request, context);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { steps: { tenantId: string }[] };
    expect(json.steps.every((s) => s.tenantId === "tenant-a")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("orchestrators/flag_maverick_spend", () => {
  beforeEach(clearAll);

  it("happy path: flags rush and high-amount-thin-justification requests", async () => {
    const tenantId = "tenant-a";
    await purchaseRequestRepository.create(tenantId, {
      requesterEmail: "x@y", vendorId: "v1", totalCents: 100,
      currency: "USD", costCenter: "eng", justification: "ok",
      status: "submitted", approverEmail: null, approvedAt: null,
      rush: true, createdAt: "x",
    });
    await purchaseRequestRepository.create(tenantId, {
      requesterEmail: "x@y", vendorId: "v1", totalCents: 1000000,
      currency: "USD", costCenter: "eng", justification: "no",
      status: "submitted", approverEmail: null, approvedAt: null,
      rush: false, createdAt: "x",
    });
    await purchaseRequestRepository.create(tenantId, {
      requesterEmail: "x@y", vendorId: "v1", totalCents: 1000000,
      currency: "USD", costCenter: "eng",
      justification: "Detailed reason that is very long indeed.",
      status: "submitted", approverEmail: null, approvedAt: null,
      rush: false, createdAt: "x",
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-maverick-spend",
      method: "POST",
      body: {},
      tenantId,
    });
    const res = await flagMaverickSpend(request, context);
    const json = (await res.json()) as {
      count: number;
      flagged: { reasons: string[] }[];
    };
    expect(json.count).toBe(2);
  });

  it("no-op when there are no requests", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/flag-maverick-spend",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await flagMaverickSpend(request, context);
    const json = (await res.json()) as { count: number };
    expect(json.count).toBe(0);
  });
});

describe("orchestrators/match_invoice_to_po", () => {
  beforeEach(clearAll);

  it("happy path: returns POs from the same vendor within tolerance", async () => {
    const tenantId = "tenant-a";
    await purchaseOrderRepository.create(tenantId, {
      purchaseRequestId: "pr1", vendorId: "v1", poNumber: "PO-1",
      totalCents: 10000, currency: "USD", status: "issued",
      issuedAt: "2024-04-01T00:00:00Z",
      docusignEnvelopeId: null, docusignStatus: null,
    } as any);
    await purchaseOrderRepository.create(tenantId, {
      purchaseRequestId: "pr2", vendorId: "v2", poNumber: "PO-2",
      totalCents: 10000, currency: "USD", status: "issued",
      issuedAt: "2024-04-01T00:00:00Z",
      docusignEnvelopeId: null, docusignStatus: null,
    } as any);
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/match-invoice-to-po",
      method: "POST",
      body: { vendorId: "v1", amountCents: 10100, tolerancePercent: 5 },
      tenantId,
    });
    const res = await matchInvoiceToPo(request, context);
    const json = (await res.json()) as {
      count: number;
      matches: { po: { vendorId: string } }[];
    };
    expect(json.count).toBe(1);
    expect(json.matches[0].po.vendorId).toBe("v1");
  });

  it("no-op when nothing matches", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/match-invoice-to-po",
      method: "POST",
      body: { vendorId: "v1", amountCents: 10000 },
      tenantId: "tenant-a",
    });
    const res = await matchInvoiceToPo(request, context);
    const json = (await res.json()) as { count: number };
    expect(json.count).toBe(0);
  });
});
