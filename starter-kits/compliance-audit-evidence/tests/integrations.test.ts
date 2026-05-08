import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  putEvidence,
  getEvidence,
} from "../modules/integrations/r2.ts";
import {
  postDatadogEvent,
  verifyDatadogWebhook,
} from "../modules/integrations/datadog.ts";

const ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
  "DATADOG_API_KEY",
  "DATADOG_APP_KEY",
  "DATADOG_SITE",
  "DATADOG_WEBHOOK_SECRET",
  "NODE_ENV",
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

describe("integrations/r2 — putEvidence", () => {
  it("PUTs to the R2 endpoint with SigV4 Authorization and includes bucket+key in URL", async () => {
    environment.R2_ACCOUNT_ID = "acct123";
    environment.R2_ACCESS_KEY_ID = "AKIATEST";
    environment.R2_SECRET_ACCESS_KEY = "supersecret";
    environment.R2_BUCKET = "evidence-test";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const result = await putEvidence("tenant/control/file.json", '{"x":1}', {
      contentType: "application/json",
      metadata: { source: "test" },
    });
    expect(result.size).toBe('{"x":1}'.length);
    expect(typeof result.sha256).toBe("string");
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    const urlStr = String(url);

    // URL contains bucket + encoded key + R2 host shape
    expect(urlStr).toContain("acct123.r2.cloudflarestorage.com");
    expect(urlStr).toContain("/evidence-test/");
    expect(urlStr).toContain("/tenant/control/file.json");

    expect((init as RequestInit).method).toBe("PUT");
    const headers = (init as RequestInit).headers as Record<string, string>;
    const authHeader = headers["authorization"] ?? "";
    // Authorization shape: AWS4-HMAC-SHA256 Credential=<key>/<datestamp>/<region>/<service>/aws4_request, SignedHeaders=..., Signature=<hex>
    expect(authHeader).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATEST\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]+$/,
    );
    expect(authHeader).toContain("SignedHeaders=");
    expect(headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-amz-meta-source"]).toBe("test");
  });

  it("uses R2_PUBLIC_URL for the returned url when set", async () => {
    environment.R2_ACCOUNT_ID = "acct123";
    environment.R2_ACCESS_KEY_ID = "AKIATEST";
    environment.R2_SECRET_ACCESS_KEY = "supersecret";
    environment.R2_BUCKET = "evidence-test";
    environment.R2_PUBLIC_URL = "https://files.example.com";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    const result = await putEvidence("a/b.txt", "hi");
    expect(result.url.startsWith("https://files.example.com/")).toBe(true);
    expect(result.url).toContain("a/b.txt");
  });

  it("throws when R2 credentials are missing", async () => {
    await expect(putEvidence("a/b", "x")).rejects.toThrow(
      /R2_ACCOUNT_ID|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/,
    );
  });

  it("throws on non-2xx PUT response", async () => {
    environment.R2_ACCOUNT_ID = "acct123";
    environment.R2_ACCESS_KEY_ID = "AKIATEST";
    environment.R2_SECRET_ACCESS_KEY = "supersecret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("denied", { status: 403 }),
    );
    await expect(putEvidence("a/b", "x")).rejects.toThrow(/R2 PUT/);
  });
});

describe("integrations/r2 — getEvidence", () => {
  it("returns null on 404", async () => {
    environment.R2_ACCOUNT_ID = "acct123";
    environment.R2_ACCESS_KEY_ID = "AKIATEST";
    environment.R2_SECRET_ACCESS_KEY = "supersecret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("missing", { status: 404 }),
    );
    expect(await getEvidence("a/b.txt")).toBeNull();
  });

  it("returns bytes on 200", async () => {
    environment.R2_ACCOUNT_ID = "acct123";
    environment.R2_ACCESS_KEY_ID = "AKIATEST";
    environment.R2_SECRET_ACCESS_KEY = "supersecret";
    const bytes = new Uint8Array([1, 2, 3]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(bytes, { status: 200 }),
    );
    const result = await getEvidence("a/b.txt");
    expect(result).not.toBeNull();
    expect(Array.from(result!)).toEqual([1, 2, 3]);
  });
});

describe("integrations/datadog — verifyDatadogWebhook", () => {
  it("accepts a request with matching x-datadog-signature", async () => {
    environment.DATADOG_WEBHOOK_SECRET = "secret";
    const body = '{"x":1}';
    const sig = await hmacHex("secret", body);
    const req = new Request("https://kit.test/", {
      method: "POST",
      headers: { "x-datadog-signature": sig },
    });
    expect(await verifyDatadogWebhook(req, body)).toBe(true);
  });

  it("rejects mismatched signature", async () => {
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

  it("fail-open in non-production when secret unset", async () => {
    environment.NODE_ENV = "development";
    const req = new Request("https://kit.test/");
    expect(await verifyDatadogWebhook(req, "body")).toBe(true);
  });

  it("fail-closed in production when secret unset", async () => {
    environment.NODE_ENV = "production";
    const req = new Request("https://kit.test/");
    expect(await verifyDatadogWebhook(req, "body")).toBe(false);
  });
});

describe("integrations/datadog — postDatadogEvent", () => {
  it("POSTs to the events API with DD-API-KEY header", async () => {
    environment.DATADOG_API_KEY = "ddkey";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ event: { id: 7 } }), { status: 200 }),
      );

    const result = await postDatadogEvent({
      title: "Evidence collected",
      text: "...",
      alertType: "info",
      tags: ["control:CC6.1"],
      aggregationKey: "k",
    });
    expect(result.id).toBe(7);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.datadoghq.com/api/v1/events");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("DD-API-KEY")).toBe("ddkey");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.title).toBe("Evidence collected");
    expect(body.aggregation_key).toBe("k");
  });

  it("uses DATADOG_SITE when set", async () => {
    environment.DATADOG_API_KEY = "ddkey";
    environment.DATADOG_SITE = "datadoghq.eu";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ event: { id: 1 } }), { status: 200 }),
      );
    await postDatadogEvent({ title: "t", text: "x" });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.datadoghq.eu/api/v1/events",
    );
  });

  it("throws on non-2xx", async () => {
    environment.DATADOG_API_KEY = "ddkey";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      postDatadogEvent({ title: "t", text: "x" }),
    ).rejects.toThrow(/Datadog/);
  });

  it("throws when DATADOG_API_KEY is unset", async () => {
    await expect(
      postDatadogEvent({ title: "t", text: "x" }),
    ).rejects.toThrow(/DATADOG_API_KEY/);
  });
});
