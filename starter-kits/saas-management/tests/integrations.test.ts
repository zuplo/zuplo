import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  getGoogleAccessToken,
  listWorkspaceUsers,
  listOAuthAuthorizedApps,
} from "../modules/integrations/google-workspace.ts";
import {
  getMicrosoftGraphToken,
  listSubscribedSkus,
  listConsentedThirdPartyApps,
} from "../modules/integrations/microsoft-365.ts";
import {
  listOktaUsers,
  listOktaApps,
  countAppUsers,
  listOktaAppsWithUserCounts,
} from "../modules/integrations/okta.ts";

const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "OKTA_ORG_URL",
  "OKTA_API_TOKEN",
];
function clearEnv() {
  for (const key of ENV_KEYS) {
    delete (environment as Record<string, string | undefined>)[key];
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  clearEnv();
});

describe("integrations/google-workspace", () => {
  it("getGoogleAccessToken exchanges refresh token via OAuth", async () => {
    environment.GOOGLE_CLIENT_ID = "cid";
    environment.GOOGLE_CLIENT_SECRET = "secret";
    environment.GOOGLE_REFRESH_TOKEN = "rt";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "at",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200 },
        ),
      );

    const token = await getGoogleAccessToken();
    expect(token).toBe("at");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect((init as RequestInit).method).toBe("POST");
    const body = (init as RequestInit).body as URLSearchParams;
    const bodyStr =
      body instanceof URLSearchParams ? body.toString() : String(body);
    expect(bodyStr).toContain("grant_type=refresh_token");
    expect(bodyStr).toContain("client_id=cid");
    expect(bodyStr).toContain("refresh_token=rt");
  });

  it("getGoogleAccessToken throws on missing config", async () => {
    await expect(getGoogleAccessToken()).rejects.toThrow(
      /GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|GOOGLE_REFRESH_TOKEN/,
    );
  });

  it("getGoogleAccessToken throws on non-2xx", async () => {
    environment.GOOGLE_CLIENT_ID = "cid";
    environment.GOOGLE_CLIENT_SECRET = "secret";
    environment.GOOGLE_REFRESH_TOKEN = "rt";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("denied", { status: 401 }),
    );
    await expect(getGoogleAccessToken()).rejects.toThrow(/Google/);
  });

  it("listWorkspaceUsers fetches paginated user list with bearer token", async () => {
    environment.GOOGLE_CLIENT_ID = "cid";
    environment.GOOGLE_CLIENT_SECRET = "secret";
    environment.GOOGLE_REFRESH_TOKEN = "rt";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "at", expires_in: 3600, token_type: "Bearer" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
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
            ],
          }),
          { status: 200 },
        ),
      );
    const users = await listWorkspaceUsers();
    expect(users.length).toBe(1);
    expect(users[0].primaryEmail).toBe("alice@example.com");
    const [listUrl, listInit] = fetchMock.mock.calls[1]!;
    expect(String(listUrl)).toContain("/admin/directory/v1/users");
    expect(String(listUrl)).toContain("customer=my_customer");
    const headers = new Headers((listInit as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer at");
  });

  it("listOAuthAuthorizedApps aggregates by clientId", async () => {
    environment.GOOGLE_CLIENT_ID = "cid";
    environment.GOOGLE_CLIENT_SECRET = "secret";
    environment.GOOGLE_REFRESH_TOKEN = "rt";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "at",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
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
              {
                id: { time: "2026-04-16T00:00:00Z" },
                actor: { email: "bob@example.com" },
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
    const apps = await listOAuthAuthorizedApps();
    expect(apps.length).toBe(1);
    expect(apps[0].clientId).toBe("abc");
    expect(apps[0].userCount).toBe(2);
    expect(apps[0].displayText).toBe("Slack");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("integrations/microsoft-365", () => {
  it("getMicrosoftGraphToken posts client_credentials", async () => {
    environment.MICROSOFT_TENANT_ID = "tid";
    environment.MICROSOFT_CLIENT_ID = "cid";
    environment.MICROSOFT_CLIENT_SECRET = "secret";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "at",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200 },
        ),
      );
    const token = await getMicrosoftGraphToken();
    expect(token).toBe("at");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://login.microsoftonline.com/tid/oauth2/v2.0/token",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const bodyStr = String((init as RequestInit).body);
    expect(bodyStr).toContain("grant_type=client_credentials");
  });

  it("getMicrosoftGraphToken throws on missing config", async () => {
    await expect(getMicrosoftGraphToken()).rejects.toThrow(
      /MICROSOFT_TENANT_ID|MICROSOFT_CLIENT_ID|MICROSOFT_CLIENT_SECRET/,
    );
  });

  it("getMicrosoftGraphToken throws on non-2xx", async () => {
    environment.MICROSOFT_TENANT_ID = "tid";
    environment.MICROSOFT_CLIENT_ID = "cid";
    environment.MICROSOFT_CLIENT_SECRET = "secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(getMicrosoftGraphToken()).rejects.toThrow(/Microsoft/);
  });

  it("listSubscribedSkus reads /subscribedSkus and shapes the response", async () => {
    environment.MICROSOFT_TENANT_ID = "tid";
    environment.MICROSOFT_CLIENT_ID = "cid";
    environment.MICROSOFT_CLIENT_SECRET = "secret";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "at",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: [
              {
                skuPartNumber: "ENTERPRISEPACK",
                skuId: "sku-1",
                prepaidUnits: { enabled: 100 },
                consumedUnits: 80,
                capabilityStatus: "Enabled",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const skus = await listSubscribedSkus();
    expect(skus[0].skuPartNumber).toBe("ENTERPRISEPACK");
    expect(skus[0].totalSeats).toBe(100);
    expect(skus[0].consumedUnits).toBe(80);
  });

  it("listConsentedThirdPartyApps filters Microsoft first-party apps", async () => {
    environment.MICROSOFT_TENANT_ID = "tid";
    environment.MICROSOFT_CLIENT_ID = "cid";
    environment.MICROSOFT_CLIENT_SECRET = "secret";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "at",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: [
              {
                appId: "app-1",
                displayName: "ThirdPartyApp",
                publisherName: "ACME",
                signInAudience: "AzureADMyOrg",
                appOwnerOrganizationId: "abc",
                servicePrincipalType: "Application",
              },
              {
                appId: "app-2",
                displayName: "MicrosoftApp",
                publisherName: "Microsoft",
                signInAudience: "AzureADMyOrg",
                appOwnerOrganizationId:
                  "f8cdef31-a31e-4b4a-93e4-5f571e91255a",
                servicePrincipalType: "Application",
              },
              {
                appId: "app-3",
                displayName: "ManagedIdentity",
                publisherName: null,
                signInAudience: "AzureADMyOrg",
                servicePrincipalType: "ManagedIdentity",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const apps = await listConsentedThirdPartyApps();
    expect(apps.length).toBe(1);
    expect(apps[0].appId).toBe("app-1");
  });
});

describe("integrations/okta", () => {
  it("listOktaUsers uses SSWS auth and parses response", async () => {
    environment.OKTA_ORG_URL = "https://example.okta.com";
    environment.OKTA_API_TOKEN = "tok123";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "u1",
              status: "ACTIVE",
              profile: { email: "alice@example.com" },
              lastLogin: null,
              created: "2026-04-01T00:00:00Z",
            },
          ]),
          { status: 200 },
        ),
      );
    const users = await listOktaUsers();
    expect(users.length).toBe(1);
    expect(users[0].profile.email).toBe("alice@example.com");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://example.okta.com/api/v1/users");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("SSWS tok123");
  });

  it("listOktaUsers throws when OKTA_ORG_URL is unset", async () => {
    await expect(listOktaUsers()).rejects.toThrow(/OKTA_ORG_URL/);
  });

  it("listOktaUsers throws on non-2xx", async () => {
    environment.OKTA_ORG_URL = "https://example.okta.com";
    environment.OKTA_API_TOKEN = "tok123";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(listOktaUsers()).rejects.toThrow(/Okta/);
  });

  it("listOktaApps initializes assignedUserCount to 0", async () => {
    environment.OKTA_ORG_URL = "https://example.okta.com";
    environment.OKTA_API_TOKEN = "tok123";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "app-1",
            name: "slack",
            label: "Slack",
            status: "ACTIVE",
            signOnMode: "OPENID_CONNECT",
          },
        ]),
        { status: 200 },
      ),
    );
    const apps = await listOktaApps();
    expect(apps[0].assignedUserCount).toBe(0);
    expect(apps[0].id).toBe("app-1");
  });

  it("countAppUsers returns count of paged users", async () => {
    environment.OKTA_ORG_URL = "https://example.okta.com";
    environment.OKTA_API_TOKEN = "tok123";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{}, {}, {}]), { status: 200 }),
    );
    const count = await countAppUsers("app-1");
    expect(count).toBe(3);
  });

  it("listOktaAppsWithUserCounts populates counts", async () => {
    environment.OKTA_ORG_URL = "https://example.okta.com";
    environment.OKTA_API_TOKEN = "tok123";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "app-1",
              name: "slack",
              label: "Slack",
              status: "ACTIVE",
              signOnMode: "OPENID_CONNECT",
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{}, {}]), { status: 200 }),
      );
    const apps = await listOktaAppsWithUserCounts();
    expect(apps[0].assignedUserCount).toBe(2);
  });
});
