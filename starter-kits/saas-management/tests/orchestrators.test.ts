import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import {
  saasAppRepository,
  licenseRepository,
} from "../modules/repositories/apps.ts";
import discoverAppsHandler from "../modules/mcp-tools/discover-apps.ts";
import findUnusedLicensesHandler from "../modules/mcp-tools/find-unused-licenses.ts";
import forecastRenewalCostHandler from "../modules/mcp-tools/forecast-renewal-cost.ts";
import recommendSeatReductionHandler from "../modules/mcp-tools/recommend-seat-reduction.ts";
import googleOAuthCallbackHandler from "../modules/handlers/google-oauth-callback.ts";
import microsoftOAuthCallbackHandler from "../modules/handlers/microsoft-oauth-callback.ts";
import listAppsHandler from "../modules/handlers/list-apps.ts";
import listLicensesHandler from "../modules/handlers/list-licenses.ts";

const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_REDIRECT_URI",
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_REDIRECT_URI",
  "OKTA_ORG_URL",
  "OKTA_API_TOKEN",
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
    for (const repo of [saasAppRepository, licenseRepository]) {
      const page = await repo.list(tenant, { limit: 1000 });
      for (const item of page.items) {
        await repo.delete(tenant, item.id).catch(() => {});
      }
    }
  }
});

const tokenResponse = (token = "at") =>
  new Response(
    JSON.stringify({
      access_token: token,
      expires_in: 3600,
      token_type: "Bearer",
    }),
    { status: 200 },
  );

