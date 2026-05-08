import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { evidenceRepository, type Evidence } from "../repositories/evidence.ts";
import { putEvidence } from "../integrations/r2.ts";
import { postDatadogEvent } from "../integrations/datadog.ts";

interface Body {
  controlId: string;
  kind: Evidence["kind"];
  title: string;
  description: string;
  /** Pre-existing URL when the artifact already lives somewhere. */
  fileUrl?: string;
  /** Or: inline base64-encoded bytes. We upload to R2 and compute sha256. */
  content?: string;
  contentType?: string;
  /** Pre-computed sha256, used when fileUrl is provided. */
  sha256?: string;
  collectedAt?: string;
  collectedBy: string;
  validUntil?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  let fileUrl = body.fileUrl ?? "";
  let sha256 = body.sha256 ?? "";

  // If inline content is provided, upload to R2 and use the resulting URL +
  // sha. The caller can also pass an external fileUrl + sha256 when the
  // artifact already lives elsewhere (e.g. SharePoint, GDrive).
  if (body.content) {
    const bytes = base64ToBytes(body.content);
    const key = `${tenantId}/${body.controlId}/${cryptoRandomKey()}`;
    const put = await putEvidence(key, bytes, { contentType: body.contentType });
    fileUrl = put.url;
    sha256 = put.sha256;
  }
  if (!fileUrl || !sha256) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "either { fileUrl + sha256 } or { content } must be provided",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const created = await evidenceRepository.create(tenantId, {
    controlId: body.controlId,
    kind: body.kind,
    title: body.title,
    description: body.description,
    fileUrl,
    sha256,
    collectedAt: body.collectedAt ?? new Date().toISOString(),
    collectedBy: body.collectedBy,
    validUntil: body.validUntil ?? null,
    status: "current",
    createdAt: new Date().toISOString(),
  });

  // Mirror to Datadog as an event. Failures don't fail the submit.
  try {
    await postDatadogEvent({
      title: `Evidence collected: ${created.title}`,
      text: `Control ${created.controlId} — ${created.kind}\nsha256=${created.sha256}\nurl=${created.fileUrl}`,
      alertType: "info",
      tags: [
        `tenant:${tenantId}`,
        `control:${created.controlId}`,
        `kind:${created.kind}`,
      ],
      aggregationKey: `evidence:${created.id}`,
    });
  } catch (err) {
    context.log.warn(`Datadog event mirror failed: ${(err as Error).message}`);
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function cryptoRandomKey(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
