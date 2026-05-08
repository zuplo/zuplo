import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  parseReceiptFromUrl,
  parseReceiptFromBytes,
} from "../modules/integrations/mindee.ts";
import {
  postSlackMessage,
  defaultFinanceChannel,
} from "../modules/integrations/slack.ts";
import { sendResendEmail, defaultFrom } from "../modules/integrations/resend.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const MINDEE_OK = {
  document: {
    inference: {
      prediction: {
        total_amount: { value: 12.34, confidence: 0.95 },
        currency: { value: "USD", confidence: 0.99 },
        date: { value: "2024-05-01", confidence: 0.9 },
        supplier_name: { value: "Coffee Shop", confidence: 0.85 },
        category: { value: "meals", confidence: 0.7 },
        receipt_number: { value: "R-1", confidence: 0.5 },
      },
    },
  },
};

describe("integrations/mindee", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("MINDEE_API_KEY");
  });

  it("parseReceiptFromUrl POSTs FormData with auth and normalizes the response", async () => {
    setEnv("MINDEE_API_KEY", "mindee_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(MINDEE_OK), { status: 200 }));

    const result = await parseReceiptFromUrl("https://example.com/r.png");
    expect(result.merchant).toBe("Coffee Shop");
    expect(result.amountCents).toBe(1234);
    expect(result.currency).toBe("USD");
    expect(result.date).toBe("2024-05-01");
    expect(result.category).toBe("meals");
    expect(result.receiptNumber).toBe("R-1");
    expect(result.confidence).toBeGreaterThan(0.5);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict",
    );
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Token mindee_test");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("parseReceiptFromBytes POSTs a Blob in the form", async () => {
    setEnv("MINDEE_API_KEY", "mindee_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(MINDEE_OK), { status: 200 }));
    const bytes = new Uint8Array([1, 2, 3]);
    const result = await parseReceiptFromBytes({
      bytes,
      filename: "receipt.png",
      contentType: "image/png",
    });
    expect(result.merchant).toBe("Coffee Shop");
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("throws on non-2xx Mindee response", async () => {
    setEnv("MINDEE_API_KEY", "mindee_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    await expect(parseReceiptFromUrl("https://x.test/r.png")).rejects.toThrow(
      /Mindee predict failed/,
    );
  });

  it("throws when MINDEE_API_KEY is unset", async () => {
    clearEnv("MINDEE_API_KEY");
    await expect(parseReceiptFromUrl("https://x.test/r.png")).rejects.toThrow(
      /MINDEE_API_KEY/,
    );
  });
});

describe("integrations/slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_BOT_TOKEN");
    clearEnv("SLACK_FINANCE_CHANNEL");
  });

  it("POSTs chat.postMessage with bearer auth and JSON body", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1.2", channel: "C1" }), {
        status: 200,
      }),
    );
    const result = await postSlackMessage({
      channel: "#finance",
      text: "hello",
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "hi" } }],
    });
    expect(result.ok).toBe(true);
    expect(result.ts).toBe("1.2");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/chat.postMessage");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb-test");
    expect(headers.get("content-type")).toMatch(/application\/json/);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("#finance");
    expect(body.text).toBe("hello");
  });

  it("throws when Slack returns ok:false", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 200 }),
    );
    await expect(postSlackMessage({ channel: "x", text: "y" })).rejects.toThrow(
      /channel_not_found/,
    );
  });

  it("throws on HTTP non-2xx", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("oops", { status: 500 }),
    );
    await expect(postSlackMessage({ channel: "x", text: "y" })).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("throws when SLACK_BOT_TOKEN is unset", async () => {
    clearEnv("SLACK_BOT_TOKEN");
    await expect(postSlackMessage({ channel: "x", text: "y" })).rejects.toThrow(
      /SLACK_BOT_TOKEN/,
    );
  });

  it("defaultFinanceChannel returns env or default", () => {
    setEnv("SLACK_FINANCE_CHANNEL", "#money");
    expect(defaultFinanceChannel()).toBe("#money");
    clearEnv("SLACK_FINANCE_CHANNEL");
    expect(defaultFinanceChannel()).toBe("#finance");
  });
});

describe("integrations/resend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY");
    clearEnv("RESEND_FROM_EMAIL");
  });

  it("POSTs to /emails with bearer and JSON body", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    const result = await sendResendEmail({
      to: "x@y.com",
      from: "a@b.com",
      subject: "rejected",
      text: "see below",
    });
    expect(result.id).toBe("e1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.resend.com/emails");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("x@y.com");
  });

  it("throws on non-2xx", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      sendResendEmail({ to: "x", from: "y", subject: "z" }),
    ).rejects.toThrow(/Resend send failed/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    clearEnv("RESEND_API_KEY");
    await expect(
      sendResendEmail({ to: "x", from: "y", subject: "z" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("defaultFrom returns env or fallback", () => {
    setEnv("RESEND_FROM_EMAIL", "f@acme.com");
    expect(defaultFrom()).toBe("f@acme.com");
    clearEnv("RESEND_FROM_EMAIL");
    expect(defaultFrom()).toBe("expenses@example.com");
  });
});