describe("orchestrator discover_apps", () => {
  it("fans out to all three IdPs and merges results", async () => {
    environment.GOOGLE_CLIENT_ID = "g";
    environment.GOOGLE_CLIENT_SECRET = "g";
    environment.GOOGLE_REFRESH_TOKEN = "g";
    environment.MICROSOFT_TENANT_ID = "m";
    environment.MICROSOFT_CLIENT_ID = "m";
    environment.MICROSOFT_CLIENT_SECRET = "m";
    environment.OKTA_ORG_URL = "https://example.okta.com";
    environment.OKTA_API_TOKEN = "okta-test";

    // The orchestrator runs all three IdPs in parallel using Promise.all.
    // We mock fetch with a URL-router so order doesn't matter.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      (input: Request | URL | string) => {
        const url = String(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
        // Google OAuth token + Microsoft Graph token both return generic token response
        if (url.startsWith("https://oauth2.googleapis.com/token") || url.startsWith("https://login.microsoftonline.com/")) {
          return Promise.resolve(tokenResponse("at"));
        }
        // Google directory users
        if (url.includes("/admin/directory/v1/users")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                users: [
                  {
                    id: "u1",
                    primaryEmail: "alice@example.com",
                    name: { fullName: "Alice" },
                    suspended: false,
                    isAdmin: false,
                    lastLoginTime: "2026-04-01T00:00:00Z",
                  },
                  {
                    id: "u2",
                    primaryEmail: "bob@example.com",
                    name: { fullName: "Bob" },
                    suspended: true,
                    isAdmin: false,
                    lastLoginTime: "2026-04-01T00:00:00Z",
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        // Google reports/token
        if (url.includes("/admin/reports/v1/activity")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                items: [
                  {
                    id: { time: "2026-04-15T00:00:00Z" },
                    actor: { email: "alice@example.com" },
                    events: [
                      {
                        name: "authorize",
                        parameters: [
                          { name: "client_id", value: "abc" },
                          { name: "app_name", value: "Slack" },
                        ],
                      },
                    ],
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        // Microsoft subscribedSkus
        if (url.includes("/v1.0/subscribedSkus")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                value: [
                  {
                    skuPartNumber: "ENTERPRISEPACK",
                    skuId: "sku-1",
                    prepaidUnits: { enabled: 50 },
                    consumedUnits: 40,
                    capabilityStatus: "Enabled",
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        // Microsoft servicePrincipals
        if (url.includes("/servicePrincipals")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                value: [
                  {
                    appId: "ext-app-1",
                    displayName: "ExternalApp",
                    publisherName: "ExtCo",
                    signInAudience: "AzureADMyOrg",
                    appOwnerOrganizationId: "ext-org",
                    servicePrincipalType: "Application",
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        // Okta users
        if (url.includes("/api/v1/users")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: "ou1",
                  status: "ACTIVE",
                  profile: { email: "alice@example.com" },
                  lastLogin: null,
                  created: "2026-04-01T00:00:00Z",
                },
              ]),
              { status: 200 },
            ),
          );
        }
        // Okta apps list
        if (url.includes("/api/v1/apps") && !url.includes("/users")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: "okta-app-1",
                  name: "github_com",
                  label: "GitHub",
                  status: "ACTIVE",
                  signOnMode: "OPENID_CONNECT",
                },
              ]),
              { status: 200 },
            ),
          );
        }
        // Okta app users
        if (url.includes("/api/v1/apps/") && url.includes("/users")) {
          return Promise.resolve(
            new Response(JSON.stringify([{}, {}, {}]), { status: 200 }),
          );
        }
        return Promise.resolve(new Response("Unknown URL: " + url, { status: 404 }));
      },
    );

    const tenant = "tenant-a";
    const { context } = makeContext({ routes: {}, tenantId: tenant });
    const request = makeRequest({
      url: "https://kit.test/discover-apps",
      method: "POST",
      body: { upsert: true },
      tenantId: tenant,
    });

    const response = await discoverAppsHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      providers: string[];
      discovered: number;
      apps: Array<{ app: { source: string; slug: string }; persisted: unknown }>;
      errors: unknown[];
    };
    expect(data.providers).toEqual(["google-workspace", "microsoft-365", "okta"]);
    expect(data.errors).toEqual([]);
    // We expect Google Workspace itself + Slack from Google + ENTERPRISEPACK from MS
    // + ExternalApp from MS + Okta itself + GitHub from Okta = 6 unique slugs
    expect(data.discovered).toBeGreaterThanOrEqual(5);
    const sources = data.apps.map((a) => a.app.source);
    expect(sources).toContain("google-workspace");
    expect(sources).toContain("microsoft-365");
    expect(sources).toContain("okta");

    // After upsert, the saas app repository should contain rows.
    const saved = await saasAppRepository.list(tenant, { limit: 100 });
    expect(saved.items.length).toBeGreaterThan(0);

    expect(fetchMock).toHaveBeenCalled();
  });

  it("subset of providers limits which IdPs are queried", async () => {
    environment.OKTA_ORG_URL = "https://example.okta.com";
    environment.OKTA_API_TOKEN = "okta-test";

    let oktaCalls = 0;
    let googleCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      if (url.startsWith("https://admin.googleapis.com") || url.startsWith("https://oauth2.googleapis.com")) googleCalls += 1;
      if (url.startsWith("https://example.okta.com")) oktaCalls += 1;
      if (url.includes("/api/v1/users")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/api/v1/apps")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(new Response("not used", { status: 404 }));
    });

    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/discover-apps",
      method: "POST",
      body: { providers: ["okta"], upsert: false },
      tenantId: "tenant-a",
    });
    const response = await discoverAppsHandler(request, context);
    expect(response.status).toBe(200);
    expect(googleCalls).toBe(0);
    expect(oktaCalls).toBeGreaterThan(0);
  });

  it("captures provider errors when credentials missing", async () => {
    // Only Okta is configured — Google & Microsoft will fail and be captured in errors.
    environment.OKTA_ORG_URL = "https://example.okta.com";
    environment.OKTA_API_TOKEN = "okta-test";

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      if (url.includes("/api/v1/users")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/api/v1/apps")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(new Response("oops", { status: 500 }));
    });

    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/discover-apps",
      method: "POST",
      body: { upsert: false },
      tenantId: "tenant-a",
    });
    const response = await discoverAppsHandler(request, context);
    const data = (await response.json()) as {
      errors: Array<{ provider: string }>;
    };
    const errProviders = data.errors.map((e) => e.provider);
    expect(errProviders).toContain("google-workspace");
    expect(errProviders).toContain("microsoft-365");
  });
});

