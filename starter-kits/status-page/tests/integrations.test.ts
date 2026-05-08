import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  verifyDatadogWebhook,
  tagValue,
  tagValues,
} from "../modules/integrations/datadog.ts";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import { sendTwilioSms } from "../modules/integrations/twilio.ts";
import { postSlackMessage } from "../modules/integrations/slack.ts";
import {
  fanoutToSubscribers,
} from "../modules/integrations/fanout.ts";
import {
  subscriberRepository,
} from "../modules/repositories/subscribers.ts";
import { makeContext } from "@zuplo/starter-kit-shared/testing";

const ENV_KEYS = [
  "DATADOG_WEBHOOK_SECRET",
  "NODE_ENV",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "SLACK_BOT_TOKEN",
  "SLACK_WEBHOOK_URL",
  "SLACK_DEFAULT_CHANNEL",
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
    const page = await subscriberRepository.list(tenant, { limit: 1000 });
    for (const item of page.items) {
      await subscriberRepository.delete(tenant, item.id).catch(() => {});
    }
  }
});

async function hmacHex(secret: string, body: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("integrations/datadog — verifyDatadogWebhook", () => {
  it("accepts a request with a valid signature", async () => {
    environment.DATADOG_WEBHOOK_SECRET = "secret";
    const body = '{"x":1}';
    const sig = await hmacHex("secret", body);
    const req = new Request("https://kit.test/", {
      method: "POST",
      headers: { "x-datadog-signature": sig },
    });
    expect(await verifyDatadogWebhook(req, body)).toBe(true);
  });

  it("rejects an invalid signature", async () => {
    environment.DATADOG_WEBHOOK_SECRET = "secret";
    const req = new Request("https://kit.test/", {
      headers: { "x-datadog-signature": "deadbeef" },
    });
    expect(await verifyDatadogWebhook(req, "body")).toBe(false);
  });

  it("rejects missing header", async () => {
    environment.DATADOG_WEBHOOK_SECRET = "secret";
    const req = new Request("https://kit.test/");
    expect(await verifyDatadogWebhook(req, "body")).toBe(false);
  });

  it("fail-open in dev / fail-closed in prod when secret missing", async () => {
    environment.NODE_ENV = "development";
    expect(
      await verifyDatadogWebhook(new Request("https://kit.test/"), "x"),
    ).toBe(true);
    environment.NODE_ENV = "production";
    expect(
      await verifyDatadogWebhook(new Request("https://kit.test/"), "x"),
    ).toBe(false);
  });
});

describe("integrations/datadog — tagValue / tagValues", () => {
  it("tagValue returns the first matching tag's value", () => {
    expect(
      tagValue(
        { tags: ["component:api", "severity:critical"] },
        "severity",
      ),
    ).toBe("critical");
    expect(tagValue({ tags: ["a:b"] }, "missing")).toBeNull();
  });

  it("tagValues returns all matching tags' values", () => {
    expect(
      tagValues(
        { tags: ["component:api", "component:web", "severity:major"] },
        "component",
      ),
    ).toEqual(["api", "web"]);
  });
});

describe("integrations/resend", () => {
  it("POSTs to /emails with bearer auth", async () => {
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "noreply@example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "abc" }), { status: 200 }),
      );
    const result = await sendResendEmail({
      to: "x@y.com",
      subject: "hi",
      text: "hi",
    });
    expect(result.id).toBe("abc");
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
  });

  it("throws on non-2xx", async () => {
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "x@x.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("error", { status: 500 }),
    );
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "h" }),
    ).rejects.toThrow(/Resend/);
  });

  it("throws when key is unset", async () => {
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "h" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe("integrations/twilio", () => {
  it("POSTs to Messages.json with Basic auth and form body", async () => {
    environment.TWILIO_ACCOUNT_SID = "AC123";
    environment.TWILIO_AUTH_TOKEN = "secret";
    environment.TWILIO_FROM_NUMBER = "+15551234567";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            sid: "SM1",
            status: "queued",
            to: "+19998887777",
            from: "+15551234567",
            body: "hi",
            error_code: null,
            error_message: null,
          }),
          { status: 201 },
        ),
      );
    const result = await sendTwilioSms({ to: "+19998887777", body: "hi" });
    expect(result.sid).toBe("SM1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${btoa("AC123:secret")}`,
    );
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const bodyStr = String((init as RequestInit).body);
    expect(bodyStr).toContain("To=%2B19998887777");
    expect(bodyStr).toContain("From=%2B15551234567");
  });

  it("throws on non-2xx", async () => {
    environment.TWILIO_ACCOUNT_SID = "AC123";
    environment.TWILIO_AUTH_TOKEN = "secret";
    environment.TWILIO_FROM_NUMBER = "+15551234567";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      sendTwilioSms({ to: "+19998887777", body: "hi" }),
    ).rejects.toThrow(/Twilio/);
  });

  it("throws when credentials are missing", async () => {
    await expect(
      sendTwilioSms({ to: "+19998887777", body: "hi" }),
    ).rejects.toThrow(/TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN/);
  });
});

