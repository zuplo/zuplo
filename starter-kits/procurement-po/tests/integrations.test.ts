import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { sendEnvelope, getEnvelope } from "../modules/integrations/docusign.ts";
import {
  postSlackMessage,
  lookupSlackUserByEmail,
  defaultProcurementChannel,
} from "../modules/integrations/slack.ts";
import { sendResendEmail, defaultFrom } from "../modules/integrations/resend.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

describe("integrations/docusign — sendEnvelope", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("DOCUSIGN_ACCESS_TOKEN");
    clearEnv("DOCUSIGN_BASE_URI");
    clearEnv("DOCUSIGN_ACCOUNT_ID");
  });

  it("POSTs to /accounts/:id/envelopes with bearer auth and full body", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_tok");
    setEnv("DOCUSIGN_BASE_URI", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "acct_1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ envelopeId: "env_1", status: "sent", uri: "/envelopes/env_1" }),
        { status: 201 },
      ),
    );
    const result = await sendEnvelope({
      emailSubject: "Sign PO",
      emailBody: "please sign",
      documentName: "PO-1.pdf",
      documentBase64: "AAAA",
      fileExtension: "pdf",
      signers: [{ email: "v@vendor.com", name: "Vendor Co" }],
      envelopeMetadata: { tenant_id: "t1", po_id: "po_1" },
    });
    expect(result.envelopeId).toBe("env_1");
    expect(result.status).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://demo.docusign.net/restapi/v2.1/accounts/acct_1/envelopes",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ds_tok");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.emailSubject).toBe("Sign PO");
    expect(body.documents[0].documentBase64).toBe("AAAA");
    expect(body.recipients.signers[0].email).toBe("v@vendor.com");
    expect(body.status).toBe("sent");
    expect(body.customFields.textCustomFields[0].name).toBe("tenant_id");
  });

  it("throws on non-2xx", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_tok");
    setEnv("DOCUSIGN_BASE_URI", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "acct_1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(
      sendEnvelope({
        emailSubject: "x", documentName: "y", documentBase64: "z",
        fileExtension: "pdf", signers: [{ email: "a@b", name: "A" }],
      }),
    ).rejects.toThrow(/DocuSign envelope create failed/);
  });

  it("throws when DOCUSIGN_ACCESS_TOKEN is unset", async () => {
    clearEnv("DOCUSIGN_ACCESS_TOKEN");
    setEnv("DOCUSIGN_BASE_URI", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "acct_1");
    await expect(
      sendEnvelope({
        emailSubject: "x", documentName: "y", documentBase64: "z",
        fileExtension: "pdf", signers: [{ email: "a@b", name: "A" }],
      }),
    ).rejects.toThrow(/DOCUSIGN_ACCESS_TOKEN/);
  });

  it("throws when DOCUSIGN_BASE_URI is unset", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_tok");
    clearEnv("DOCUSIGN_BASE_URI");
    setEnv("DOCUSIGN_ACCOUNT_ID", "acct_1");
    await expect(
      sendEnvelope({
        emailSubject: "x", documentName: "y", documentBase64: "z",
        fileExtension: "pdf", signers: [{ email: "a@b", name: "A" }],
      }),
    ).rejects.toThrow(/DOCUSIGN_BASE_URI/);
  });

  it("throws when DOCUSIGN_ACCOUNT_ID is unset", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_tok");
    setEnv("DOCUSIGN_BASE_URI", "https://demo.docusign.net");
    clearEnv("DOCUSIGN_ACCOUNT_ID");
    await expect(
      sendEnvelope({
        emailSubject: "x", documentName: "y", documentBase64: "z",
        fileExtension: "pdf", signers: [{ email: "a@b", name: "A" }],
      }),
    ).rejects.toThrow(/DOCUSIGN_ACCOUNT_ID/);
  });
});

describe("integrations/docusign — getEnvelope", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("DOCUSIGN_ACCESS_TOKEN");
    clearEnv("DOCUSIGN_BASE_URI");
    clearEnv("DOCUSIGN_ACCOUNT_ID");
  });

  it("GETs envelope by id with bearer", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_tok");
    setEnv("DOCUSIGN_BASE_URI", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "acct_1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          envelopeId: "env_1",
          status: "completed",
          statusChangedDateTime: "2024-05-01T00:00:00Z",
        }),
        { status: 200 },
      ),
    );
    const result = await getEnvelope("env_1");
    expect(result.status).toBe("completed");
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://demo.docusign.net/restapi/v2.1/accounts/acct_1/envelopes/env_1",
    );
  });

  it("throws on non-2xx", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_tok");
    setEnv("DOCUSIGN_BASE_URI", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "acct_1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 404 }));
    await expect(getEnvelope("env_missing")).rejects.toThrow(/DocuSign envelope get failed/);
  });

  it("throws when DOCUSIGN_ACCESS_TOKEN is unset", async () => {
    clearEnv("DOCUSIGN_ACCESS_TOKEN");
    setEnv("DOCUSIGN_BASE_URI", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "acct_1");
    await expect(getEnvelope("env_1")).rejects.toThrow(/DOCUSIGN_ACCESS_TOKEN/);
  });
});

describe("integrations/slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_BOT_TOKEN");
    clearEnv("SLACK_PROCUREMENT_CHANNEL");
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
      new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 200 }),
    );
    await expect(postSlackMessage({ channel: "C", text: "hi" })).rejects.toThrow(
      /channel_not_found/,
    );
  });

  it("postSlackMessage throws when SLACK_BOT_TOKEN unset", async () => {
    clearEnv("SLACK_BOT_TOKEN");
    await expect(postSlackMessage({ channel: "C", text: "hi" })).rejects.toThrow(/SLACK_BOT_TOKEN/);
  });

  it("lookupSlackUserByEmail returns user on ok response", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, user: { id: "U1" } }), { status: 200 }),
    );
    expect(await lookupSlackUserByEmail("a@b.com")).toEqual({ id: "U1" });
  });

  it("lookupSlackUserByEmail returns null on non-2xx", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    expect(await lookupSlackUserByEmail("a@b.com")).toBeNull();
  });

  it("lookupSlackUserByEmail throws when SLACK_BOT_TOKEN unset", async () => {
    clearEnv("SLACK_BOT_TOKEN");
    await expect(lookupSlackUserByEmail("a@b.com")).rejects.toThrow(/SLACK_BOT_TOKEN/);
  });

  it("defaultProcurementChannel reads env or returns #procurement", () => {
    setEnv("SLACK_PROCUREMENT_CHANNEL", "#proc");
    expect(defaultProcurementChannel()).toBe("#proc");
    clearEnv("SLACK_PROCUREMENT_CHANNEL");
    expect(defaultProcurementChannel()).toBe("#procurement");
  });
});

describe("integrations/resend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY");
    clearEnv("RESEND_FROM_EMAIL");
  });

  it("POSTs /emails with bearer + JSON body", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    const result = await sendResendEmail({
      to: "v@vendor.com",
      from: "p@you.com",
      subject: "PO",
      attachments: [{ filename: "PO.pdf", content: "BASE64" }],
    });
    expect(result.id).toBe("e1");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("v@vendor.com");
    expect(body.attachments[0].filename).toBe("PO.pdf");
  });

  it("throws on non-2xx", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
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

  it("defaultFrom reads env or returns placeholder", () => {
    setEnv("RESEND_FROM_EMAIL", "p@acme.com");
    expect(defaultFrom()).toBe("p@acme.com");
    clearEnv("RESEND_FROM_EMAIL");
    expect(defaultFrom()).toBe("procurement@example.com");
  });
});