describe("orchestrator find_unused_licenses", () => {
  it("returns active licenses past the activity window", async () => {
    const tenant = "tenant-a";
    const old = new Date(Date.now() - 60 * 86400000).toISOString();
    const recent = new Date(Date.now() - 1 * 86400000).toISOString();

    await licenseRepository.create(tenant, {
      saasAppSlug: "slack",
      employeeEmail: "alice@example.com",
      role: "user",
      assignedAt: "2026-01-01T00:00:00.000Z",
      removedAt: null,
      lastActiveAt: old,
    });
    await licenseRepository.create(tenant, {
      saasAppSlug: "slack",
      employeeEmail: "bob@example.com",
      role: "user",
      assignedAt: "2026-01-01T00:00:00.000Z",
      removedAt: null,
      lastActiveAt: recent,
    });
    await licenseRepository.create(tenant, {
      saasAppSlug: "slack",
      employeeEmail: "charlie@example.com",
      role: "user",
      assignedAt: "2026-01-01T00:00:00.000Z",
      removedAt: "2026-02-01T00:00:00.000Z",
      lastActiveAt: old,
    });

    const { context } = makeContext({
      routes: { "GET /licenses": listLicensesHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/find-unused-licenses",
      method: "POST",
      body: { daysWithoutActivity: 30 },
      tenantId: tenant,
    });
    const response = await findUnusedLicensesHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      count: number;
      licenses: Array<{ employeeEmail: string }>;
    };
    expect(data.count).toBe(1);
    expect(data.licenses[0].employeeEmail).toBe("alice@example.com");
  });

  it("returns empty when no licenses are stale", async () => {
    const tenant = "tenant-a";
    const recent = new Date(Date.now() - 1 * 86400000).toISOString();
    await licenseRepository.create(tenant, {
      saasAppSlug: "slack",
      employeeEmail: "x@example.com",
      role: "user",
      assignedAt: "2026-04-01T00:00:00.000Z",
      removedAt: null,
      lastActiveAt: recent,
    });
    const { context } = makeContext({
      routes: { "GET /licenses": listLicensesHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/find-unused-licenses",
      method: "POST",
      body: {},
      tenantId: tenant,
    });
    const response = await findUnusedLicensesHandler(request, context);
    const data = (await response.json()) as { count: number };
    expect(data.count).toBe(0);
  });
});

describe("orchestrator forecast_renewal_cost", () => {
  it("sums annualCostCents for apps renewing in the window", async () => {
    const tenant = "tenant-a";
    const now = new Date();
    const inSixMonths = new Date(now);
    inSixMonths.setMonth(inSixMonths.getMonth() + 6);
    const inTwoYears = new Date(now);
    inTwoYears.setFullYear(inTwoYears.getFullYear() + 2);

    await saasAppRepository.create(tenant, {
      slug: "slack",
      name: "Slack",
      vendor: "Slack",
      category: "Communication",
      owner: "owner@example.com",
      totalSeats: 100,
      activeSeats: 90,
      annualCostCents: 1_200_000,
      renewalDate: inSixMonths.toISOString().slice(0, 10),
      status: "active",
    });
    await saasAppRepository.create(tenant, {
      slug: "github",
      name: "GitHub",
      vendor: "GitHub",
      category: "Eng",
      owner: "owner@example.com",
      totalSeats: 50,
      activeSeats: 40,
      annualCostCents: 800_000,
      renewalDate: inTwoYears.toISOString().slice(0, 10),
      status: "active",
    });

    const { context } = makeContext({
      routes: { "GET /apps": listAppsHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/forecast-renewal-cost",
      method: "POST",
      body: { monthsAhead: 12 },
      tenantId: tenant,
    });
    const response = await forecastRenewalCostHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      count: number;
      totalCents: number;
      upcoming: Array<{ slug: string }>;
    };
    expect(data.count).toBe(1);
    expect(data.totalCents).toBe(1_200_000);
    expect(data.upcoming[0].slug).toBe("slack");
  });
});

describe("orchestrator recommend_seat_reduction", () => {
  it("recommends new seat count with 10% headroom", async () => {
    const tenant = "tenant-a";
    await saasAppRepository.create(tenant, {
      slug: "slack",
      name: "Slack",
      vendor: "Slack",
      category: "Communication",
      owner: "owner@example.com",
      totalSeats: 100,
      activeSeats: 50,
      annualCostCents: 1_000_000,
      renewalDate: "2026-12-01",
      status: "active",
    });
    // 50 active licenses (none removed)
    for (let i = 0; i < 50; i++) {
      await licenseRepository.create(tenant, {
        saasAppSlug: "slack",
        employeeEmail: `u${i}@example.com`,
        role: "user",
        assignedAt: "2026-01-01T00:00:00.000Z",
        removedAt: null,
        lastActiveAt: null,
      });
    }
    const { context } = makeContext({
      routes: {
        "GET /apps": listAppsHandler,
        "GET /licenses": listLicensesHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/recommend-seat-reduction",
      method: "POST",
      body: { saasAppSlug: "slack" },
      tenantId: tenant,
    });
    const response = await recommendSeatReductionHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      activeLicenses: number;
      recommendedSeats: number;
      seatsToRemove: number;
      annualSavingsCents: number;
    };
    expect(data.activeLicenses).toBe(50);
    // Math.ceil(50 * 1.1) === 56 in JS (50 * 1.1 = 55.00000000000001 due to FP).
    expect(data.recommendedSeats).toBe(56);
    expect(data.seatsToRemove).toBe(44);
    // round((1_000_000 / 100) * 44) = 440_000
    expect(data.annualSavingsCents).toBe(440_000);
  });

  it("404s when slug not found", async () => {
    const { context } = makeContext({
      routes: {
        "GET /apps": listAppsHandler,
        "GET /licenses": listLicensesHandler,
      },
      tenantId: "tenant-a",
    });
    const request = makeRequest({
      url: "https://kit.test/recommend-seat-reduction",
      method: "POST",
      body: { saasAppSlug: "nope" },
      tenantId: "tenant-a",
    });
    const response = await recommendSeatReductionHandler(request, context);
    expect(response.status).toBe(404);
  });
});

describe("OAuth callback handlers", () => {
  it("Google OAuth callback exchanges code and surfaces refresh_token", async () => {
    environment.GOOGLE_CLIENT_ID = "g";
    environment.GOOGLE_CLIENT_SECRET = "g";
    environment.GOOGLE_REDIRECT_URI = "https://kit.test/oauth/google/callback";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "at",
            refresh_token: "rt",
            scope: "scope",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      );

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/oauth/google/callback?code=abc",
      method: "GET",
    });
    const response = await googleOAuthCallbackHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      ok: boolean;
      refresh_token: string;
    };
    expect(data.ok).toBe(true);
    expect(data.refresh_token).toBe("rt");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Google OAuth callback returns 400 on missing code", async () => {
    environment.GOOGLE_CLIENT_ID = "g";
    environment.GOOGLE_CLIENT_SECRET = "g";
    environment.GOOGLE_REDIRECT_URI = "https://kit.test/oauth/google/callback";
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/oauth/google/callback",
      method: "GET",
    });
    const response = await googleOAuthCallbackHandler(request, context);
    expect(response.status).toBe(400);
  });

  it("Google OAuth callback returns 500 when env unconfigured", async () => {
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/oauth/google/callback?code=abc",
      method: "GET",
    });
    const response = await googleOAuthCallbackHandler(request, context);
    expect(response.status).toBe(500);
  });

  it("Microsoft callback acks admin_consent without exchanging tokens", async () => {
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/oauth/microsoft/callback?admin_consent=True&tenant=abc",
      method: "GET",
    });
    const response = await microsoftOAuthCallbackHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok: boolean; tenantId: string };
    expect(data.ok).toBe(true);
    expect(data.tenantId).toBe("abc");
  });

  it("Microsoft callback exchanges code when present", async () => {
    environment.MICROSOFT_CLIENT_ID = "m";
    environment.MICROSOFT_CLIENT_SECRET = "m";
    environment.MICROSOFT_TENANT_ID = "tid";
    environment.MICROSOFT_REDIRECT_URI = "https://kit.test/oauth/microsoft/callback";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "at", expires_in: 3600 }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/oauth/microsoft/callback?code=xyz",
      method: "GET",
    });
    const response = await microsoftOAuthCallbackHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { tokenIssued: boolean };
    expect(data.tokenIssued).toBe(true);
  });

  it("Microsoft callback returns 400 on missing code/admin_consent", async () => {
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/oauth/microsoft/callback",
      method: "GET",
    });
    const response = await microsoftOAuthCallbackHandler(request, context);
    expect(response.status).toBe(400);
  });
});