describe("integrations/slack", () => {
  it("posts to a per-subscriber webhook URL when provided", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const result = await postSlackMessage({
      text: "hi",
      webhookUrl: "https://hooks.slack.com/services/abc",
    });
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://hooks.slack.com/services/abc",
    );
  });

  it("uses bot token when no per-subscriber URL", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    await postSlackMessage({ text: "hi" });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://slack.com/api/chat.postMessage",
    );
  });

  it("falls back to global SLACK_WEBHOOK_URL", async () => {
    environment.SLACK_WEBHOOK_URL = "https://hooks.slack.com/global";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    await postSlackMessage({ text: "hi" });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://hooks.slack.com/global",
    );
  });

  it("throws when nothing configured", async () => {
    await expect(postSlackMessage({ text: "hi" })).rejects.toThrow(
      /webhookUrl|SLACK_BOT_TOKEN|SLACK_WEBHOOK_URL/,
    );
  });
});

describe("integrations/fanout — fanoutToSubscribers", () => {
  it("dispatches each subscriber to exactly the channels they prefer", async () => {
    const tenant = "tenant-a";
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "noreply@example.com";
    environment.TWILIO_ACCOUNT_SID = "AC123";
    environment.TWILIO_AUTH_TOKEN = "secret";
    environment.TWILIO_FROM_NUMBER = "+15551234567";

    // Three subscribers, each with a different channel preference.
    await subscriberRepository.create(tenant, {
      email: "alice@example.com",
      phone: null,
      slackWebhookUrl: null,
      channels: ["email"],
      components: [],
      notifyOnImpact: "minor",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    await subscriberRepository.create(tenant, {
      email: "bob@example.com",
      phone: "+19998887777",
      slackWebhookUrl: null,
      channels: ["sms"],
      components: [],
      notifyOnImpact: "minor",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    await subscriberRepository.create(tenant, {
      email: "ops@example.com",
      phone: null,
      slackWebhookUrl: "https://hooks.slack.com/services/c",
      channels: ["slack"],
      components: [],
      notifyOnImpact: "minor",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = String(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
        if (url.includes("api.resend.com")) {
          return Promise.resolve(
            new Response(JSON.stringify({ id: "re_1" }), { status: 200 }),
          );
        }
        if (url.includes("api.twilio.com")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                sid: "SM",
                status: "queued",
                to: "+19998887777",
                from: "+15551234567",
                body: "hi",
                error_code: null,
                error_message: null,
              }),
              { status: 201 },
            ),
          );
        }
        if (url.includes("hooks.slack.com")) {
          return Promise.resolve(new Response("ok", { status: 200 }));
        }
        return Promise.resolve(new Response("Unknown: " + url, { status: 404 }));
      });

    const { context } = makeContext({});
    const result = await fanoutToSubscribers(
      tenant,
      {
        subject: "Down",
        text: "Investigating",
        impact: "major",
        affectedComponents: [],
        dedupKey: "k1",
      },
      context,
    );

    expect(result.attempted).toBe(3);
    expect(result.delivered).toBe(3);
    expect(result.errors.length).toBe(0);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("api.resend.com"))).toBe(true);
    expect(urls.some((u) => u.includes("api.twilio.com"))).toBe(true);
    expect(urls.some((u) => u.includes("hooks.slack.com"))).toBe(true);
  });

  it("filters subscribers by impact threshold", async () => {
    const tenant = "tenant-a";
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "noreply@example.com";

    // Only critical-tier subscriber should fire on a critical event.
    await subscriberRepository.create(tenant, {
      email: "alice@example.com",
      phone: null,
      slackWebhookUrl: null,
      channels: ["email"],
      components: [],
      notifyOnImpact: "critical",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    // Minor-tier subscriber should NOT fire on a critical event? No — critical >= minor, so it WILL fire.
    // But none-tier should not.
    await subscriberRepository.create(tenant, {
      email: "bob@example.com",
      phone: null,
      slackWebhookUrl: null,
      channels: ["email"],
      components: [],
      notifyOnImpact: "none",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    // Minor subscriber on a minor event: fires.
    // Major subscriber on a minor event: filtered out.
    await subscriberRepository.create(tenant, {
      email: "carol@example.com",
      phone: null,
      slackWebhookUrl: null,
      channels: ["email"],
      components: [],
      notifyOnImpact: "major",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "re_1" }), { status: 200 }),
      );

    const { context } = makeContext({});
    const result = await fanoutToSubscribers(
      tenant,
      {
        subject: "Minor",
        text: "x",
        impact: "minor",
        affectedComponents: [],
        dedupKey: "k",
      },
      context,
    );
    // Alice (critical threshold) shouldn't fire on minor, Carol (major) shouldn't fire on minor, Bob (none) never fires.
    // Only no one fires.
    expect(result.attempted).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters subscribers by component scope when specified", async () => {
    const tenant = "tenant-a";
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "noreply@example.com";

    // Subscriber scoped to "api" only.
    await subscriberRepository.create(tenant, {
      email: "api-only@example.com",
      phone: null,
      slackWebhookUrl: null,
      channels: ["email"],
      components: ["api"],
      notifyOnImpact: "minor",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    // Subscriber to all (empty components).
    await subscriberRepository.create(tenant, {
      email: "all@example.com",
      phone: null,
      slackWebhookUrl: null,
      channels: ["email"],
      components: [],
      notifyOnImpact: "minor",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "re_1" }), { status: 200 }),
      );

    const { context } = makeContext({});
    // Web-only event: api-only subscriber should NOT fire, all-subscriber SHOULD.
    const result = await fanoutToSubscribers(
      tenant,
      {
        subject: "Web down",
        text: "x",
        impact: "major",
        affectedComponents: ["web"],
        dedupKey: "k",
      },
      context,
    );
    expect(result.attempted).toBe(1);
    expect(result.delivered).toBe(1);
    const sentBody = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(sentBody.to).toBe("all@example.com");
  });

  it("captures errors in result.errors without throwing", async () => {
    const tenant = "tenant-a";
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "noreply@example.com";

    await subscriberRepository.create(tenant, {
      email: "alice@example.com",
      phone: null,
      slackWebhookUrl: null,
      channels: ["email"],
      components: [],
      notifyOnImpact: "minor",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );

    const { context } = makeContext({});
    const result = await fanoutToSubscribers(
      tenant,
      {
        subject: "X",
        text: "X",
        impact: "major",
        affectedComponents: [],
        dedupKey: "k",
      },
      context,
    );
    expect(result.attempted).toBe(1);
    expect(result.delivered).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].channel).toBe("email");
  });

  it("captures error when sms channel has no phone", async () => {
    const tenant = "tenant-a";
    await subscriberRepository.create(tenant, {
      email: "alice@example.com",
      phone: null,
      slackWebhookUrl: null,
      channels: ["sms"],
      components: [],
      notifyOnImpact: "minor",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const { context } = makeContext({});
    const result = await fanoutToSubscribers(
      tenant,
      {
        subject: "X",
        text: "X",
        impact: "major",
        affectedComponents: [],
        dedupKey: "k",
      },
      context,
    );
    expect(result.attempted).toBe(1);
    expect(result.delivered).toBe(0);
    expect(result.errors[0].channel).toBe("sms");
    expect(result.errors[0].message).toMatch(/phone/);
  });

  it("respects multi-tenant isolation in subscriber listing", async () => {
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "noreply@example.com";

    await subscriberRepository.create("tenant-a", {
      email: "a@a.com",
      phone: null,
      slackWebhookUrl: null,
      channels: ["email"],
      components: [],
      notifyOnImpact: "minor",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    await subscriberRepository.create("tenant-b", {
      email: "b@b.com",
      phone: null,
      slackWebhookUrl: null,
      channels: ["email"],
      components: [],
      notifyOnImpact: "minor",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "re_1" }), { status: 200 }),
      );

    const { context } = makeContext({});
    const result = await fanoutToSubscribers(
      "tenant-a",
      {
        subject: "X",
        text: "X",
        impact: "major",
        affectedComponents: [],
        dedupKey: "k",
      },
      context,
    );
    expect(result.attempted).toBe(1);
    expect(result.delivered).toBe(1);
    const sentBody = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(sentBody.to).toBe("a@a.com");
  });
});
