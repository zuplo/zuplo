import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import resendWebhook from "../modules/handlers/resend-webhook.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const SECRET_RAW = btoa("kit-secret-bytes");
const SECRET = `whsec_${SECRET_RAW}`;

async function signSvix(secret: string, id: string, ts: string, body: string) {
  const keyB64 = secret.replace(/^whsec_/, "");
  const binary = atob(keyB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(`${id}.${ts}.${body}`),
  );
  let bin = "";
  for (const b of new Uint8Array(sigBuf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function buildSignedRequest(eventType: string, body: Record<string, unknown> = {}) {
  const id = `msg_${Math.random().toString(16).slice(2)}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const event = { type: eventType, created_at: new Date().toISOString(), data: body };
  const raw = JSON.stringify(event);
  const sig = await signSvix(SECRET, id, ts, raw);
  return { raw, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } };
}

describe("webhooks/resend", () => {
  beforeEach(() => {
    setEnv("RESEND_WEBHOOK_SECRET", SECRET);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_WEBHOOK_SECRET");
  });

  it("accepts a valid email.delivered event", async () => {
    const { raw, headers } = await buildSignedRequest("email.delivered", {
      email_id: "em_1",
      to: ["x@y.com"],
    });
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: raw,
      headers,
      anonymous: true,
    });
    const res = await resendWebhook(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(
      logs.some((l) => String(l.messages[0] ?? "").includes("email.delivered")),
    ).toBe(true);
  });

  it("logs a warning and processes an email.bounced event", async () => {
    const { raw, headers } = await buildSignedRequest("email.bounced", {
      email_id: "em_2",
      to: ["bouncer@x.com"],
    });
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: raw,
      headers,
      anonymous: true,
    });
    const res = await resendWebhook(request, context);
    expect(res.status).toBe(200);
    const warnLog = logs.find(
      (l) => l.level === "warn" && String(l.messages[0] ?? "").includes("email.bounced"),
    );
    expect(warnLog).toBeTruthy();
  });

  it("rejects an invalid signature with 401", async () => {
    const event = { type: "email.delivered", created_at: "x", data: {} };
    const raw = JSON.stringify(event);
    const headers = {
      "svix-id": "msg_x",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,deadbeef",
    };
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: raw,
      headers,
      anonymous: true,
    });
    const res = await resendWebhook(request, context);
    expect(res.status).toBe(401);
    expect(
      logs.some((l) => l.level === "warn" && String(l.messages[0] ?? "").includes("signature")),
    ).toBe(true);
  });

  it("rejects when signature header is missing entirely", async () => {
    const event = { type: "email.delivered", created_at: "x", data: {} };
    const raw = JSON.stringify(event);
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: raw,
      headers: {},
      anonymous: true,
    });
    const res = await resendWebhook(request, context);
    expect(res.status).toBe(401);
  });

  it("acks unknown event types without crashing", async () => {
    const { raw, headers } = await buildSignedRequest("email.totally_made_up");
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: raw,
      headers,
      anonymous: true,
    });
    const res = await resendWebhook(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(
      logs.some((l) => String(l.messages[0] ?? "").includes("unhandled")),
    ).toBe(true);
  });

  it("returns 400 when body fails to parse but signature is valid", async () => {
    // Sign over a string that isn't valid JSON.
    const id = "msg_bad";
    const ts = String(Math.floor(Date.now() / 1000));
    const raw = "not-json";
    const sig = await signSvix(SECRET, id, ts, raw);
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: raw,
      headers: {
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": `v1,${sig}`,
      },
      anonymous: true,
    });
    const res = await resendWebhook(request, context);
    expect(res.status).toBe(400);
  });
});
