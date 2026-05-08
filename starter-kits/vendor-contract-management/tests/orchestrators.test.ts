import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import {
  contractRepository,
  vendorRepository,
  spendRecordRepository,
} from "../modules/repositories/contracts.ts";
import sendContractForSignatureHandler from "../modules/mcp-tools/send-contract-for-signature.ts";
import calcTotalSpendHandler from "../modules/mcp-tools/calc-total-spend.ts";
import compareVendorPricingHandler from "../modules/mcp-tools/compare-vendor-pricing.ts";
import flagUpcomingRenewalsHandler from "../modules/mcp-tools/flag-upcoming-renewals.ts";
import listContractsHandler from "../modules/handlers/list-contracts.ts";
import listVendorsHandler from "../modules/handlers/list-vendors.ts";
import listSpendHandler from "../modules/handlers/list-spend.ts";

const ENV_KEYS = [
  "SLACK_BOT_TOKEN",
  "SLACK_WEBHOOK_URL",
  "SLACK_DEFAULT_CHANNEL",
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_USER_ID",
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_PRIVATE_KEY",
  "DOCUSIGN_OAUTH_HOST",
  "DOCUSIGN_API_BASE_URI",
];
function clearEnv() {
  for (const key of ENV_KEYS) {
    delete (environment as Record<string, string | undefined>)[key];
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  clearEnv();
  for (const tenant of ["tenant-a", "tenant-b"]) {
    for (const repo of [
      contractRepository,
      vendorRepository,
      spendRecordRepository,
    ]) {
      const page = await repo.list(tenant, { limit: 1000 });
      for (const item of page.items) {
        await repo.delete(tenant, item.id).catch(() => {});
      }
    }
  }
});

async function generateRsaPemForTest(): Promise<string> {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const bytes = new Uint8Array(pkcs8);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  const b64 = btoa(s);
  const wrapped = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

describe("orchestrator send_contract_for_signature", () => {
  it("creates a DocuSign envelope and posts to Slack", async () => {
    environment.DOCUSIGN_INTEGRATION_KEY = "iek";
    environment.DOCUSIGN_USER_ID = "uid";
    environment.DOCUSIGN_ACCOUNT_ID = "aid";
    environment.DOCUSIGN_PRIVATE_KEY = await generateRsaPemForTest();
    environment.SLACK_WEBHOOK_URL = "https://hooks.slack.com/x";

    const tenant = "tenant-a";
    const vendor = await vendorRepository.create(tenant, {
      name: "ACME Corp",
      contactEmail: "vendor@acme.com",
      website: null,
      category: "saas",
      totalSpendCents: 0,
      status: "active",
    });
    const contract = await contractRepository.create(tenant, {
      vendorId: vendor.id,
      title: "MSA",
      kind: "msa",
      startDate: "2026-01-01",
      endDate: "2027-01-01",
      autoRenews: false,
      noticePeriodDays: 30,
      annualValueCents: 100_000,
      currency: "USD",
      status: "draft",
      documentUrl: null,
      owner: "owner@example.com",
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // Token exchange
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "at", expires_in: 3600 }),
          { status: 200 },
        ),
      )
      // Envelope create
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            envelopeId: "env-1",
            status: "sent",
            uri: "/envelopes/env-1",
            statusDateTime: "2026-05-01T00:00:00Z",
          }),
          { status: 201 },
        ),
      )
      // Slack webhook
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const { context } = makeContext({ routes: {}, tenantId: tenant });
    const request = makeRequest({
      url: "https://kit.test/send-contract-for-signature",
      method: "POST",
      body: {
        contractId: contract.id,
        internalSigners: [{ email: "legal@example.com", name: "Legal" }],
        documentBase64: btoa("hello"),
      },
      tenantId: tenant,
    });
    const response = await sendContractForSignatureHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      envelopeId: string;
      signers: Array<{ email: string }>;
    };
    expect(data.envelopeId).toBe("env-1");
    expect(data.signers.map((s) => s.email)).toContain("vendor@acme.com");
    expect(data.signers.map((s) => s.email)).toContain("legal@example.com");

    // Slack got pinged
    const slackCall = fetchMock.mock.calls[2]!;
    expect(String(slackCall[0])).toBe("https://hooks.slack.com/x");

    // Contract documentUrl was stamped with envelope id
    const updated = await contractRepository.get(tenant, contract.id);
    expect(updated?.documentUrl).toContain("env-1");
  });

  it("returns 400 when contractId or internalSigners missing", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/send-contract-for-signature",
      method: "POST",
      body: { contractId: "x", internalSigners: [] },
      tenantId: "tenant-a",
    });
    const response = await sendContractForSignatureHandler(request, context);
    expect(response.status).toBe(400);
  });

  it("returns 404 when contract not found", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/send-contract-for-signature",
      method: "POST",
      body: {
        contractId: "missing",
        internalSigners: [{ email: "x@y.com", name: "X" }],
      },
      tenantId: "tenant-a",
    });
    const response = await sendContractForSignatureHandler(request, context);
    expect(response.status).toBe(404);
  });

  it("returns 400 when neither documentBase64 nor contract.documentUrl is set", async () => {
    const tenant = "tenant-a";
    const vendor = await vendorRepository.create(tenant, {
      name: "ACME Corp",
      contactEmail: "vendor@acme.com",
      website: null,
      category: "saas",
      totalSpendCents: 0,
      status: "active",
    });
    const contract = await contractRepository.create(tenant, {
      vendorId: vendor.id,
      title: "MSA",
      kind: "msa",
      startDate: "2026-01-01",
      endDate: "2027-01-01",
      autoRenews: false,
      noticePeriodDays: 30,
      annualValueCents: 100_000,
      currency: "USD",
      status: "draft",
      documentUrl: null,
      owner: "owner@example.com",
    });
    const { context } = makeContext({ routes: {}, tenantId: tenant });
    const request = makeRequest({
      url: "https://kit.test/send-contract-for-signature",
      method: "POST",
      body: {
        contractId: contract.id,
        internalSigners: [{ email: "x@y.com", name: "X" }],
      },
      tenantId: tenant,
    });
    const response = await sendContractForSignatureHandler(request, context);
    expect(response.status).toBe(400);
  });
});

