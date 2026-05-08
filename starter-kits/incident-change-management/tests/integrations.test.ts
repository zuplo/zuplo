import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  triggerPagerDuty,
  verifyPagerDutyWebhook,
} from "../modules/integrations/pagerduty.ts";
import { postSlackMessage } from "../modules/integrations/slack.ts";

const ENV_KEYS = [
  "PAGERDUTY_ROUTING_KEY",
  "PAGERDUTY_WEBHOOK_SECRET",
  "NODE_ENV",
  "SLACK_BOT_TOKEN",
  "SLACK_WEBHOOK_URL",
  "SLACK_INCIDENT_CHANNEL",
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

describe("integrations/pagerduty — triggerPagerDuty", () => {
  it("POSTs to events.pagerduty.com/v2/enqueue with the payload", async () => {
    environment.PAGERDUTY_ROUTING_KEY = "rk-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "success",
            dedup_key: "abc",
            message: "Event processed",
          }),
          { status: 202 },
        ),
      );

    const result = await triggerPagerDuty({
      dedupKey: "abc",
      summary: "Service is down",
      source: "monitor",
      severity: "critical",
      customDetails: { region: "us-east" },
    });
    expect(result.status).toBe("success");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://events.pagerduty.com/v2/enqueue");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.routing_key).toBe("rk-test");
    expect(body.event_action).toBe("trigger");
    expect(body.dedup_key).toBe("abc");
    expect(body.payload.severity).toBe("critical");
    expect(body.payload.custom_details.region).toBe("us-east");
  });

  it("throws on non-2xx", async () => {
    environment.PAGERDUTY_ROUTING_KEY = "rk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      triggerPagerDuty({
        dedupKey: "k",
        summary: "x",
        source: "y",
        severity: "info",
      }),
    ).rejects.toThrow(/PagerDuty/);
  });

  it("throws when PAGERDUTY_ROUTING_KEY is unset and not provided", async () => {
    await expect(
      triggerPagerDuty({
        dedupKey: "k",
        summary: "x",
        source: "y",
        severity: "info",
      }),
    ).rejects.toThrow(/PAGERDUTY_ROUTING_KEY/);
  });
});

describe("integrations/pagerduty — verifyPagerDutyWebhook", () => {
  it("accepts a request with a matching v1=<hmac> signature", async () => {
    environment.PAGERDUTY_WEBHOOK_SECRET = "secret";
    const body = '{"hello":"world"}';
    const sig = await hmacHex("secret", body);
    const req = new Request("https://kit.test/", {
      method: "POST",
      headers: { "x-pagerduty-signature": `v1=${sig}` },
    });
    expect(await verifyPagerDutyWebhook(req, body)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    environment.PAGERDUTY_WEBHOOK_SECRET = "secret";
    const body = '{"hello":"world"}';
    const sig = await hmacHex("secret", body);
    const req = new Request("https://kit.test/", {
      method: "POST",
      headers: { "x-pagerduty-signature": `v1=${sig}xx` },
    });
    expect(await verifyPagerDutyWebhook(req, body)).toBe(false);
  });

  it("rejects when no signature header is provided", async () => {
    environment.PAGERDUTY_WEBHOOK_SECRET = "secret";
    const req = new Request("https://kit.test/");
    expect(await verifyPagerDutyWebhook(req, "body")).toBe(false);
  });

  it("fail-open in non-production when secret unset", async () => {
    environment.NODE_ENV = "development";
    const req = new Request("https://kit.test/");
    expect(await verifyPagerDutyWebhook(req, "body")).toBe(true);
  });

  it("fail-closed in production when secret unset", async () => {
    environment.NODE_ENV = "production";
    const req = new Request("https://kit.test/");
    expect(await verifyPagerDutyWebhook(req, "body")).toBe(false);
  });
});

describe("integrations/slack", () => {
  it("posts via bot token to chat.postMessage", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    environment.SLACK_INCIDENT_CHANNEL = "#incidents";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, ts: "1.0", channel: "C1" }),
          { status: 200 },
        ),
      );
    const result = await postSlackMessage({ text: "alert" });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("#incidents");
    expect(body.icon_emoji).toBe(":rotating_light:");
  });

  it("falls back to webhook URL", async () => {
    environment.SLACK_WEBHOOK_URL = "https://hooks.slack.com/x";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
    const result = await postSlackMessage({ text: "alert" });
    expect(result.ok).toBe(true);
  });

  it("throws when chat.postMessage returns ok=false", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: "channel_not_found" }),
        { status: 200 },
      ),
    );
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(
      /channel_not_found/,
    );
  });

  it("throws when no Slack credentials configured", async () => {
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(
      /SLACK_BOT_TOKEN|SLACK_WEBHOOK_URL/,
    );
  });
});
