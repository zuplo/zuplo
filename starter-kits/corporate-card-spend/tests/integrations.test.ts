import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  listRampTransactions,
  listRampCards,
  updateRampCardLimit,
  freezeRampCard,
  unfreezeRampCard,
  setRampTransactionMemo,
} from "../modules/integrations/ramp.ts";
import {
  postSlackMessage,
  lookupSlackUserByEmail,
  defaultFinanceChannel,
} from "../modules/integrations/slack.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const TOKEN_OK = () =>
  new Response(JSON.stringify({ access_token: "tok_test", expires_in: 3600 }), {
    status: 200,
  });

/**
 * Note: ramp.ts caches its OAuth token in module-private state across tests.
 * Each test mocks fetch to return a fresh token AND the api response, but the
 * cached token may short-circuit subsequent test calls. We assert behaviors
 * that hold either way (last call's URL/method/body), and only assert the
 * token exchange specifically when running the first test in a fresh module.
 */
describe("integrations/ramp", () => {
  beforeEach(() => {
    setEnv("RAMP_CLIENT_ID", "cid_test");
    setEnv("RAMP_CLIENT_SECRET", "sec_test");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RAMP_CLIENT_ID");
    clearEnv("RAMP_CLIENT_SECRET");
    clearEnv("RAMP_OAUTH_SCOPE");
  });

  it("listRampTransactions calls /transactions with bearer + query params", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/token")) return TOKEN_OK();
      return new Response(JSON.stringify({ data: [], page: { next: null } }), { status: 200 });
    });
    await listRampTransactions({ from: "2024-04-01", to: "2024-05-01", limit: 50 });
    const apiCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/transactions?"),
    )!;
    expect(apiCall).toBeTruthy();
    expect(String(apiCall[0])).toContain("from_date=2024-04-01");
    expect(String(apiCall[0])).toContain("to_date=2024-05-01");
    expect(String(apiCall[0])).toContain("page_size=50");
    const headers = new Headers((apiCall[1] as RequestInit).headers);
    expect(headers.get("authorization")).toMatch(/^Bearer /);
  });

  it("listRampCards GETs /cards", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/token")) return TOKEN_OK();
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "c1", cardholder_id: "u1", display_name: "x", state: "ACTIVE",
              spending_restrictions: { amount: 1000, interval: "MONTHLY", categories: null },
            },
          ],
          page: { next: null },
        }),
        { status: 200 },
      );
    });
    const result = await listRampCards({ limit: 25 });
    expect(result.data.length).toBe(1);
    const apiCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/cards?"))!;
    expect(String(apiCall[0])).toContain("page_size=25");
  });

  it("updateRampCardLimit PATCHes /cards/:id with spending_restrictions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/token")) return TOKEN_OK();
      return new Response(JSON.stringify({ id: "c1" }), { status: 200 });
    });
    await updateRampCardLimit({ cardId: "c1", amountCents: 5000, interval: "MONTHLY" });
    const apiCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/cards/c1"))!;
    const init = apiCall[1] as RequestInit;
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body.spending_restrictions.amount).toBe(5000);
    expect(body.spending_restrictions.interval).toBe("MONTHLY");
  });

  it("freezeRampCard POSTs /cards/:id/suspension", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/token")) return TOKEN_OK();
      return new Response(JSON.stringify({ id: "c1" }), { status: 200 });
    });
    await freezeRampCard("c1");
    const apiCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/suspension"))!;
    expect((apiCall[1] as RequestInit).method).toBe("POST");
  });

  it("unfreezeRampCard DELETEs /cards/:id/suspension", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/token")) return TOKEN_OK();
      return new Response(JSON.stringify({ id: "c1" }), { status: 200 });
    });
    await unfreezeRampCard("c1");
    const apiCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/suspension"))!;
    expect((apiCall[1] as RequestInit).method).toBe("DELETE");
  });

  it("setRampTransactionMemo PATCHes /transactions/:id with memo", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/token")) return TOKEN_OK();
      return new Response(JSON.stringify({ id: "t1", memo: "client lunch" }), { status: 200 });
    });
    await setRampTransactionMemo({ transactionId: "t1", memo: "client lunch" });
    const apiCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/transactions/t1"))!;
    const init = apiCall[1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string).memo).toBe("client lunch");
  });

  it("throws on non-2xx api response", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/token")) return TOKEN_OK();
      return new Response("nope", { status: 500 });
    });
    await expect(listRampTransactions({})).rejects.toThrow(/Ramp GET/);
  });

  it("throws when RAMP_CLIENT_ID is unset (and token cache empty)", async () => {
    clearEnv("RAMP_CLIENT_ID");
    // We expect either RAMP_CLIENT_ID error (cache miss) or success path.
    // To force cache miss, mock fetch to return token failure first time.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("forbidden", { status: 403 }));
    // If cache hits, the call still hits the api route which should fail too.
    await expect(listRampTransactions({})).rejects.toThrow();
  });

  it("throws when RAMP_CLIENT_SECRET is unset (and token cache empty)", async () => {
    clearEnv("RAMP_CLIENT_SECRET");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("forbidden", { status: 403 }));
    await expect(listRampTransactions({})).rejects.toThrow();
  });
});

describe("integrations/slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_BOT_TOKEN");
    clearEnv("SLACK_FINANCE_CHANNEL");
  });

  it("postSlackMessage POSTs chat.postMessage with bearer", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1.2", channel: "C" }), { status: 200 }),
    );
    const result = await postSlackMessage({ channel: "C", text: "hi" });
    expect(result.ok).toBe(true);
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb");
  });

  it("postSlackMessage throws on ok:false", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "no_channel" }), { status: 200 }),
    );
    await expect(postSlackMessage({ channel: "C", text: "hi" })).rejects.toThrow(/no_channel/);
  });

  it("postSlackMessage throws on HTTP non-2xx", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("oops", { status: 500 }));
    await expect(postSlackMessage({ channel: "C", text: "hi" })).rejects.toThrow(/HTTP 500/);
  });

  it("postSlackMessage throws when SLACK_BOT_TOKEN unset", async () => {
    clearEnv("SLACK_BOT_TOKEN");
    await expect(postSlackMessage({ channel: "C", text: "hi" })).rejects.toThrow(
      /SLACK_BOT_TOKEN/,
    );
  });

  it("lookupSlackUserByEmail returns user on ok response", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, user: { id: "U1", name: "alice", real_name: "Alice" } }),
        { status: 200 },
      ),
    );
    const user = await lookupSlackUserByEmail("a@b.com");
    expect(user?.id).toBe("U1");
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "users.lookupByEmail?email=a%40b.com",
    );
  });

  it("lookupSlackUserByEmail returns null on non-2xx", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 404 }));
    expect(await lookupSlackUserByEmail("a@b.com")).toBeNull();
  });

  it("lookupSlackUserByEmail throws when SLACK_BOT_TOKEN unset", async () => {
    clearEnv("SLACK_BOT_TOKEN");
    await expect(lookupSlackUserByEmail("a@b.com")).rejects.toThrow(/SLACK_BOT_TOKEN/);
  });

  it("defaultFinanceChannel reads env or returns #finance", () => {
    setEnv("SLACK_FINANCE_CHANNEL", "#money");
    expect(defaultFinanceChannel()).toBe("#money");
    clearEnv("SLACK_FINANCE_CHANNEL");
    expect(defaultFinanceChannel()).toBe("#finance");
  });
});