describe("orchestrator calc_total_spend", () => {
  it("sums spend records and breaks down by vendor", async () => {
    const tenant = "tenant-a";
    await spendRecordRepository.create(tenant, {
      vendorId: "v1",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      amountCents: 10_000,
      source: "invoice",
    });
    await spendRecordRepository.create(tenant, {
      vendorId: "v2",
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      amountCents: 5_000,
      source: "invoice",
    });

    const { context } = makeContext({
      routes: { "GET /spend": listSpendHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/calc-total-spend",
      method: "POST",
      body: {},
      tenantId: tenant,
    });
    const response = await calcTotalSpendHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      totalCents: number;
      recordCount: number;
      byVendor: Array<{ vendorId: string; amountCents: number }>;
    };
    expect(data.totalCents).toBe(15_000);
    expect(data.recordCount).toBe(2);
    expect(data.byVendor.length).toBe(2);
  });

  it("filters by year range", async () => {
    const tenant = "tenant-a";
    await spendRecordRepository.create(tenant, {
      vendorId: "v1",
      periodStart: "2025-01-01",
      periodEnd: "2025-01-31",
      amountCents: 100,
      source: "invoice",
    });
    await spendRecordRepository.create(tenant, {
      vendorId: "v1",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      amountCents: 200,
      source: "invoice",
    });
    const { context } = makeContext({
      routes: { "GET /spend": listSpendHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/calc-total-spend",
      method: "POST",
      body: { year: 2026 },
      tenantId: tenant,
    });
    const response = await calcTotalSpendHandler(request, context);
    const data = (await response.json()) as { totalCents: number };
    expect(data.totalCents).toBe(200);
  });
});

describe("orchestrator compare_vendor_pricing", () => {
  it("returns vendors in a category with their active contract totals", async () => {
    const tenant = "tenant-a";
    const v1 = await vendorRepository.create(tenant, {
      name: "Vendor 1",
      contactEmail: "v1@example.com",
      website: null,
      category: "saas",
      totalSpendCents: 0,
      status: "active",
    });
    const v2 = await vendorRepository.create(tenant, {
      name: "Vendor 2",
      contactEmail: "v2@example.com",
      website: null,
      category: "saas",
      totalSpendCents: 0,
      status: "active",
    });
    await vendorRepository.create(tenant, {
      name: "Other",
      contactEmail: "o@example.com",
      website: null,
      category: "consulting",
      totalSpendCents: 0,
      status: "active",
    });
    await contractRepository.create(tenant, {
      vendorId: v1.id,
      title: "MSA",
      kind: "msa",
      startDate: "2026-01-01",
      endDate: "2027-01-01",
      autoRenews: false,
      noticePeriodDays: 30,
      annualValueCents: 100_000,
      currency: "USD",
      status: "active",
      documentUrl: null,
      owner: "x",
    });
    await contractRepository.create(tenant, {
      vendorId: v2.id,
      title: "MSA",
      kind: "msa",
      startDate: "2026-01-01",
      endDate: "2027-01-01",
      autoRenews: false,
      noticePeriodDays: 30,
      annualValueCents: 50_000,
      currency: "USD",
      status: "active",
      documentUrl: null,
      owner: "x",
    });

    const { context } = makeContext({
      routes: {
        "GET /vendors": listVendorsHandler,
        "GET /contracts": listContractsHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/compare-vendor-pricing",
      method: "POST",
      body: { category: "saas" },
      tenantId: tenant,
    });
    const response = await compareVendorPricingHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      vendorCount: number;
      comparison: Array<{ vendorName: string; totalAnnualCents: number }>;
    };
    expect(data.vendorCount).toBe(2);
    // Sorted ascending — cheapest first
    expect(data.comparison[0].vendorName).toBe("Vendor 2");
    expect(data.comparison[0].totalAnnualCents).toBe(50_000);
  });

  it("returns 400 without category", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/compare-vendor-pricing",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await compareVendorPricingHandler(request, context);
    expect(response.status).toBe(400);
  });
});

describe("orchestrator flag_upcoming_renewals", () => {
  it("returns active contracts with notice window flags", async () => {
    const tenant = "tenant-a";
    const now = Date.now();
    const inSixtyDays = new Date(now + 60 * 86400000)
      .toISOString()
      .slice(0, 10);
    const inOneYear = new Date(now + 365 * 86400000)
      .toISOString()
      .slice(0, 10);

    // Notice period 30d, so notice window for the 60-day contract is open in (60-30)=30 days
    // i.e. notice window is NOT yet open (30 days in future).
    await contractRepository.create(tenant, {
      vendorId: "v1",
      title: "Soon",
      kind: "msa",
      startDate: "2025-01-01",
      endDate: inSixtyDays,
      autoRenews: false,
      noticePeriodDays: 30,
      annualValueCents: 1000,
      currency: "USD",
      status: "active",
      documentUrl: null,
      owner: "x",
    });
    // 90 day notice on 60-day contract: notice window opened 30 days ago.
    await contractRepository.create(tenant, {
      vendorId: "v2",
      title: "Inside notice window",
      kind: "msa",
      startDate: "2025-01-01",
      endDate: inSixtyDays,
      autoRenews: false,
      noticePeriodDays: 90,
      annualValueCents: 1000,
      currency: "USD",
      status: "active",
      documentUrl: null,
      owner: "x",
    });
    // Out of horizon: 1 year out, default daysAhead=90, so excluded.
    await contractRepository.create(tenant, {
      vendorId: "v3",
      title: "Far future",
      kind: "msa",
      startDate: "2025-01-01",
      endDate: inOneYear,
      autoRenews: false,
      noticePeriodDays: 30,
      annualValueCents: 1000,
      currency: "USD",
      status: "active",
      documentUrl: null,
      owner: "x",
    });

    const { context } = makeContext({
      routes: { "GET /contracts": listContractsHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/flag-upcoming-renewals",
      method: "POST",
      body: {},
      tenantId: tenant,
    });
    const response = await flagUpcomingRenewalsHandler(request, context);
    const data = (await response.json()) as {
      count: number;
      contracts: Array<{ title: string; noticeWindowOpen: boolean }>;
    };
    expect(data.count).toBe(2);
    const insideNotice = data.contracts.find(
      (c) => c.title === "Inside notice window",
    );
    expect(insideNotice?.noticeWindowOpen).toBe(true);
  });

  it("returns 0 when no contracts in horizon", async () => {
    const { context } = makeContext({
      routes: { "GET /contracts": listContractsHandler },
      tenantId: "tenant-a",
    });
    const request = makeRequest({
      url: "https://kit.test/flag-upcoming-renewals",
      method: "POST",
      body: { daysAhead: 7 },
      tenantId: "tenant-a",
    });
    const response = await flagUpcomingRenewalsHandler(request, context);
    const data = (await response.json()) as { count: number };
    expect(data.count).toBe(0);
  });
});
